"""Tests for the GC background thread wired up in main() (OPT-010)."""
import tempfile
import threading
import time
import unittest
from pathlib import Path

import app_server


class GcThreadTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_run_gc_calls_all_four_helpers(self):
        """_run_gc must invoke all four GC functions at least once."""
        called = []

        def _fake_gc(name):
            def _inner(conn, **kw):
                called.append(name)
                return 0
            return _inner

        orig_sessions = app_server.gc_expired_sessions
        orig_tokens = app_server.gc_expired_password_reset_tokens
        orig_errors = app_server.gc_old_server_errors
        orig_rate = app_server.gc_old_rate_limit_rows

        app_server.gc_expired_sessions = _fake_gc("sessions")
        app_server.gc_expired_password_reset_tokens = _fake_gc("tokens")
        app_server.gc_old_server_errors = _fake_gc("errors")
        app_server.gc_old_rate_limit_rows = _fake_gc("rate")

        orig_interval = app_server._GC_INTERVAL_SECONDS
        # Make the loop exit after one iteration by injecting a very short interval,
        # and override time.sleep inside _run_gc to not actually wait.
        app_server._GC_INTERVAL_SECONDS = 0

        import time as _time_mod
        orig_sleep = _time_mod.sleep

        sleep_calls = []

        def _fast_sleep(seconds):
            sleep_calls.append(seconds)
            if len(sleep_calls) >= 2:
                # First sleep is startup delay; second is the loop interval.
                # Raise to break out of the infinite loop.
                raise _StopGC()

        _time_mod.sleep = _fast_sleep

        class _StopGC(Exception):
            pass

        try:
            try:
                app_server._run_gc()
            except _StopGC:
                pass
        finally:
            app_server.gc_expired_sessions = orig_sessions
            app_server.gc_expired_password_reset_tokens = orig_tokens
            app_server.gc_old_server_errors = orig_errors
            app_server.gc_old_rate_limit_rows = orig_rate
            app_server._GC_INTERVAL_SECONDS = orig_interval
            _time_mod.sleep = orig_sleep

        self.assertIn("sessions", called, "gc_expired_sessions must be called")
        self.assertIn("tokens", called, "gc_expired_password_reset_tokens must be called")
        self.assertIn("errors", called, "gc_old_server_errors must be called")
        self.assertIn("rate", called, "gc_old_rate_limit_rows must be called")

    def test_run_gc_closes_connection_even_on_error(self):
        """_run_gc must not leak connections even when a GC helper raises."""
        closed = []

        import sqlite3

        orig_get_conn = app_server.get_conn

        class _TrackedConn:
            """Thin wrapper that tracks close() calls."""
            def __init__(self, inner):
                self._inner = inner

            def close(self):
                closed.append(True)
                self._inner.close()

            def __getattr__(self, name):
                return getattr(self._inner, name)

        def _patched_get_conn():
            return _TrackedConn(orig_get_conn())

        app_server.get_conn = _patched_get_conn

        orig_sessions = app_server.gc_expired_sessions

        def _raising_gc(conn, **kw):
            raise RuntimeError("simulated failure")

        app_server.gc_expired_sessions = _raising_gc

        import time as _time_mod
        orig_sleep = _time_mod.sleep
        sleep_calls = []

        class _StopGC(Exception):
            pass

        def _fast_sleep(seconds):
            sleep_calls.append(seconds)
            # Skip the startup delay (first call); stop after the loop interval.
            if len(sleep_calls) >= 2:
                raise _StopGC()

        _time_mod.sleep = _fast_sleep

        try:
            try:
                app_server._run_gc()
            except _StopGC:
                pass
        finally:
            app_server.get_conn = orig_get_conn
            app_server.gc_expired_sessions = orig_sessions
            _time_mod.sleep = orig_sleep

        self.assertTrue(len(closed) > 0, "connection must be closed even when GC helper raises")

    def test_gc_thread_constant_is_6_hours(self):
        self.assertEqual(app_server._GC_INTERVAL_SECONDS, 6 * 3600)


if __name__ == "__main__":
    unittest.main()
