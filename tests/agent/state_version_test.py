"""Regression tests for OPT-029 Layer B / E35: optimistic locking on user state.

PUT /api/state echoes the version the client last loaded (X-State-Version).
The server only overwrites when the stored version still matches; otherwise it
returns 409 with the current server state so a stale tab/device can't silently
clobber a newer save.
"""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


class StateVersionUnitTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server._WAL_INITIALIZED = False
        app_server.init_db()
        self.conn = app_server.get_conn()
        self.user_id = "user-v"
        now = app_server.now_iso()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            (self.user_id, "v", "x", now),
        )
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            (self.user_id, json.dumps({"books": [], "sessions": [], "quotes": [],
                                       "chatHistories": {}}), now),
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()
        self.temp_dir.cleanup()

    def test_save_state_bumps_version(self):
        v0 = app_server.state_version(self.conn, self.user_id)
        app_server.save_state(self.conn, self.user_id, {"books": [{"id": "b1", "title": "T"}]})
        v1 = app_server.state_version(self.conn, self.user_id)
        self.assertNotEqual(v0, v1)
        self.assertTrue(v1.endswith("Z"), f"version should be UTC-Z: {v1}")

    def test_checked_save_succeeds_on_matching_version(self):
        v0 = app_server.state_version(self.conn, self.user_id)
        state, v1 = app_server.save_state_checked(
            self.conn, self.user_id, {"books": [{"id": "b1", "title": "T"}]}, v0)
        self.assertEqual(len(state["books"]), 1)
        self.assertNotEqual(v0, v1)
        self.assertEqual(v1, app_server.state_version(self.conn, self.user_id))

    def test_checked_save_conflict_on_stale_version(self):
        v0 = app_server.state_version(self.conn, self.user_id)
        # A concurrent writer advances the version.
        app_server.save_state(self.conn, self.user_id, {"books": [{"id": "concurrent", "title": "C"}]})
        with self.assertRaises(app_server.StateVersionConflict) as ctx:
            app_server.save_state_checked(
                self.conn, self.user_id, {"books": [{"id": "stale", "title": "S"}]}, v0)
        # The conflict carries the current server truth, not the stale write.
        self.assertEqual(ctx.exception.current_state["books"][0]["id"], "concurrent")
        self.assertEqual(ctx.exception.current_version,
                         app_server.state_version(self.conn, self.user_id))
        # The stale write must NOT have applied.
        stored = app_server.load_state(self.conn, self.user_id)
        self.assertEqual(stored["books"][0]["id"], "concurrent")


class StateVersionEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server._WAL_INITIALIZED = False
        app_server.init_db()
        conn = app_server.get_conn()
        now = app_server.now_iso()
        self.user_id = "user-e"
        self.token = "tok-e"
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            (self.user_id, "e", "x", now),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            (self.token, self.user_id, now, now),
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            (self.user_id, json.dumps({"books": [], "sessions": [], "quotes": [],
                                       "chatHistories": {}}), now),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _request(self, method, path, payload=None, version=None):
        body = json.dumps(payload or {}).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body)),
                   "Authorization": f"Bearer {self.token}"}
        if version is not None:
            headers["X-State-Version"] = version
        h = app_server.Handler.__new__(app_server.Handler)
        h.path = path
        h.command = method
        h.headers = headers
        h.client_address = ("127.0.0.1", 0)
        h.rfile = BytesIO(body)
        h.wfile = BytesIO()
        h._status_code = None
        h.send_response = lambda c: setattr(h, "_status_code", c)
        h.send_header = lambda *a, **k: None
        h.end_headers = lambda: None
        if method == "GET":
            h.do_GET()
        elif method == "PUT":
            h.do_PUT()
        data = json.loads(h.wfile.getvalue().decode())
        return h._status_code, data

    def test_session_returns_state_version(self):
        status, data = self._request("GET", "/api/session")
        self.assertEqual(status, 200)
        self.assertIn("stateVersion", data)
        self.assertTrue(data["stateVersion"])

    def test_put_with_matching_version_succeeds(self):
        _, sess = self._request("GET", "/api/session")
        v = sess["stateVersion"]
        status, data = self._request("PUT", "/api/state",
                                     {"books": [{"id": "b1", "title": "T"}]}, version=v)
        self.assertEqual(status, 200)
        self.assertEqual(len(data["state"]["books"]), 1)
        self.assertIn("stateVersion", data)
        self.assertNotEqual(data["stateVersion"], v)

    def test_put_with_stale_version_returns_409(self):
        _, sess = self._request("GET", "/api/session")
        stale = sess["stateVersion"]
        # First save advances the version.
        self._request("PUT", "/api/state", {"books": [{"id": "first", "title": "1"}]}, version=stale)
        # Second save with the now-stale version must conflict.
        status, data = self._request("PUT", "/api/state",
                                     {"books": [{"id": "second", "title": "2"}]}, version=stale)
        self.assertEqual(status, 409)
        self.assertEqual(data["error"], "state_conflict")
        self.assertEqual(data["state"]["books"][0]["id"], "first")
        self.assertIn("stateVersion", data)

    def test_put_without_version_is_unchecked(self):
        # Legacy clients that send no X-State-Version keep last-write-wins.
        status, data = self._request("PUT", "/api/state",
                                     {"books": [{"id": "b1", "title": "T"}]})
        self.assertEqual(status, 200)
        self.assertIn("stateVersion", data)


if __name__ == "__main__":
    unittest.main()
