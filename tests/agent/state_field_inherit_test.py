"""Regression tests for the schema-upgrade clobber bug (lost confirmed memories).

A client loaded before a schema upgrade carries a *fresh* version token (apiFetch
auto-captures stateVersion from any response) but a state object missing newer
top-level keys. Its full PUT then passed the optimistic-lock check and wiped the
new fields server-side — this is how a confirmed memory was lost on 2026-08-10.

save_state_checked now inherits server-side values for top-level keys the
payload omits. An explicitly present key (even []) still wins.
"""
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

import app_server


MEMORY = {
    "id": "memory-1",
    "kind": "goal",
    "content": "从细节区分书的质量，建立自己的审美和品味",
    "sourceContext": {"type": "global"},
    "status": "confirmed",
    "createdAt": "2026-08-09T12:00:00.000Z",
    "updatedAt": "2026-08-09T12:00:00.000Z",
}


def _seed_state(state_json: dict, now: str) -> None:
    conn = app_server.get_conn()
    conn.execute(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
        ("user-inherit", "inherit", "x", now),
    )
    conn.execute(
        "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
        ("user-inherit", json.dumps(state_json, ensure_ascii=False), now),
    )
    conn.commit()
    conn.close()


class StateFieldInheritUnitTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server._WAL_INITIALIZED = False
        app_server.init_db()
        _seed_state({
            "books": [], "sessions": [], "quotes": [], "chatHistories": {},
            "memories": [MEMORY],
        }, app_server.now_iso())
        self.conn = app_server.get_conn()
        self.user_id = "user-inherit"

    def tearDown(self):
        self.conn.close()
        self.temp_dir.cleanup()

    def test_old_schema_payload_keeps_server_memories(self):
        """Payload without a `memories` key (pre-upgrade client) must not wipe it."""
        v0 = app_server.state_version(self.conn, self.user_id)
        # Old client edits a quote; its state object has no memories key.
        old_client_state = {
            "books": [], "sessions": [], "quotes": [{"id": "q1", "content": "c", "kind": "quote"}],
            "chatHistories": {},
        }
        state, v1 = app_server.save_state_checked(self.conn, self.user_id, old_client_state, v0)
        self.assertEqual(len(state["memories"]), 1)
        self.assertEqual(state["memories"][0]["content"], MEMORY["content"])
        self.assertNotEqual(v0, v1)

    def test_explicit_empty_memories_still_clears(self):
        """An explicitly present empty list is a deliberate clear and wins."""
        v0 = app_server.state_version(self.conn, self.user_id)
        state, _ = app_server.save_state_checked(
            self.conn, self.user_id,
            {"books": [], "sessions": [], "quotes": [], "chatHistories": {}, "memories": []},
            v0)
        self.assertEqual(state["memories"], [])

    def test_missing_keys_inherit_but_present_keys_win(self):
        v0 = app_server.state_version(self.conn, self.user_id)
        payload = {"books": [{"id": "b1", "title": "T"}]}
        state, _ = app_server.save_state_checked(self.conn, self.user_id, payload, v0)
        # Present key: client value. Missing keys: server values.
        self.assertEqual(len(state["books"]), 1)
        self.assertEqual(len(state["memories"]), 1)
        self.assertEqual(len(state["quotes"]), 0)
        self.assertIn("chatHistories", state)

    def test_stale_version_conflict_does_not_apply_inherited_values(self):
        v0 = app_server.state_version(self.conn, self.user_id)
        app_server.save_state(self.conn, self.user_id, {
            "books": [{"id": "concurrent", "title": "C"}], "memories": [MEMORY],
        })
        with self.assertRaises(app_server.StateVersionConflict):
            app_server.save_state_checked(
                self.conn, self.user_id,
                {"books": [{"id": "stale", "title": "S"}]}, v0)
        stored = app_server.load_state(self.conn, self.user_id)
        self.assertEqual(stored["books"][0]["id"], "concurrent")
        self.assertEqual(len(stored["memories"]), 1)


class StateFieldInheritEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server._WAL_INITIALIZED = False
        app_server.init_db()
        now = app_server.now_iso()
        conn = app_server.get_conn()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            ("user-e2", "e2", "x", now),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            ("tok-e2", "user-e2", now, now),
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            ("user-e2", json.dumps({
                "books": [], "sessions": [], "quotes": [], "chatHistories": {},
                "memories": [MEMORY],
            }, ensure_ascii=False), now),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _request(self, method, path, payload=None, version=None):
        body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body)),
                   "Authorization": "Bearer tok-e2"}
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

    def test_put_from_old_schema_client_preserves_memories(self):
        _, sess = self._request("GET", "/api/session")
        v = sess["stateVersion"]
        # Old client's full PUT: fresh version, but no memories key at all.
        status, data = self._request("PUT", "/api/state", {
            "books": [], "sessions": [], "quotes": [{"id": "q1", "content": "c", "kind": "quote"}],
            "chatHistories": {},
        }, version=v)
        self.assertEqual(status, 200)
        self.assertEqual(len(data["state"]["memories"]), 1)
        self.assertEqual(data["state"]["memories"][0]["content"], MEMORY["content"])


if __name__ == "__main__":
    unittest.main()
