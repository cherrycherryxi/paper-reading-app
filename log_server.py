from __future__ import annotations

import base64
import hashlib
import hmac
import imghdr
import json
import secrets
import sqlite3
import uuid
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "paper_reading_backend.db"
UPLOAD_DIR = BASE_DIR / "uploads"
HOST = "0.0.0.0"
PORT = 8787

# 部署时在这里填写你的服务端密钥，不要再放到前端。
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
AUTH_TOKEN = ""

INITIAL_STATE = {
    "books": [],
    "sessions": [],
    "quotes": [],
    "chatHistories": {},
}


def guess_base_url(handler: BaseHTTPRequestHandler) -> str:
    host = handler.headers.get("Host")
    if host:
        return f"http://{host}"
    return f"http://{HOST}:{PORT}"


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS user_state (
            user_id TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS model_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            type TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt TEXT NOT NULL,
            input TEXT NOT NULL,
            output TEXT NOT NULL,
            error TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )
    conn.commit()
    conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        salt, digest = encoded.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
    ).hex()
    return hmac.compare_digest(candidate, digest)


def sanitize_state(payload: dict | None) -> dict:
    payload = payload or {}
    chat_histories = payload.get("chatHistories")
    if not isinstance(chat_histories, dict):
        legacy_history = payload.get("chatHistory")
        chat_histories = {"__general__": legacy_history} if isinstance(legacy_history, list) else {}
    return {
        "books": payload.get("books") if isinstance(payload.get("books"), list) else [],
        "sessions": payload.get("sessions") if isinstance(payload.get("sessions"), list) else [],
        "quotes": payload.get("quotes") if isinstance(payload.get("quotes"), list) else [],
        "chatHistories": {
            str(key): value for key, value in chat_histories.items() if isinstance(value, list)
        },
    }


def ensure_user_state(conn: sqlite3.Connection, user_id: str) -> None:
    row = conn.execute("SELECT user_id FROM user_state WHERE user_id = ?", (user_id,)).fetchone()
    if row:
        return
    conn.execute(
        "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
        (user_id, json.dumps(INITIAL_STATE, ensure_ascii=False), now_iso()),
    )
    conn.commit()


def load_state(conn: sqlite3.Connection, user_id: str) -> dict:
    ensure_user_state(conn, user_id)
    row = conn.execute("SELECT state_json FROM user_state WHERE user_id = ?", (user_id,)).fetchone()
    return sanitize_state(json.loads(row["state_json"]))


def save_state(conn: sqlite3.Connection, user_id: str, state: dict) -> dict:
    sanitized = sanitize_state(state)
    conn.execute(
        "UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?",
        (json.dumps(sanitized, ensure_ascii=False), now_iso(), user_id),
    )
    conn.commit()
    return sanitized


def create_session(conn: sqlite3.Connection, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = now_iso()
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now, now),
    )
    conn.commit()
    return token


def resolve_user_from_token(conn: sqlite3.Connection, token: str | None) -> sqlite3.Row | None:
    if not token:
        return None
    row = conn.execute(
        """
        SELECT users.id, users.username, users.created_at
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = ?
        """,
        (token,),
    ).fetchone()
    if row:
        conn.execute("UPDATE sessions SET last_seen_at = ? WHERE token = ?", (now_iso(), token))
        conn.commit()
    return row


def append_log(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    username: str,
    type_: str,
    model: str,
    prompt: str,
    input_: str,
    output: str,
    error: str = "",
) -> None:
    conn.execute(
        """
        INSERT INTO model_logs (id, user_id, username, type, model, prompt, input, output, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (new_id("log"), user_id, username, type_, model, prompt, input_, output, error, now_iso()),
    )
    conn.commit()


def list_logs(conn: sqlite3.Connection, user_id: str, limit: int = 30) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, user_id, username, type, model, prompt, input, output, error, created_at
        FROM model_logs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (user_id, limit),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "user_id": row["user_id"],
            "username": row["username"],
            "type": row["type"],
            "model": row["model"],
            "prompt": row["prompt"],
            "input": row["input"],
            "output": row["output"],
            "error": row["error"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def decode_data_url(data_url: str) -> tuple[bytes, str]:
    if "," not in data_url or ";base64" not in data_url:
        raise ValueError("invalid data url")
    header, encoded = data_url.split(",", 1)
    mime_type = header.split(":")[1].split(";")[0]
    return base64.b64decode(encoded), mime_type


def save_image(user_id: str, data_url: str, filename: str = "") -> str:
    binary, mime_type = decode_data_url(data_url)
    detected = imghdr.what(None, binary)
    extension = detected or mime_type.split("/")[-1] or "jpg"
    safe_name = f"{uuid.uuid4().hex[:16]}.{extension}"
    user_dir = UPLOAD_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    file_path = user_dir / safe_name
    file_path.write_bytes(binary)
    return f"/media/{user_id}/{safe_name}"


def build_book_prompt(state: dict, book_id: str) -> str:
    if not book_id:
        return "你是一个阅读助手，帮助用户理解书籍内容、发散思考、建立联系。回答简洁有深度，中文回复。"

    book = next((item for item in state["books"] if item.get("id") == book_id), None)
    if not book:
        return "你是一个阅读助手，回答简洁有深度，中文回复。"

    if book.get("totalPages"):
        progress = f"当前读到第 {book.get('currentPage', 0)} 页，共 {book['totalPages']} 页"
    else:
        progress = f"当前读到第 {book.get('currentPage', 0)} 页"

    quotes = [item for item in state["quotes"] if item.get("bookId") == book_id][:20]
    quotes_text = (
        "\n\n".join(
            f"[第{item.get('page') or '?'}页] {item.get('content', '')}"
            + (f"\n我的理解：{item.get('reflection')}" if item.get("reflection") else "")
            for item in quotes
        )
        if quotes
        else "暂无摘抄"
    )

    return f"""你是一个阅读助手，正在和用户围绕下面这本书深入探讨：

书名：{book.get('title', '')}
作者：{book.get('author') or '未填写'}
进度：{progress}
标签：{' / '.join(book.get('tags', [])) if isinstance(book.get('tags'), list) and book.get('tags') else '无'}
备注：{book.get('notes') or '无'}

用户摘抄：
{quotes_text}

请基于这些上下文帮助用户理解内容、提出问题、建立联系。不要先重复背景，直接进入讨论。"""


def call_deepseek(messages: list[dict], model: str = "deepseek-chat", max_tokens: int = 1200) -> str:
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")

    request = Request(
        "https://api.deepseek.com/v1/chat/completions",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        },
        data=json.dumps(
            {
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
            }
        ).encode("utf-8"),
    )

    try:
        with urlopen(request, timeout=120) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"].strip()
    except HTTPError as error:
        payload = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(payload or f"HTTP {error.code}") from error
    except URLError as error:
        raise RuntimeError(str(error.reason)) from error


class Handler(BaseHTTPRequestHandler):
    server_version = "PaperReadingBackend/1.0"

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Log-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, html: str, status: int = 200) -> None:
        body = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def _get_token(self) -> str | None:
        header = self.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            return header[7:].strip()
        return None

    def _authorized_for_admin(self) -> bool:
        if not AUTH_TOKEN:
            return True
        return self.headers.get("X-Log-Token", "") == AUTH_TOKEN

    def _require_user(self) -> tuple[sqlite3.Connection, sqlite3.Row] | tuple[None, None]:
        conn = get_conn()
        user = resolve_user_from_token(conn, self._get_token())
        if not user:
            conn.close()
            self._send_json({"error": "Unauthorized"}, 401)
            return None, None
        return conn, user

    def do_OPTIONS(self) -> None:
        self._send_json({}, 204)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path.startswith("/media/"):
            target = (UPLOAD_DIR / parsed.path.removeprefix("/media/")).resolve()
            if not str(target).startswith(str(UPLOAD_DIR.resolve())) or not target.exists() or not target.is_file():
                self.send_error(404)
                return
            content = target.read_bytes()
            mime = "image/jpeg"
            if target.suffix.lower() == ".png":
                mime = "image/png"
            elif target.suffix.lower() == ".webp":
                mime = "image/webp"
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        if parsed.path == "/api/session":
            conn, user = self._require_user()
            if not conn:
                return
            state = load_state(conn, user["id"])
            conn.close()
            self._send_json({"user": dict(user), "state": state})
            return

        if parsed.path == "/api/model-logs":
            conn, user = self._require_user()
            if not conn:
                return
            logs = list_logs(conn, user["id"])
            conn.close()
            self._send_json({"logs": logs})
            return

        if parsed.path == "/api/health":
            self._send_json({"ok": True, "time": now_iso()})
            return

        if parsed.path == "/debug/logs":
            if not self._authorized_for_admin():
                self._send_html("<h1>Unauthorized</h1>", 401)
                return
            conn = get_conn()
            rows = conn.execute(
                """
                SELECT id, user_id, username, type, model, prompt, input, output, error, created_at
                FROM model_logs
                ORDER BY created_at DESC
                LIMIT 100
                """
            ).fetchall()
            conn.close()
            cards = []
            for row in rows:
                cards.append(
                    f"""
                    <details style="border:1px solid #ddd;border-radius:12px;padding:12px;background:#fff;margin-bottom:12px;">
                      <summary style="cursor:pointer;font-weight:600;">
                        {row['created_at']} · {row['username']} · {row['type']} · {row['model']} · {'失败' if row['error'] else '成功'}
                      </summary>
                      <div style="margin-top:12px;">
                        <p><b>Prompt</b></p>
                        <pre style="white-space:pre-wrap;word-break:break-word;background:#f6f6f6;padding:10px;border-radius:8px;">{row['prompt']}</pre>
                        <p><b>输入</b></p>
                        <pre style="white-space:pre-wrap;word-break:break-word;background:#f6f6f6;padding:10px;border-radius:8px;">{row['input']}</pre>
                        <p><b>输出</b></p>
                        <pre style="white-space:pre-wrap;word-break:break-word;background:#f6f6f6;padding:10px;border-radius:8px;">{row['output']}</pre>
                        <p><b>错误</b></p>
                        <pre style="white-space:pre-wrap;word-break:break-word;background:#f6f6f6;padding:10px;border-radius:8px;">{row['error']}</pre>
                      </div>
                    </details>
                    """
                )
            html = f"""
            <!doctype html>
            <html lang="zh-CN">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Paper Reading Logs</title>
              <style>
                body {{ font-family: -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif; background:#f5f5f5; color:#111; margin:0; }}
                main {{ max-width: 900px; margin: 0 auto; padding: 24px; }}
                h1 {{ margin: 0 0 8px; }}
                p {{ color:#666; }}
              </style>
            </head>
            <body>
              <main>
                <h1>模型调用日志</h1>
                <p>最近 100 条，直接来自部署端数据库。</p>
                {"".join(cards) if cards else "<p>暂无日志。</p>"}
              </main>
            </body>
            </html>
            """
            self._send_html(html)
            return

        self._send_json({"error": "Not found"}, 404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/register":
            payload = self._read_json()
            username = str(payload.get("username", "")).strip()
            password = str(payload.get("password", "")).strip()
            if len(username) < 2 or len(password) < 4:
                self._send_json({"error": "Invalid username or password"}, 400)
                return

            conn = get_conn()
            exists = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            if exists:
                conn.close()
                self._send_json({"error": "Username already exists"}, 409)
                return

            user_id = new_id("user")
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, username, hash_password(password), now_iso()),
            )
            conn.execute(
                "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
                (user_id, json.dumps(INITIAL_STATE, ensure_ascii=False), now_iso()),
            )
            token = create_session(conn, user_id)
            user = conn.execute("SELECT id, username, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
            state = load_state(conn, user_id)
            conn.close()
            self._send_json({"token": token, "user": dict(user), "state": state}, 201)
            return

        if parsed.path == "/api/login":
            payload = self._read_json()
            username = str(payload.get("username", "")).strip()
            password = str(payload.get("password", "")).strip()
            conn = get_conn()
            row = conn.execute(
                "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            if not row or not verify_password(password, row["password_hash"]):
                conn.close()
                self._send_json({"error": "Invalid credentials"}, 401)
                return
            token = create_session(conn, row["id"])
            state = load_state(conn, row["id"])
            conn.close()
            self._send_json(
                {
                    "token": token,
                    "user": {"id": row["id"], "username": row["username"], "created_at": row["created_at"]},
                    "state": state,
                }
            )
            return

        if parsed.path == "/api/logout":
            conn, user = self._require_user()
            if not conn:
                return
            conn.execute("DELETE FROM sessions WHERE token = ?", (self._get_token(),))
            conn.commit()
            conn.close()
            self._send_json({"ok": True})
            return

        if parsed.path == "/api/upload-image":
            conn, user = self._require_user()
            if not conn:
                return
            payload = self._read_json()
            data_url = str(payload.get("dataUrl", "")).strip()
            filename = str(payload.get("filename", "")).strip()
            if not data_url:
                conn.close()
                self._send_json({"error": "dataUrl is required"}, 400)
                return
            try:
                url = save_image(user["id"], data_url, filename)
            except Exception as error:
                conn.close()
                self._send_json({"error": f"image upload failed: {error}"}, 400)
                return
            conn.close()
            self._send_json({"url": f"{guess_base_url(self)}{url}"})
            return

        if parsed.path == "/api/ocr":
            conn, user = self._require_user()
            if not conn:
                return
            payload = self._read_json()
            data_url = str(payload.get("imageDataUrl", "")).strip()
            if not data_url:
                conn.close()
                self._send_json({"error": "imageDataUrl is required"}, 400)
                return

            prompt = "请提取图片中所有被划线标注的文字，按出现顺序列出，每条单独一行，不需要其他解释。如果没有发现划线内容，回复“未发现划线文字”。"
            try:
                content = [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": prompt},
                ]
                output = call_deepseek([{"role": "user", "content": content}])
                append_log(
                    conn,
                    user_id=user["id"],
                    username=user["username"],
                    type_="ocr",
                    model="deepseek-chat",
                    prompt=prompt,
                    input_="image:data-url",
                    output=output,
                )
                conn.close()
                self._send_json({"text": output, "source": "backend-ocr"})
            except Exception as error:
                append_log(
                    conn,
                    user_id=user["id"],
                    username=user["username"],
                    type_="ocr",
                    model="deepseek-chat",
                    prompt=prompt,
                    input_="image:data-url",
                    output="",
                    error=str(error),
                )
                conn.close()
                self._send_json({"error": str(error)}, 500)
            return

        if parsed.path == "/api/chat":
            conn, user = self._require_user()
            if not conn:
                return
            payload = self._read_json()
            message = str(payload.get("message", "")).strip()
            book_id = str(payload.get("bookId", "")).strip()
            if not message:
                conn.close()
                self._send_json({"error": "message is required"}, 400)
                return

            state = load_state(conn, user["id"])
            system_prompt = build_book_prompt(state, book_id)
            history_key = book_id or "__general__"
            history = state.get("chatHistories", {}).get(history_key, [])
            request_messages = [{"role": "system", "content": system_prompt}, *history, {"role": "user", "content": message}]

            try:
                reply = call_deepseek(request_messages)
                history = [*history, {"role": "user", "content": message}, {"role": "assistant", "content": reply}][-40:]
                state.setdefault("chatHistories", {})[history_key] = history
                save_state(conn, user["id"], state)
                append_log(
                    conn,
                    user_id=user["id"],
                    username=user["username"],
                    type_="chat",
                    model="deepseek-chat",
                    prompt=system_prompt,
                    input_=message,
                    output=reply,
                )
                conn.close()
                self._send_json({"reply": reply, "history": history, "historyKey": history_key})
            except Exception as error:
                append_log(
                    conn,
                    user_id=user["id"],
                    username=user["username"],
                    type_="chat",
                    model="deepseek-chat",
                    prompt=system_prompt,
                    input_=message,
                    output="",
                    error=str(error),
                )
                conn.close()
                self._send_json({"error": str(error)}, 500)
            return

        self._send_json({"error": "Not found"}, 404)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/state":
            self._send_json({"error": "Not found"}, 404)
            return

        conn, user = self._require_user()
        if not conn:
            return

        payload = self._read_json()
        state = save_state(conn, user["id"], payload)
        conn.close()
        self._send_json({"state": state})

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/model-logs":
            conn, user = self._require_user()
            if not conn:
                return
            conn.execute("DELETE FROM model_logs WHERE user_id = ?", (user["id"],))
            conn.commit()
            conn.close()
            self._send_json({"ok": True})
            return

        if parsed.path == "/api/chat-history":
            conn, user = self._require_user()
            if not conn:
                return
            state = load_state(conn, user["id"])
            payload = self._read_json() if self.command == "DELETE" and int(self.headers.get("Content-Length", "0")) > 0 else {}
            history_key = str(payload.get("bookId", "")).strip() or "__general__"
            state.setdefault("chatHistories", {})[history_key] = []
            save_state(conn, user["id"], state)
            conn.close()
            self._send_json({"ok": True})
            return

        self._send_json({"error": "Not found"}, 404)


def main() -> None:
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"backend server listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
