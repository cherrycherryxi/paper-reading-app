import os
import json
import types
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import deep_reading


class DeepReadingRuntimeTests(unittest.TestCase):
    def test_capability_is_explicitly_opt_in(self):
        with patch.dict(os.environ, {"DEEP_READING_ENABLED": ""}, clear=False):
            capability = deep_reading.harness_capability()
        self.assertFalse(capability["available"])
        self.assertIn("尚未由管理员启用", capability["reason"])

    def test_external_runtime_prefers_single_executable(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_bin = Path(temp_dir) / "dsh-runtime"
            runtime_bin.touch(mode=0o755)
            runtime_bin.chmod(0o755)
            with patch.dict(os.environ, {
                "DSH_RUNTIME_BIN": str(runtime_bin),
                "DSH_RUNTIME_ENTRY": "/ignored/missing-entry",
            }, clear=False):
                self.assertEqual(
                    deep_reading._external_runtime_launch_args(),
                    (str(runtime_bin.resolve()),),
                )

    def test_external_runtime_rejects_non_executable_binary(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_bin = Path(temp_dir) / "dsh-runtime"
            runtime_bin.touch(mode=0o600)
            runtime_bin.chmod(0o600)
            with patch.dict(os.environ, {"DSH_RUNTIME_BIN": str(runtime_bin)}, clear=False):
                with self.assertRaisesRegex(RuntimeError, "DSH_RUNTIME_BIN 不可执行"):
                    deep_reading._external_runtime_launch_args()

    def test_external_runtime_requires_existing_entry(self):
        with patch.dict(os.environ, {"DSH_RUNTIME_BIN": "", "DSH_RUNTIME_ENTRY": "/missing/dsh-runtime"}, clear=False):
            with self.assertRaisesRegex(RuntimeError, "DSH_RUNTIME_ENTRY 不存在"):
                deep_reading._external_runtime_launch_args()

    def test_external_runtime_returns_explicit_node_and_entry(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            entry = Path(temp_dir) / "packaged-bin.js"
            node = Path(temp_dir) / "node"
            entry.touch()
            node.touch()
            with patch.dict(os.environ, {
                "DSH_RUNTIME_ENTRY": str(entry),
                "DSH_NODE_BIN": str(node),
                "DSH_RUNTIME_BIN": "",
            }, clear=False):
                self.assertEqual(
                    deep_reading._external_runtime_launch_args(),
                    (str(node.resolve()), str(entry.resolve())),
                )

    def test_mcp_discovery_grace_is_bounded_and_numeric(self):
        with patch.dict(os.environ, {"DSH_MCP_DISCOVERY_GRACE_SECONDS": "2.25"}, clear=False):
            self.assertEqual(deep_reading._mcp_discovery_grace_seconds(), 2.25)
        for invalid in ("-1", "10.1", "slow"):
            with self.subTest(invalid=invalid):
                with patch.dict(os.environ, {"DSH_MCP_DISCOVERY_GRACE_SECONDS": invalid}, clear=False):
                    with self.assertRaisesRegex(RuntimeError, "DSH_MCP_DISCOVERY_GRACE_SECONDS"):
                        deep_reading._mcp_discovery_grace_seconds()

    def test_cancelled_run_after_harness_returns_never_persists_proposals(self):
        class Store:
            cancelled = False

            def is_cancelled(self, _run_id):
                return self.cancelled

            def progress(self, *_args):
                pass

            def complete(self, *_args):
                raise AssertionError("cancelled run must not complete")

            def fail(self, _run_id, _error):
                raise AssertionError("cancelled run must not be marked failed")

        store = Store()

        class Harness:
            def __init__(self, **_kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def close(self):
                pass

            def run(self, *_args, **_kwargs):
                store.cancelled = True
                return types.SimpleNamespace(
                    final_response=json.dumps({"summary": "late", "proposals": [{}]}),
                    events=[],
                    finish_reason="stop",
                )

        on_complete = Mock()
        runner = deep_reading.DeepReadingRunner(Path("/unused.db"), Path("/unused.yml"), "http://gateway", on_complete)
        runner.store = store
        run = {"id": "run-cancelled", "context": {"type": "global", "bookId": "", "quoteId": ""}, "question": "研究"}

        with patch.dict("sys.modules", {"deepseek_harness": types.SimpleNamespace(DeepSeekHarness=Harness)}), \
             patch.object(deep_reading, "_mcp_discovery_grace_seconds", return_value=0):
            runner._run(run, "token")

        on_complete.assert_not_called()

    def test_cancel_reaches_harness_registered_by_another_runner_facade(self):
        first = deep_reading.DeepReadingRunner(Path("/unused.db"), Path("/unused.yml"), "http://gateway")
        later_cancel_request = deep_reading.DeepReadingRunner(Path("/unused.db"), Path("/unused.yml"), "http://gateway")
        harness = Mock()

        first._register_active_harness("run-active", harness)
        try:
            later_cancel_request.cancel("run-active")
        finally:
            first._unregister_active_harness("run-active", harness)

        harness.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
