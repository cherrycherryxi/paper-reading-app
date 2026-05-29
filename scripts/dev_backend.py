#!/usr/bin/env python3
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
WATCH_SUFFIXES = {".py", ".html", ".css", ".js", ".md"}
WATCH_DIRS = {
    ROOT,
    ROOT / "scripts",
}
IGNORE_DIR_NAMES = {
    ".git",
    ".venv",
    ".wolf",
    ".claude",
    "__pycache__",
    "uploads",
    "data",
    "node_modules",
}
POLL_INTERVAL_SECONDS = 1.0
RESTART_DEBOUNCE_SECONDS = 0.4
REQUIRED_BACKEND_IMPORTS = ("mcp", "httpx", "uvicorn")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://127.0.0.1:8788/mcp")


def backend_python() -> Path:
    python = ROOT / ".venv" / "bin" / "python"
    if python.exists():
        return python
    return Path(sys.executable)


def check_backend_environment(python: Path) -> bool:
    imports = "; ".join(f"import {name}" for name in REQUIRED_BACKEND_IMPORTS)
    result = subprocess.run(
        [str(python), "-c", imports],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return True

    print("Cannot start backend: Python dependencies are missing.", flush=True)
    print(f"Python: {python}", flush=True)
    print("Run: .venv/bin/python -m pip install -r requirements.txt", flush=True)
    if result.stderr.strip():
        print(result.stderr.strip(), flush=True)
    return False


def check_mcp_server() -> bool:
    parsed = urlparse(MCP_SERVER_URL)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    result = subprocess.run(
        [
            str(backend_python()),
            "-c",
            (
                "import socket, sys; "
                "host, port = sys.argv[1], int(sys.argv[2]); "
                "socket.create_connection((host, port), timeout=1).close()"
            ),
            host,
            str(port),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return True

    print("Cannot start backend: MCP server is not reachable.", flush=True)
    print(f"MCP_SERVER_URL: {MCP_SERVER_URL}", flush=True)
    print("Run: ./scripts/start_mcp.sh", flush=True)
    return False


def iter_watched_files():
    seen: set[Path] = set()
    for base in WATCH_DIRS:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path in seen or not path.is_file():
                continue
            seen.add(path)
            if path.suffix not in WATCH_SUFFIXES:
                continue
            if any(part in IGNORE_DIR_NAMES for part in path.relative_to(ROOT).parts[:-1]):
                continue
            yield path


def snapshot() -> dict[Path, int]:
    result: dict[Path, int] = {}
    for path in iter_watched_files():
        try:
            result[path] = path.stat().st_mtime_ns
        except FileNotFoundError:
            continue
    return result


def changed_files(previous: dict[Path, int], current: dict[Path, int]) -> list[Path]:
    changed: list[Path] = []
    for path, mtime in current.items():
        if previous.get(path) != mtime:
            changed.append(path)
    for path in previous:
        if path not in current:
            changed.append(path)
    return sorted(changed)


def start_backend() -> subprocess.Popen:
    python = backend_python()
    if not check_backend_environment(python):
        raise RuntimeError("backend environment is not ready")
    if not check_mcp_server():
        raise RuntimeError("MCP server is not reachable")
    return subprocess.Popen([str(python), "app_server.py"], cwd=ROOT, env=os.environ.copy())


def stop_backend(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> int:
    print("Dev backend watcher started. Watching source files for changes.", flush=True)
    try:
        process = start_backend()
    except RuntimeError:
        return 1
    previous = snapshot()

    def shutdown(signum, frame):
        stop_backend(process)
        raise SystemExit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        time.sleep(POLL_INTERVAL_SECONDS)
        if process.poll() is not None:
            print(f"Backend exited with code {process.returncode}. Restarting...", flush=True)
            try:
                process = start_backend()
            except RuntimeError:
                return 1
            previous = snapshot()
            continue

        current = snapshot()
        changes = changed_files(previous, current)
        if not changes:
            continue

        time.sleep(RESTART_DEBOUNCE_SECONDS)
        current = snapshot()
        changes = changed_files(previous, current)
        previous = current
        if not changes:
            continue

        names = ", ".join(str(path.relative_to(ROOT)) for path in changes[:5])
        if len(changes) > 5:
            names += f", +{len(changes) - 5} more"
        print(f"Detected change: {names}. Restarting backend...", flush=True)
        stop_backend(process)
        try:
            process = start_backend()
        except RuntimeError:
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
