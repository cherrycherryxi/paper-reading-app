#!/usr/bin/env python3
"""抓取自己的豆瓣「读过」书籍 → CSV（书名/作者/我的评分/读过日期/我的短评/豆瓣链接）。

一次性个人工具（OPT-105 豆瓣导入的数据源）。用你自己的登录 cookie 抓, 加请求间隔防封号,
只抓你自己的收藏, 规模小。豆瓣官方无导出、第三方扩展(豆伴等)已停维护, 故自己抓最稳。

用法:
  1. 浏览器登录豆瓣 → F12 打开开发者工具 → Application(应用)/存储 → Cookies → https://www.douban.com
     复制整条 cookie(或至少含 dbcl2、bid、ck 几项), 存到本脚本同目录的 douban_cookie.txt。
     也可改用环境变量: export DOUBAN_COOKIE='bid=xxx; dbcl2="xxx"; ck=xxx'
  2. python3 douban_export.py <你的豆瓣数字ID>      # 例: python3 douban_export.py 66201504
     (ID 在你豆瓣主页 URL 里, 如 douban.com/people/66201504/)
  3. 生成同目录 douban_books.csv, 拿去 app 里导入。

抓取范围: 默认「读过」(collect)。想连「在读/想读」一起抓, 见文件末尾 SHELVES。
若豆瓣改版导致解析为空, 页面结构变了, 改下面的正则即可(这就是自己抓的好处——可控)。
"""
import sys
import os
import re
import csv
import time
import html
import urllib.request

BASE = "https://book.douban.com/people/{uid}/{shelf}"
SHELVES = ["collect"]  # 读过; 如需扩展: ["collect", "do", "wish"]  (do=在读, wish=想读)
PER_PAGE = 30          # 豆瓣书籍收藏列表(mode=list)每页 30 条
REQ_INTERVAL = 2.5     # 秒/页, 防封号; 书多可适当调大, 别调太小

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def load_cookie():
    env = os.environ.get("DOUBAN_COOKIE", "").strip()
    if env:
        return env
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "douban_cookie.txt")
    if os.path.exists(path):
        return open(path, encoding="utf-8").read().strip()
    return ""


def fetch(uid, shelf, start, cookie):
    url = BASE.format(uid=uid, shelf=shelf) + f"?start={start}&sort=time&filter=all&mode=list"
    headers = {"User-Agent": UA, "Referer": BASE.format(uid=uid, shelf=shelf)}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def clean(text):
    return html.unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


def parse_items(page_html):
    """从一页 HTML 里解析出书目 dict 列表（豆瓣 2026 结构: li.item > .title/.date/.intro/.comment）。"""
    items = []
    for block in re.findall(r'<li id="list\d+"[^>]*class="item">(.*?)</li>', page_html, re.S):
        m_title = re.search(r'<div class="title">\s*<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', block, re.S)
        if not m_title:
            continue
        link = m_title.group(1).strip()
        title = clean(m_title.group(2))
        if not title:
            continue
        m_rating = re.search(r'class="rating(\d)-t"', block)         # 我的星标 1-5
        rating = m_rating.group(1) if m_rating else ""
        date = ""
        m_datebox = re.search(r'<div class="date">(.*?)</div>', block, re.S)  # 读过日期
        if m_datebox:
            m_d = re.search(r'(\d{4}-\d{2}-\d{2})', m_datebox.group(1))
            date = m_d.group(1) if m_d else ""
        m_intro = re.search(r'<span class="intro">(.*?)</span>', block, re.S)  # 作者/出版信息行
        pub = clean(m_intro.group(1)) if m_intro else ""
        author = pub.split("/")[0].strip() if pub else ""            # 首段一般是作者
        m_comment = re.search(r'<div class="comment">(.*?)</div>', block, re.S)  # 我的短评
        comment = clean(m_comment.group(1)) if m_comment else ""
        items.append({"书名": title, "作者": author, "我的评分": rating,
                      "读过日期": date, "我的短评": comment, "豆瓣链接": link})
    return items


def blocked(page_html):
    """检测是否被登录墙/风控拦截。"""
    signs = ["有异常请求从你的 IP 发出", "登录跳转", "sec.douban.com",
             "请输入验证码", "window.location.href='https://accounts.douban.com"]
    return any(s in page_html for s in signs)


def main():
    if len(sys.argv) < 2:
        print("用法: python3 douban_export.py <豆瓣数字ID>  (如 66201504)"); sys.exit(1)
    uid = sys.argv[1].strip()
    cookie = load_cookie()
    if not cookie:
        print("⚠️ 未找到 cookie(douban_cookie.txt 或 $DOUBAN_COOKIE)。将尝试无 cookie 抓取,"
              " 但豆瓣多半会拦/数据不全, 强烈建议提供 cookie。")
    rows = []
    for shelf in SHELVES:
        start, page = 0, 1
        while True:
            print(f"抓取 {shelf} 第 {page} 页 (start={start}) ...", flush=True)
            try:
                page_html = fetch(uid, shelf, start, cookie)
            except Exception as e:
                print(f"  请求失败: {e!r}; 停止该书架。"); break
            if blocked(page_html):
                print("  ❌ 被豆瓣拦截(登录墙/风控)。请确认 cookie 有效, 或稍后再试/调大 REQ_INTERVAL。")
                break
            items = parse_items(page_html)
            if not items:
                print(f"  本页 0 条, {shelf} 抓完。"); break
            rows.extend(items)
            print(f"  +{len(items)} 条 (累计 {len(rows)})", flush=True)
            start += PER_PAGE
            page += 1
            time.sleep(REQ_INTERVAL)

    if not rows:
        print("没抓到任何书。多半是 cookie 无效/被拦, 或该 ID 的读书是私密的。"); sys.exit(2)

    # 按豆瓣链接去重(防分页重叠)
    seen, deduped = set(), []
    for r in rows:
        key = r.get("豆瓣链接") or r.get("书名")
        if key in seen:
            continue
        seen.add(key); deduped.append(r)
    rows = deduped

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "douban_books.csv")
    with open(out, "w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig 便于 Excel 也能开
        w = csv.DictWriter(f, fieldnames=["书名", "作者", "我的评分", "读过日期", "我的短评", "豆瓣链接"])
        w.writeheader()
        w.writerows(rows)
    print(f"\n✅ 完成: {len(rows)} 本 → {out}")
    print("把这个 CSV 发我(或直接在 app 里导入), 我接第二步做导入器。")


if __name__ == "__main__":
    main()
