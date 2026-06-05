"""Regression test for OPT-023: /media/ route must NOT emit Access-Control-Allow-Origin.

User-uploaded images (book covers, quote photos) are private. The wildcard CORS
header was removed so third-party sites cannot cross-origin hot-link them.
"""
import http.client
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

import app_server


class MediaCorsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(cls.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

        # Create a dummy image so the route serves a real 200.
        user_dir = app_server.UPLOAD_DIR / "user-abc"
        user_dir.mkdir(parents=True)
        (user_dir / "cover.jpg").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 16)

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), app_server.Handler)
        cls.host, cls.port = cls.server.server_address
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.temp_dir.cleanup()

    def _get(self, path: str):
        conn = http.client.HTTPConnection(self.host, self.port, timeout=10)
        try:
            conn.request("GET", path)
            resp = conn.getresponse()
            resp.read()
            headers = {k.lower(): v for k, v in resp.getheaders()}
            return resp.status, headers
        finally:
            conn.close()

    def test_media_returns_200(self):
        status, _ = self._get("/media/user-abc/cover.jpg")
        self.assertEqual(status, 200)

    def test_media_has_no_cors_wildcard(self):
        """OPT-023: Access-Control-Allow-Origin must be absent from /media/ responses."""
        _, headers = self._get("/media/user-abc/cover.jpg")
        self.assertNotIn(
            "access-control-allow-origin",
            headers,
            "/media/ must not expose a CORS wildcard — private user images should not be cross-origin readable",
        )

    def test_media_has_content_type(self):
        _, headers = self._get("/media/user-abc/cover.jpg")
        self.assertIn("image/", headers.get("content-type", ""))

    def test_media_404_on_missing_file(self):
        status, _ = self._get("/media/user-abc/nonexistent.jpg")
        self.assertEqual(status, 404)

    def test_media_404_on_path_traversal(self):
        status, _ = self._get("/media/../etc/passwd")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
