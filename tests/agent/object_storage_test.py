"""Regression tests for S3-compatible object storage (P3 commercialization).

We mock boto3 at the module level to avoid network calls and avoid requiring
boto3 to be installed in the test environment."""
import base64
import sys
import tempfile
import types
import unittest
from pathlib import Path

import app_server


class _FakeS3Client:
    def __init__(self):
        self.put_calls = []
        self.delete_calls = []
        self.objects = {}

    def put_object(self, **kwargs):
        self.put_calls.append(kwargs)
        self.objects[kwargs["Key"]] = kwargs["Body"]

    def get_paginator(self, name):
        # list_objects_v2 paginator
        outer = self

        class P:
            def paginate(_self, Bucket, Prefix):
                hits = [k for k in outer.objects if k.startswith(Prefix)]
                yield {"Contents": [{"Key": k} for k in hits]} if hits else {"Contents": []}

        return P()

    def delete_objects(self, **kwargs):
        self.delete_calls.append(kwargs)
        for o in kwargs.get("Delete", {}).get("Objects", []):
            self.objects.pop(o["Key"], None)


class ObjectStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()

        # Stash original S3 config so we can restore
        self._orig = {k: getattr(app_server, k) for k in (
            "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY",
            "S3_ENDPOINT", "S3_PUBLIC_BASE", "S3_REGION",
        )}
        # Install a fake boto3 module
        self.fake_client = _FakeS3Client()
        fake_boto3 = types.ModuleType("boto3")
        fake_boto3.client = lambda *args, **kwargs: self.fake_client
        sys.modules["boto3"] = fake_boto3

    def tearDown(self):
        for k, v in self._orig.items():
            setattr(app_server, k, v)
        sys.modules.pop("boto3", None)
        self.temp_dir.cleanup()

    def _configure_s3(self):
        app_server.S3_BUCKET = "test-bucket"
        app_server.S3_ACCESS_KEY = "AKIA_test"
        app_server.S3_SECRET_KEY = "secret_test"
        app_server.S3_REGION = "us-east-1"
        app_server.S3_ENDPOINT = ""
        app_server.S3_PUBLIC_BASE = "https://cdn.example.com"

    def _png_data_url(self) -> str:
        # Smallest valid PNG (1x1 black)
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
            "53de0000000c4944415408d76368606000000005000150ad9cf90000000049"
            "454e44ae426082"
        )
        return f"data:image/png;base64,{base64.b64encode(png).decode()}"

    def test_save_image_falls_back_to_local_when_s3_not_configured(self):
        # No S3 env → local disk path
        url = app_server.save_image("user-1", self._png_data_url(), "x")
        self.assertTrue(url.startswith("/media/user-1/"))
        self.assertEqual(len(self.fake_client.put_calls), 0,
                         "S3 must not be called when not configured")

    def test_save_image_uploads_to_s3_when_configured(self):
        self._configure_s3()
        url = app_server.save_image("user-9", self._png_data_url(), "x")
        self.assertTrue(url.startswith("https://cdn.example.com/user-9/"),
                        f"public URL composition unexpected: {url}")
        self.assertEqual(len(self.fake_client.put_calls), 1)
        call = self.fake_client.put_calls[0]
        self.assertEqual(call["Bucket"], "test-bucket")
        self.assertTrue(call["Key"].startswith("user-9/"))
        self.assertEqual(call["ContentType"], "image/png")
        self.assertIn("immutable", call["CacheControl"])

    def test_media_url_to_data_url_rejects_other_users_s3_object(self):
        self._configure_s3()
        self.fake_client.objects["userA/img.jpg"] = b"\xff\xd8\xff\xd9"
        # User B trying to read user A's image
        with self.assertRaises(ValueError) as ctx:
            app_server.media_url_to_data_url(
                "userB",
                "https://cdn.example.com/userA/img.jpg",
            )
        self.assertIn("does not belong", str(ctx.exception))

    def test_delete_object_storage_prefix_removes_only_users_objects(self):
        self._configure_s3()
        self.fake_client.objects = {
            "user-x/img1.jpg": b"a",
            "user-x/img2.jpg": b"b",
            "user-y/img3.jpg": b"c",  # other user
        }
        deleted = app_server.delete_object_storage_prefix("user-x/")
        self.assertEqual(deleted, 2)
        # Other user's data must be preserved
        self.assertIn("user-y/img3.jpg", self.fake_client.objects)
        self.assertNotIn("user-x/img1.jpg", self.fake_client.objects)

    def test_delete_object_storage_prefix_silent_when_s3_disabled(self):
        # No S3 config
        self.assertEqual(app_server.delete_object_storage_prefix("anything/"), 0)

    def test_save_image_uses_endpoint_url_when_provided(self):
        self._configure_s3()
        app_server.S3_ENDPOINT = "https://r2.cloudflarestorage.com"
        app_server.S3_PUBLIC_BASE = ""  # force endpoint-based URL composition
        url = app_server.save_image("u", self._png_data_url(), "x")
        # When S3_PUBLIC_BASE is empty we fall back to endpoint + bucket
        self.assertIn("r2.cloudflarestorage.com", url)
        self.assertIn("test-bucket", url)


if __name__ == "__main__":
    unittest.main()
