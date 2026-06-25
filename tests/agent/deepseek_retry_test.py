import json
import socket
import sys
import time
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

import app_server


class DeepseekRetryTest(unittest.TestCase):
    """Tests for call_deepseek() retry logic (OPT-012)."""

    def _make_http_error(self, code: int, body: bytes = b"") -> HTTPError:
        fp = MagicMock()
        fp.read.return_value = body
        return HTTPError(url="https://api.deepseek.com", code=code, msg="", hdrs={}, fp=fp)

    def _make_url_error_timeout(self) -> URLError:
        err = URLError(reason=TimeoutError("timed out"))
        return err

    def _make_ok_response(self, content: str = "hello"):
        resp = MagicMock()
        resp.__enter__ = lambda s: s
        resp.__exit__ = MagicMock(return_value=False)
        resp.read.return_value = (
            '{"choices":[{"message":{"content":"' + content + '"}}]}'
        ).encode("utf-8")
        return resp

    # --- success on first attempt ---

    def test_success_no_retry(self):
        ok = self._make_ok_response("result")
        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", return_value=ok
        ) as mock_open:
            result = app_server.call_deepseek([{"role": "user", "content": "hi"}])
        self.assertEqual(result, "result")
        self.assertEqual(mock_open.call_count, 1)

    # --- retryable HTTP codes ---

    def test_retries_on_429(self):
        err = self._make_http_error(429)
        ok = self._make_ok_response("ok after retry")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise err
            return ok

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            result = app_server.call_deepseek([{"role": "user", "content": "hi"}])

        self.assertEqual(result, "ok after retry")
        self.assertEqual(call_count, 2)

    def test_retries_on_503(self):
        err = self._make_http_error(503)
        ok = self._make_ok_response("recovered")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise err
            return ok

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            result = app_server.call_deepseek([{"role": "user", "content": "hi"}])

        self.assertEqual(result, "recovered")
        self.assertEqual(call_count, 3)

    def test_retries_on_500(self):
        err = self._make_http_error(500)
        ok = self._make_ok_response("ok")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise err
            return ok

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            result = app_server.call_deepseek([{"role": "user", "content": "hi"}])

        self.assertEqual(result, "ok")
        self.assertEqual(call_count, 2)

    # --- exhausted retries raise ---

    def test_raises_after_max_attempts_429(self):
        err = self._make_http_error(429, b"rate limited")
        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=err
        ), patch("app_server.time.sleep"):
            with self.assertRaises(RuntimeError) as ctx:
                app_server.call_deepseek([{"role": "user", "content": "hi"}])
        self.assertIn("rate limited", str(ctx.exception))

    def test_raises_after_max_attempts_503(self):
        err = self._make_http_error(503)
        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=err
        ), patch("app_server.time.sleep"):
            with self.assertRaises(RuntimeError):
                app_server.call_deepseek([{"role": "user", "content": "hi"}])

    # --- non-retryable HTTP codes raise immediately ---

    def test_no_retry_on_401(self):
        err = self._make_http_error(401, b"unauthorized")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            raise err

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            with self.assertRaises(RuntimeError):
                app_server.call_deepseek([{"role": "user", "content": "hi"}])

        self.assertEqual(call_count, 1)

    def test_no_retry_on_400(self):
        err = self._make_http_error(400, b"bad request")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            raise err

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            with self.assertRaises(RuntimeError):
                app_server.call_deepseek([{"role": "user", "content": "hi"}])

        self.assertEqual(call_count, 1)

    # --- URLError timeout retries ---

    def test_retries_on_url_error_timeout(self):
        err = self._make_url_error_timeout()
        ok = self._make_ok_response("timeout then ok")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise err
            return ok

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            result = app_server.call_deepseek([{"role": "user", "content": "hi"}])

        self.assertEqual(result, "timeout then ok")
        self.assertEqual(call_count, 2)

    # --- no key raises immediately ---

    def test_raises_without_api_key(self):
        with patch("app_server.DEEPSEEK_API_KEY", ""):
            with self.assertRaises(RuntimeError) as ctx:
                app_server.call_deepseek([{"role": "user", "content": "hi"}])
        self.assertIn("DEEPSEEK_API_KEY", str(ctx.exception))

    # --- sleep is called between retries ---

    def test_sleep_called_between_retries(self):
        err = self._make_http_error(503)
        ok = self._make_ok_response("ok")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise err
            return ok

        sleep_calls = []
        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep", side_effect=lambda s: sleep_calls.append(s)):
            app_server.call_deepseek([{"role": "user", "content": "hi"}])

        self.assertEqual(len(sleep_calls), 1)
        self.assertGreaterEqual(sleep_calls[0], 1)

    # --- bare socket/read timeout (not wrapped in URLError) retries ---

    def test_retries_on_bare_timeout(self):
        ok = self._make_ok_response("ok after bare timeout")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise socket.timeout("timed out")
            return ok

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            result = app_server.call_deepseek([{"role": "user", "content": "hi"}])

        self.assertEqual(result, "ok after bare timeout")
        self.assertEqual(call_count, 2)

    def test_raises_after_max_attempts_bare_timeout(self):
        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=socket.timeout("timed out")
        ), patch("app_server.time.sleep"):
            with self.assertRaises(RuntimeError) as ctx:
                app_server.call_deepseek([{"role": "user", "content": "hi"}])
        self.assertIn("超时", str(ctx.exception))

    # --- 502 is in the retryable set ---

    def test_retries_on_502(self):
        err = self._make_http_error(502)
        ok = self._make_ok_response("ok")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise err
            return ok

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            result = app_server.call_deepseek([{"role": "user", "content": "hi"}])

        self.assertEqual(result, "ok")
        self.assertEqual(call_count, 2)


class DeepseekStreamRetryTest(unittest.TestCase):
    """Tests for call_deepseek_stream() retry logic (OPT-069)."""

    def _make_http_error(self, code: int, body: bytes = b"") -> HTTPError:
        fp = MagicMock()
        fp.read.return_value = body
        return HTTPError(url="https://api.deepseek.com", code=code, msg="", hdrs={}, fp=fp)

    def _make_url_error_timeout(self) -> URLError:
        return URLError(reason=TimeoutError("timed out"))

    def _make_stream_response(self, chunks=("hello", " world")):
        """Build a mock streaming response that yields SSE lines."""
        lines = []
        for chunk in chunks:
            payload = json.dumps({"choices": [{"delta": {"content": chunk}, "finish_reason": None}]})
            lines.append(f"data: {payload}\n".encode("utf-8"))
        lines.append(b"data: [DONE]\n")

        resp = MagicMock()
        resp.__enter__ = lambda s: s
        resp.__exit__ = MagicMock(return_value=False)
        resp.__iter__ = lambda s: iter(lines)
        return resp

    def _collect(self, gen):
        return list(gen)

    # --- success on first attempt ---

    def test_stream_success_no_retry(self):
        resp = self._make_stream_response(("hello",))
        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", return_value=resp
        ) as mock_open:
            result = self._collect(app_server.call_deepseek_stream([{"role": "user", "content": "hi"}]))
        self.assertEqual(result, ["hello"])
        self.assertEqual(mock_open.call_count, 1)

    # --- retryable HTTP codes ---

    def test_stream_retries_on_429(self):
        err = self._make_http_error(429)
        resp = self._make_stream_response(("ok",))
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise err
            return resp

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            result = self._collect(app_server.call_deepseek_stream([{"role": "user", "content": "hi"}]))

        self.assertEqual(result, ["ok"])
        self.assertEqual(call_count, 2)

    def test_stream_retries_on_503(self):
        err = self._make_http_error(503)
        resp = self._make_stream_response(("recovered",))
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise err
            return resp

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            result = self._collect(app_server.call_deepseek_stream([{"role": "user", "content": "hi"}]))

        self.assertEqual(result, ["recovered"])
        self.assertEqual(call_count, 3)

    # --- exhausted retries raise ---

    def test_stream_raises_after_max_attempts_429(self):
        err = self._make_http_error(429, b"rate limited")
        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=err
        ), patch("app_server.time.sleep"):
            with self.assertRaises(RuntimeError) as ctx:
                self._collect(app_server.call_deepseek_stream([{"role": "user", "content": "hi"}]))
        self.assertIn("rate limited", str(ctx.exception))

    def test_stream_raises_after_max_attempts_503(self):
        err = self._make_http_error(503)
        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=err
        ), patch("app_server.time.sleep"):
            with self.assertRaises(RuntimeError):
                self._collect(app_server.call_deepseek_stream([{"role": "user", "content": "hi"}]))

    # --- non-retryable codes raise immediately ---

    def test_stream_no_retry_on_401(self):
        err = self._make_http_error(401, b"unauthorized")
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            raise err

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            with self.assertRaises(RuntimeError):
                self._collect(app_server.call_deepseek_stream([{"role": "user", "content": "hi"}]))

        self.assertEqual(call_count, 1)

    # --- URLError timeout retries ---

    def test_stream_retries_on_url_error_timeout(self):
        err = self._make_url_error_timeout()
        resp = self._make_stream_response(("after timeout",))
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise err
            return resp

        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep"):
            result = self._collect(app_server.call_deepseek_stream([{"role": "user", "content": "hi"}]))

        self.assertEqual(result, ["after timeout"])
        self.assertEqual(call_count, 2)

    # --- sleep is called between retries ---

    def test_stream_sleep_called_between_retries(self):
        err = self._make_http_error(503)
        resp = self._make_stream_response(("ok",))
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise err
            return resp

        sleep_calls = []
        with patch("app_server.DEEPSEEK_API_KEY", "sk-test"), patch(
            "app_server.urlopen", side_effect=side_effect
        ), patch("app_server.time.sleep", side_effect=lambda s: sleep_calls.append(s)):
            self._collect(app_server.call_deepseek_stream([{"role": "user", "content": "hi"}]))

        self.assertEqual(len(sleep_calls), 1)
        self.assertGreaterEqual(sleep_calls[0], 1)


if __name__ == "__main__":
    unittest.main()
