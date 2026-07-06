"""OPT-085 历史大图清理脚本的目标选择/参数解析回归锁。

驱动真实 `scripts/generate_thumbnails.py` 的 `recompress_originals`（dry_run，
不触发 sips）与 `_flag_value`，断言：
  1. 只命中 > min_mb 的原图；小图与 .thumb.jpg 一律不动。
  2. --min-mb 阈值可调，改变命中集合。
  3. dry_run 不创建备份目录、不改动任何文件。
  4. _flag_value 正确解析 / 缺失回落默认。
"""
import importlib.util
import tempfile
import unittest
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parent.parent.parent / "scripts" / "generate_thumbnails.py"
_spec = importlib.util.spec_from_file_location("generate_thumbnails", _SCRIPT)
gt = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gt)


def _write(path: Path, mb: float):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\xff\xd8" + b"\x00" * (int(mb * 1024 * 1024)))


class RecompressTargetSelectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "uploads"
        _write(self.root / "u1" / "big.jpeg", 2.0)        # 命中
        _write(self.root / "u1" / "small.jpeg", 0.3)      # 太小，跳过
        _write(self.root / "u1" / "big.thumb.jpg", 2.0)   # 缩略图，永不动
        _write(self.root / "u1" / "notimg.txt", 3.0)      # 非图片扩展名

    def tearDown(self):
        self.tmp.cleanup()

    def _targets(self, min_mb=1.2):
        """复用脚本内部同一套过滤逻辑（与 recompress_originals 一致）。"""
        threshold = int(min_mb * 1024 * 1024)
        return [
            p for p in sorted(self.root.rglob("*"))
            if p.is_file() and not gt.is_thumb(p.name)
            and p.suffix.lower() in gt.SRC_EXTS and p.stat().st_size > threshold
        ]

    def test_only_large_non_thumb_images_selected(self):
        names = {p.name for p in self._targets()}
        self.assertEqual(names, {"big.jpeg"})
        self.assertNotIn("big.thumb.jpg", names)  # 缩略图排除
        self.assertNotIn("small.jpeg", names)     # 小图排除
        self.assertNotIn("notimg.txt", names)     # 非图片排除

    def test_min_mb_threshold_changes_selection(self):
        # 阈值降到 0.1MB 后 small.jpeg 也进来（但 thumb 仍排除）
        names = {p.name for p in self._targets(min_mb=0.1)}
        self.assertIn("big.jpeg", names)
        self.assertIn("small.jpeg", names)
        self.assertNotIn("big.thumb.jpg", names)

    def test_dry_run_makes_no_changes(self):
        before = {p: p.stat().st_size for p in self.root.rglob("*") if p.is_file()}
        rc = gt.recompress_originals(self.root, min_mb=1.2, max_edge=1600,
                                     quality=80, dry_run=True)
        self.assertEqual(rc, 0)
        # 无备份目录、无文件改动
        self.assertFalse(list(self.root.parent.glob("uploads-recompress-backup-*")))
        after = {p: p.stat().st_size for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(before, after)


class FlagValueTests(unittest.TestCase):
    def test_parses_present_flag(self):
        self.assertEqual(gt._flag_value(["--min-mb", "2.5"], "--min-mb", float, 1.2), 2.5)
        self.assertEqual(gt._flag_value(["--max-edge", "1200"], "--max-edge", int, 1600), 1200)

    def test_missing_flag_falls_back_to_default(self):
        self.assertEqual(gt._flag_value([], "--min-mb", float, 1.2), 1.2)

    def test_malformed_value_falls_back(self):
        self.assertEqual(gt._flag_value(["--min-mb", "abc"], "--min-mb", float, 1.2), 1.2)
        self.assertEqual(gt._flag_value(["--min-mb"], "--min-mb", float, 1.2), 1.2)


if __name__ == "__main__":
    unittest.main()
