"""Regression test for OPT-029 (Layer A): ActionExecutor.execute_action() must
be atomic. Two concurrent approvals (e.g. two browser tabs) must not silently
overwrite each other's state mutations.

Before the fix, execute_action() did `load_state -> mutate -> save_state` with
no write lock: both executions read the same initial state and the second save
clobbered the first, losing a book/note with no error. Wrapping the cycle in
`BEGIN IMMEDIATE` serializes the two so the second reads the first's committed
result.
"""
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app_server


class ActionExecutorAtomicTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server._WAL_INITIALIZED = False  # force WAL + busy_timeout re-init
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self.user_id = "user-atomic"
        conn = app_server.get_conn()
        now = app_server.now_iso()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?,?,?,?)",
            (self.user_id, "atomic", "x", now),
        )
        conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            (self.user_id, json.dumps({
                "books": [{"id": "book-1", "title": "Seed", "author": "A", "tags": [], "notes": ""}],
                "sessions": [], "quotes": [], "chatHistories": {},
            }), now),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _approved_add_book(self, title):
        return {
            "id": f"act-{title}",
            "type": "add_book",
            "data": {"title": title, "author": "A"},
            "status": app_server.ACTION_STATUS_APPROVED,
        }

    def _approved_add_note(self, content):
        return {
            "id": f"act-{content}",
            "type": "add_note",
            "data": {"bookId": "book-1", "content": content, "tags": []},
            "status": app_server.ACTION_STATUS_APPROVED,
        }

    def _load_books(self):
        conn = app_server.get_conn()
        state = app_server.load_state(conn, self.user_id)
        conn.close()
        return {b["title"] for b in state["books"]}

    def _load_note_contents(self):
        conn = app_server.get_conn()
        state = app_server.load_state(conn, self.user_id)
        conn.close()
        return {q["content"] for q in state["quotes"]}

    def test_concurrent_add_book_approvals_dont_lose_data(self):
        # Two threads, each with its own connection, approve a distinct add_book
        # at the same time. With the BEGIN IMMEDIATE guard both must survive.
        barrier = threading.Barrier(2)
        errors = []

        def worker(title):
            try:
                conn = app_server.get_conn()
                try:
                    barrier.wait()  # maximize the chance of a real interleave
                    result = app_server.ActionExecutor().execute_action(
                        conn, self.user_id, self._approved_add_book(title)
                    )
                    if not result.success:
                        errors.append(f"{title}: {result.error_message}")
                finally:
                    conn.close()
            except Exception as exc:  # pragma: no cover - surfaced via assert
                errors.append(f"{title}: {exc!r}")

        threads = [threading.Thread(target=worker, args=(t,)) for t in ("B2", "B3")]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=20)

        self.assertEqual(errors, [], f"executions errored: {errors}")
        titles = self._load_books()
        # The seed plus BOTH concurrently-added books must be present.
        self.assertEqual(titles, {"Seed", "B2", "B3"},
                         f"a concurrent mutation was lost: {titles}")

    def test_repeated_concurrent_rounds_are_stable(self):
        # Many rounds to catch a flaky last-write-wins regression. Uses add_note
        # (quotes are uncapped) so the free-plan 10-book cap can't mask a loss.
        for i in range(15):
            barrier = threading.Barrier(2)

            def worker(content):
                conn = app_server.get_conn()
                try:
                    barrier.wait()
                    app_server.ActionExecutor().execute_action(
                        conn, self.user_id, self._approved_add_note(content)
                    )
                finally:
                    conn.close()

            a, b = f"R{i}a", f"R{i}b"
            threads = [threading.Thread(target=worker, args=(c,)) for c in (a, b)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=20)
            notes = self._load_note_contents()
            self.assertIn(a, notes, f"round {i}: {a} lost ({len(notes)} notes)")
            self.assertIn(b, notes, f"round {i}: {b} lost ({len(notes)} notes)")


if __name__ == "__main__":
    unittest.main()
