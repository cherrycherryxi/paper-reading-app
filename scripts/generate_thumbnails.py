#!/usr/bin/env python3
"""为 uploads 下的图片生成书单用缩略图（<stem>.thumb.jpg，最长边 400px）。

书单封面用原图会一次性拉几十 MB；本脚本用 macOS 自带的 `sips` 预生成 ~30KB 的
缩略图，前端书卡改用缩略图（缺失时 onerror 退回原图），后端无需任何改动——缩略图
就是 uploads 里的普通文件，由现有的 /media/ 路由直接服务。

幂等：缩略图已存在且比源图新则跳过。可随时重跑（新增封面后再跑一次即可）。

用法:
    python3 scripts/generate_thumbnails.py [uploads目录]
    # 默认目录: $UPLOAD_DIR 或 <repo>/uploads
"""
import os
import subprocess
import sys
from pathlib import Path

MAX_EDGE = 400          # 缩略图最长边像素
JPEG_QUALITY = 60       # sips formatOptions（0-100）
SRC_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
THUMB_SUFFIX = ".thumb.jpg"

SIPS = "/usr/bin/sips"


def is_thumb(name: str) -> bool:
    return name.lower().endswith(THUMB_SUFFIX)


def thumb_for(src: Path) -> Path:
    # abc.jpeg -> abc.thumb.jpg
    return src.with_name(src.stem + THUMB_SUFFIX)


def main() -> int:
    if not os.path.exists(SIPS):
        print(f"❌ 找不到 sips（{SIPS}）——本脚本依赖 macOS 自带 sips。")
        return 1

    root = Path(
        sys.argv[1] if len(sys.argv) > 1
        else os.getenv("UPLOAD_DIR", str(Path(__file__).resolve().parent.parent / "uploads"))
    )
    if not root.is_dir():
        print(f"❌ uploads 目录不存在: {root}")
        return 1

    made = skipped = failed = 0
    src_bytes = thumb_bytes = 0
    for p in sorted(root.rglob("*")):
        if not p.is_file() or is_thumb(p.name):
            continue
        if p.suffix.lower() not in SRC_EXTS:
            continue
        t = thumb_for(p)
        src_bytes += p.stat().st_size
        # 幂等：缩略图已存在且不比源图旧 → 跳过
        if t.exists() and t.stat().st_mtime >= p.stat().st_mtime:
            skipped += 1
            thumb_bytes += t.stat().st_size
            continue
        try:
            subprocess.run(
                [SIPS, "-s", "format", "jpeg", "-s", "formatOptions", str(JPEG_QUALITY),
                 "-Z", str(MAX_EDGE), str(p), "--out", str(t)],
                check=True, capture_output=True,
            )
            made += 1
            thumb_bytes += t.stat().st_size
        except subprocess.CalledProcessError as e:
            failed += 1
            print(f"  ⚠️ 失败 {p.name}: {e.stderr.decode(errors='ignore').strip()[:80]}")

    print("──────────────────────────────────────────────")
    print(f"目录: {root}")
    print(f"新生成: {made}  跳过(已最新): {skipped}  失败: {failed}")
    if src_bytes:
        print(f"源图总量: {src_bytes/1024/1024:.1f}MB  →  缩略图总量: {thumb_bytes/1024/1024:.1f}MB "
              f"（书单从 {src_bytes/1024/1024:.1f}MB 降到 {thumb_bytes/1024/1024:.1f}MB）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
