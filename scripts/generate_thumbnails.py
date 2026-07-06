#!/usr/bin/env python3
"""为 uploads 下的图片生成书单用缩略图（<stem>.thumb.jpg，最长边 400px）。

书单封面用原图会一次性拉几十 MB；本脚本用 macOS 自带的 `sips` 预生成 ~30KB 的
缩略图，前端书卡改用缩略图（缺失时 onerror 退回原图），后端无需任何改动——缩略图
就是 uploads 里的普通文件，由现有的 /media/ 路由直接服务。

幂等：缩略图已存在且比源图新则跳过。可随时重跑（新增封面后再跑一次即可）。

用法:
    python3 scripts/generate_thumbnails.py [uploads目录]
    # 默认目录: $UPLOAD_DIR 或 <repo>/uploads

    # OPT-085 历史存量清理：把压缩上线(2026-05-14)前遗留的超大原图就地重压。
    # 前端三条封面上传路径自 2026-05-14 已压到 1200px/q0.85，本模式只处理历史大图。
    python3 scripts/generate_thumbnails.py --recompress-originals [--min-mb 1.2]
                 [--max-edge 1600] [--quality 80] [--dry-run] [uploads目录]
    # 原文件名/格式不变(URL 不失效)；压前整份备份到 uploads-recompress-backup-<date>/；
    # 仅在重压后确实更小时才替换。
"""
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

MAX_EDGE = 400          # 缩略图最长边像素
JPEG_QUALITY = 60       # sips formatOptions（0-100）
SRC_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
THUMB_SUFFIX = ".thumb.jpg"

# --recompress-originals 默认参数
RECOMPRESS_MIN_MB = 1.2   # 只处理大于此体积的原图（小图重压反而掉画质无收益）
RECOMPRESS_MAX_EDGE = 1600
RECOMPRESS_QUALITY = 80

SIPS = "/usr/bin/sips"


def is_thumb(name: str) -> bool:
    return name.lower().endswith(THUMB_SUFFIX)


def thumb_for(src: Path) -> Path:
    # abc.jpeg -> abc.thumb.jpg
    return src.with_name(src.stem + THUMB_SUFFIX)


def recompress_originals(root: Path, min_mb: float, max_edge: int,
                         quality: int, dry_run: bool) -> int:
    """就地重压 uploads 下超过 min_mb 的历史大图（保持文件名与格式，URL 不变）。

    不可逆操作，故：压前把命中的原图整份备份到 uploads-recompress-backup-<date>/；
    重压到临时文件，仅当结果更小才替换原图。缩略图(.thumb.jpg)不处理。
    """
    threshold = int(min_mb * 1024 * 1024)
    targets = [
        p for p in sorted(root.rglob("*"))
        if p.is_file() and not is_thumb(p.name)
        and p.suffix.lower() in SRC_EXTS and p.stat().st_size > threshold
    ]
    if not targets:
        print(f"✅ 无超过 {min_mb}MB 的原图，无需清理。")
        return 0

    total_before = sum(p.stat().st_size for p in targets)
    print(f"命中 {len(targets)} 张 > {min_mb}MB 的原图，合计 {total_before/1024/1024:.1f}MB"
          + ("（dry-run，不改动）" if dry_run else ""))

    backup_dir = root.parent / f"uploads-recompress-backup-{date.today().isoformat()}"
    replaced = skipped = failed = 0
    total_after = 0
    for p in targets:
        before = p.stat().st_size
        if dry_run:
            print(f"  · {p.relative_to(root)}  {before/1024/1024:.2f}MB")
            total_after += before
            continue
        # 备份（保留相对路径）
        rel = p.relative_to(root)
        bkp = backup_dir / rel
        bkp.parent.mkdir(parents=True, exist_ok=True)
        if not bkp.exists():
            shutil.copy2(p, bkp)
        tmp = p.with_name(p.stem + ".recompress-tmp" + p.suffix)
        cmd = [SIPS, "-Z", str(max_edge), str(p), "--out", str(tmp)]
        if p.suffix.lower() in (".jpg", ".jpeg"):
            cmd[1:1] = ["-s", "format", "jpeg", "-s", "formatOptions", str(quality)]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            failed += 1
            tmp.unlink(missing_ok=True)
            print(f"  ⚠️ 失败 {rel}: {e.stderr.decode(errors='ignore').strip()[:80]}")
            continue
        after = tmp.stat().st_size
        if after < before:
            tmp.replace(p)          # 保持原文件名 → /media URL 不变
            replaced += 1
            total_after += after
            thumb_for(p).unlink(missing_ok=True)   # 缩略图过期，删了下次重跑自动补
            print(f"  ✓ {rel}  {before/1024/1024:.2f}MB → {after/1024/1024:.2f}MB")
        else:
            tmp.unlink(missing_ok=True)
            skipped += 1
            total_after += before
            print(f"  = {rel}  重压未更小({after/1024/1024:.2f}MB)，保留原图")

    print("──────────────────────────────────────────────")
    if dry_run:
        print(f"dry-run：将处理 {len(targets)} 张，合计 {total_before/1024/1024:.1f}MB")
    else:
        print(f"替换: {replaced}  跳过(未更小): {skipped}  失败: {failed}")
        print(f"总量 {total_before/1024/1024:.1f}MB → {total_after/1024/1024:.1f}MB"
              f"（省 {(total_before-total_after)/1024/1024:.1f}MB）")
        print(f"原图备份在: {backup_dir}")
    return 0


def _flag_value(args: list[str], name: str, cast, default):
    if name in args:
        i = args.index(name)
        try:
            return cast(args[i + 1])
        except (IndexError, ValueError):
            pass
    return default


def main() -> int:
    if not os.path.exists(SIPS):
        print(f"❌ 找不到 sips（{SIPS}）——本脚本依赖 macOS 自带 sips。")
        return 1

    args = sys.argv[1:]
    recompress = "--recompress-originals" in args
    dry_run = "--dry-run" in args
    min_mb = _flag_value(args, "--min-mb", float, RECOMPRESS_MIN_MB)
    max_edge = _flag_value(args, "--max-edge", int, RECOMPRESS_MAX_EDGE)
    quality = _flag_value(args, "--quality", int, RECOMPRESS_QUALITY)
    # 位置参数(uploads 目录)：第一个不以 -- 开头、且不是被 flag 消费的值
    flag_values = {"--min-mb", "--max-edge", "--quality"}
    positional = [
        a for idx, a in enumerate(args)
        if not a.startswith("--") and not (idx > 0 and args[idx - 1] in flag_values)
    ]

    root = Path(
        positional[0] if positional
        else os.getenv("UPLOAD_DIR", str(Path(__file__).resolve().parent.parent / "uploads"))
    )
    if not root.is_dir():
        print(f"❌ uploads 目录不存在: {root}")
        return 1

    if recompress:
        return recompress_originals(root, min_mb, max_edge, quality, dry_run)

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
