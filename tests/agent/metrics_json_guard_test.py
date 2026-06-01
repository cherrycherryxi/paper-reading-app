"""
OPT-008: Tests that summarize_metrics() skips rows with corrupted dimensions JSON
instead of raising json.JSONDecodeError and returning HTTP 500.
"""
import json
import tempfile
import unittest
from pathlib import Path

import app_server


class SummarizeMetricsJsonGuardTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self.conn = app_server.get_conn()
        self.user_id = "user-test-metrics"
        now = app_server.now_iso()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (self.user_id, "tester", "salt$digest", now),
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()
        self.temp_dir.cleanup()

    def _insert_metric(self, metric_name, metric_value, dimensions_json: str):
        import uuid
        metric_id = "metric-" + str(uuid.uuid4())
        trace_id = "trace-" + str(uuid.uuid4())
        # Insert a trace row first (FK requirement)
        now = app_server.now_iso()
        self.conn.execute(
            "INSERT INTO agent_traces"
            " (trace_id, user_id, request_type, status, parse_status, validation_status, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (trace_id, self.user_id, "chat", "completed", "ok", "ok", now, now),
        )
        self.conn.execute(
            "INSERT INTO agent_metrics (metric_id, user_id, trace_id, metric_name, metric_kind, metric_value, dimensions, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (metric_id, self.user_id, trace_id, metric_name, "counter", metric_value, dimensions_json, now),
        )
        self.conn.commit()

    def test_valid_rows_still_counted(self):
        """Normal (valid JSON) rows should be counted as before."""
        valid_dims = json.dumps({"agentStatus": "success"})
        self._insert_metric("agent.chat.request", 1.0, valid_dims)
        self._insert_metric("agent.chat.latency_ms", 250.0, valid_dims)

        mc = app_server.MetricsCollector()
        result = mc.summarize_metrics(self.conn, self.user_id)
        self.assertEqual(result["requestCount"], 1)
        self.assertEqual(result["avgLatencyMs"], 250.0)

    def test_corrupted_row_no_exception_and_still_counted(self):
        """A row with invalid dimensions JSON must not raise, and its valid
        metric_value still counts (dimensions degrades to {}, agentStatus lost)."""
        valid_dims = json.dumps({"agentStatus": "success"})
        self._insert_metric("agent.chat.request", 1.0, valid_dims)
        # Insert a row with corrupted JSON
        self._insert_metric("agent.chat.request", 1.0, "{not-valid-json}")

        mc = app_server.MetricsCollector()
        # Should not raise — previously would throw json.JSONDecodeError → HTTP 500
        result = mc.summarize_metrics(self.conn, self.user_id)
        # Both rows count toward requestCount; the corrupt one just can't be
        # classified as an error (no agentStatus), so it is not an error.
        self.assertEqual(result["requestCount"], 2)
        self.assertEqual(result["errorCount"], 0)

    def test_all_rows_corrupted_still_aggregates_values(self):
        """Even if every dimensions blob is corrupt, the valid metric_values
        still aggregate (only the error sub-classification is lost)."""
        self._insert_metric("agent.chat.request", 1.0, "INVALID")
        self._insert_metric("agent.chat.latency_ms", 100.0, "ALSO BAD")

        mc = app_server.MetricsCollector()
        result = mc.summarize_metrics(self.conn, self.user_id)
        # request counted (dims={} → not error), latency averaged
        self.assertEqual(result["requestCount"], 1)
        self.assertEqual(result["errorCount"], 0)
        self.assertEqual(result["avgLatencyMs"], 100.0)

    def test_mixed_corruption_degrades_gracefully(self):
        """Mix of good and bad rows: all metric_values aggregate; only the
        agentStatus-based errorCount drops the corrupt rows."""
        valid_dims = json.dumps({"agentStatus": "ERROR"})
        self._insert_metric("agent.chat.request", 3.0, valid_dims)
        self._insert_metric("agent.chat.request", 2.0, "BAD{}")
        self._insert_metric("agent.chat.latency_ms", 500.0, valid_dims)
        self._insert_metric("agent.chat.latency_ms", 300.0, "BAD{}")

        mc = app_server.MetricsCollector()
        result = mc.summarize_metrics(self.conn, self.user_id)
        # Both request rows count (3 + 2); only the valid one is an error.
        self.assertEqual(result["requestCount"], 5)
        self.assertEqual(result["errorCount"], 3)
        # Both latency values average: (500 + 300) / 2.
        self.assertEqual(result["avgLatencyMs"], 400.0)


if __name__ == "__main__":
    unittest.main()
