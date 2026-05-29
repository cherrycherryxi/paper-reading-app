"""Regression tests for production deployment configuration (P3 commercialization).
These don't run docker — they just validate config files have the expected structure
so a missing env binding or volume mount can't sneak into a release."""
import os
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class DeploymentConfigTests(unittest.TestCase):
    def test_dockerfile_exists_and_runs_as_nonroot_with_healthcheck(self):
        path = REPO_ROOT / "Dockerfile"
        self.assertTrue(path.exists(), "Dockerfile must exist")
        content = path.read_text()
        self.assertIn("FROM python:3.11", content, "must base on python 3.11")
        self.assertIn("USER paperapp", content, "must run as non-root")
        self.assertIn("HEALTHCHECK", content, "must define a healthcheck")
        self.assertIn("/api/health", content, "healthcheck must hit /api/health")
        self.assertIn("EXPOSE 8787", content)
        # Critical app files must be copied
        for f in ("app_server.py", "index.html", "app.js", "chat.js", "styles.css",
                  "privacy.html", "terms.html", "landing.html"):
            self.assertIn(f, content, f"Dockerfile must COPY {f}")

    def test_dockerignore_excludes_sensitive_local_paths(self):
        path = REPO_ROOT / ".dockerignore"
        self.assertTrue(path.exists())
        content = path.read_text()
        for required in ("__pycache__", ".git", ".venv", ".wolf",
                         "app_state.db", "uploads/", "tests/"):
            self.assertIn(required, content,
                          f".dockerignore must exclude {required}")

    def test_docker_compose_has_app_and_caddy_services_with_required_env(self):
        path = REPO_ROOT / "docker-compose.yml"
        self.assertTrue(path.exists())
        content = path.read_text()
        self.assertIn("app:", content, "must define app service")
        self.assertIn("caddy:", content, "must define caddy service")
        # Caddy must publish HTTP + HTTPS
        self.assertIn('"80:80"', content)
        self.assertIn('"443:443"', content)
        # Critical env vars passed through
        for env_name in ("DEEPSEEK_API_KEY", "MOONSHOT_API_KEY",
                         "APP_PUBLIC_URL", "ADMIN_TOKEN", "DB_PATH", "UPLOAD_DIR"):
            self.assertIn(env_name, content,
                          f"docker-compose must wire {env_name}")
        # Named volumes for persistence
        self.assertIn("paper_db:", content,
                      "must define paper_db volume for SQLite persistence")
        self.assertIn("paper_uploads:", content,
                      "must define paper_uploads volume for image persistence")
        self.assertIn("caddy_data:", content,
                      "must define caddy_data volume for Let's Encrypt certs")
        # app must NOT publish 8787 to host (only caddy reaches it)
        self.assertNotIn('"8787:8787"', content,
                         "app must not expose 8787 to host — Caddy reverse-proxies")

    def test_caddyfile_has_reverse_proxy_security_headers_and_streaming(self):
        path = REPO_ROOT / "Caddyfile"
        self.assertTrue(path.exists())
        content = path.read_text()
        self.assertIn("{$DOMAIN}", content,
                      "Caddyfile must use $DOMAIN env var, not a hardcoded host")
        self.assertIn("reverse_proxy app:8787", content)
        self.assertIn("flush_interval -1", content,
                      "SSE streaming requires flush_interval -1")
        # HSTS + content-type-sniffing protections
        self.assertIn("Strict-Transport-Security", content)
        self.assertIn("X-Content-Type-Options", content)

    def test_env_example_includes_every_runtime_env_var(self):
        path = REPO_ROOT / ".env.example"
        self.assertTrue(path.exists())
        content = path.read_text()
        for key in ("DOMAIN", "APP_PUBLIC_URL", "DEEPSEEK_API_KEY",
                    "MOONSHOT_API_KEY", "SMTP_HOST", "ADMIN_TOKEN"):
            self.assertIn(key, content, f".env.example must document {key}")

    def test_app_server_reads_db_path_and_upload_dir_from_env(self):
        # The container relies on these being env-tunable. If a refactor
        # hardcodes them again, deploys silently break.
        src = (REPO_ROOT / "app_server.py").read_text()
        self.assertIn("os.getenv(\"DB_PATH\"", src,
                      "DB_PATH must be env-configurable for containerized deploys")
        self.assertIn("os.getenv(\"UPLOAD_DIR\"", src,
                      "UPLOAD_DIR must be env-configurable")
        self.assertIn("os.getenv(\"ADMIN_TOKEN\"", src,
                      "ADMIN_TOKEN must be env-configurable to lock /debug/*")


if __name__ == "__main__":
    unittest.main()
