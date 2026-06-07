"""Tests for secondary indexes on the observability tables (OPT-017 / OPT-025).

The /debug/logs queries previously did full table scans on model_logs,
agent_traces, agent_actions and agent_metrics. init_db() now creates
secondary indexes so those hot queries stay sub-linear.
OPT-025 adds the missing index on agent_trace_events(trace_id, created_at)
used by get_trace() which was left out of the OPT-017 batch.
"""
import tempfile
import unittest
from pathlib import Path

import app_server


EXPECTED_INDEXES = {
    "idx_model_logs_user_created",
    "idx_agent_metrics_user",
    "idx_agent_actions_trace",
    "idx_agent_traces_user_created",
    "idx_trace_events_trace",
}


class DbIndexTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _index_names(self):
        conn = app_server.get_conn()
        try:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index'"
            ).fetchall()
        finally:
            conn.close()
        return {row["name"] for row in rows}

    def test_observability_indexes_created(self):
        """All four OPT-017 indexes must exist after init_db()."""
        names = self._index_names()
        missing = EXPECTED_INDEXES - names
        self.assertFalse(
            missing, f"missing observability indexes: {sorted(missing)}"
        )

    def test_init_db_is_idempotent(self):
        """Re-running init_db() must not fail (IF NOT EXISTS)."""
        app_server.init_db()
        names = self._index_names()
        self.assertTrue(EXPECTED_INDEXES.issubset(names))

    def test_model_logs_query_uses_index(self):
        """The hot list_logs() query must use an index, not scan the table."""
        conn = app_server.get_conn()
        try:
            plan = conn.execute(
                "EXPLAIN QUERY PLAN "
                "SELECT * FROM model_logs WHERE user_id = ? "
                "ORDER BY created_at DESC LIMIT 30",
                ("u1",),
            ).fetchall()
        finally:
            conn.close()
        plan_text = " ".join(str(tuple(row)) for row in plan)
        self.assertIn("idx_model_logs_user_created", plan_text)
        self.assertNotIn("SCAN model_logs", plan_text)

    def test_agent_metrics_query_uses_index(self):
        """summarize_metrics() filters agent_metrics by user_id."""
        conn = app_server.get_conn()
        try:
            plan = conn.execute(
                "EXPLAIN QUERY PLAN "
                "SELECT * FROM agent_metrics WHERE user_id = ?",
                ("u1",),
            ).fetchall()
        finally:
            conn.close()
        plan_text = " ".join(str(tuple(row)) for row in plan)
        self.assertIn("idx_agent_metrics_user", plan_text)

    def test_trace_events_index_created(self):
        """OPT-025: idx_trace_events_trace must exist after init_db()."""
        self.assertIn("idx_trace_events_trace", self._index_names())

    def test_trace_events_query_uses_index(self):
        """get_trace() queries agent_trace_events by trace_id ORDER BY created_at — must use the new index."""
        conn = app_server.get_conn()
        try:
            plan = conn.execute(
                "EXPLAIN QUERY PLAN "
                "SELECT event_id, event_type, metadata, created_at "
                "FROM agent_trace_events WHERE trace_id = ? ORDER BY created_at ASC",
                ("t1",),
            ).fetchall()
        finally:
            conn.close()
        plan_text = " ".join(str(tuple(row)) for row in plan)
        self.assertIn("idx_trace_events_trace", plan_text)
        self.assertNotIn("SCAN agent_trace_events", plan_text)


if __name__ == "__main__":
    unittest.main()
