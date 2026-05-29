"""Regression tests for SQLite tuning (P3 commercialization).

Confirms get_conn() activates WAL mode and other production PRAGMAs the first
time it's used, and that they persist across new connections."""
import tempfile
import unittest
from pathlib import Path

import app_server


class SqliteWalTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        # Reset module-level WAL gate so each test sees a fresh init
        app_server._WAL_INITIALIZED = False
        app_server.init_db()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_journal_mode_is_wal_after_first_connection(self):
        conn = app_server.get_conn()
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        conn.close()
        self.assertEqual(mode.lower(), "wal",
                         "first connection should leave the DB in WAL mode")

    def test_wal_persists_across_new_connections(self):
        # First conn activates WAL
        c1 = app_server.get_conn()
        c1.close()
        # Subsequent conn should observe WAL mode without explicitly setting it
        c2 = app_server.get_conn()
        mode = c2.execute("PRAGMA journal_mode").fetchone()[0]
        c2.close()
        self.assertEqual(mode.lower(), "wal")

    def test_synchronous_is_normal(self):
        conn = app_server.get_conn()
        sync = conn.execute("PRAGMA synchronous").fetchone()[0]
        conn.close()
        # NORMAL = 1
        self.assertEqual(int(sync), 1, "synchronous should be NORMAL (1)")

    def test_busy_timeout_is_nonzero(self):
        conn = app_server.get_conn()
        bt = conn.execute("PRAGMA busy_timeout").fetchone()[0]
        conn.close()
        self.assertGreater(int(bt), 0)


if __name__ == "__main__":
    unittest.main()
