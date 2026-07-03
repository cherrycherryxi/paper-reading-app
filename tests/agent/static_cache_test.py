"""OPT-086: 静态资源缓存策略测试。

- JS/CSS → Cache-Control: immutable 长缓存(URL 带版本串,发版自动失效),让 Cloudflare
  边缘缓存、不再每次回源(穿隧道读家用 Mac 的高延迟)。
- HTML → no-store 常新,且服务端把 JS/CSS 引用的 ?v= 注入为当前版本串。
"""
import os
import sys
import unittest
from io import BytesIO

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import app_server  # noqa: E402


def fetch_static(path):
    """直调 Handler.do_GET 取一个静态路径,返回 (status, headers, body_bytes)。"""
    h = app_server.Handler.__new__(app_server.Handler)
    h.path = path
    h.command = "GET"
    h.headers = {}
    h.rfile = BytesIO(b"")
    h.wfile = BytesIO()
    h._status = None
    captured = {}
    h.send_response = lambda c, *a: setattr(h, "_status", c)
    h.send_header = lambda k, v: captured.__setitem__(k, v)
    h.end_headers = lambda: None
    h.do_GET()
    return h._status, captured, h.wfile.getvalue()


class StaticCacheTests(unittest.TestCase):
    def test_js_immutable_cache(self):
        status, headers, _ = fetch_static("/app.js?v=abc")
        self.assertEqual(status, 200)
        self.assertIn("immutable", headers.get("Cache-Control", ""))
        self.assertIn("max-age=31536000", headers.get("Cache-Control", ""))

    def test_css_immutable_cache(self):
        _, headers, _ = fetch_static("/styles.css?v=abc")
        self.assertIn("immutable", headers.get("Cache-Control", ""))

    def test_html_no_store_and_version_injected(self):
        status, headers, body = fetch_static("/app")  # index.html
        self.assertEqual(status, 200)
        self.assertIn("no-store", headers.get("Cache-Control", ""))
        ver = app_server.static_asset_version()
        text = body.decode("utf-8")
        # 引用应被改写成当前版本串
        self.assertIn(f"app.js?v={ver}", text)
        self.assertIn(f"styles.css?v={ver}", text)
        self.assertIn(f"chat.js?v={ver}", text)

    def test_version_changes_with_file_mtime(self):
        v1 = app_server.static_asset_version()
        self.assertTrue(v1 and len(v1) >= 8, "版本串应为非空短哈希")
        # 触碰 app.js 的 mtime → 版本串应改变
        p = os.path.join(os.path.dirname(__file__), "..", "..", "app.js")
        st = os.stat(p)
        try:
            os.utime(p, (st.st_atime, st.st_mtime + 5))
            self.assertNotEqual(v1, app_server.static_asset_version(), "文件 mtime 变则版本串变")
        finally:
            os.utime(p, (st.st_atime, st.st_mtime))  # 还原


if __name__ == "__main__":
    unittest.main()
