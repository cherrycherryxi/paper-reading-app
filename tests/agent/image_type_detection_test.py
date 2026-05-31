"""Tests for the _detect_image_type magic-byte helper (OPT-007).

Ensures we correctly identify PNG, JPEG, WebP, and GIF without imghdr.
"""
import base64
import unittest

import app_server


class DetectImageTypeTests(unittest.TestCase):
    def test_png_detected(self):
        # PNG magic bytes: \x89PNG
        data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        self.assertEqual(app_server._detect_image_type(data), "png")

    def test_jpeg_detected(self):
        # JPEG magic bytes: \xff\xd8
        data = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        self.assertEqual(app_server._detect_image_type(data), "jpeg")

    def test_webp_detected(self):
        # WebP: RIFF....WEBP
        data = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 100
        self.assertEqual(app_server._detect_image_type(data), "webp")

    def test_gif_detected(self):
        # GIF magic bytes: GIF8 (GIF87a or GIF89a)
        data = b"GIF89a" + b"\x00" * 100
        self.assertEqual(app_server._detect_image_type(data), "gif")

    def test_unknown_returns_none(self):
        data = b"\x00\x01\x02\x03" * 20
        self.assertIsNone(app_server._detect_image_type(data))

    def test_empty_returns_none(self):
        self.assertIsNone(app_server._detect_image_type(b""))

    def test_real_png_bytes_detected(self):
        # Smallest valid 1x1 PNG
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
            "53de0000000c4944415408d76368606000000005000150ad9cf90000000049"
            "454e44ae426082"
        )
        self.assertEqual(app_server._detect_image_type(png), "png")


if __name__ == "__main__":
    unittest.main()
