"""Regression tests for Stripe billing integration (P2 commercialization).

These don't call Stripe — they test our local handling of webhook events,
signature verification, and idempotency. Stripe API calls are mocked at
the stripe_request boundary."""
import hashlib
import hmac
import json
import tempfile
import time
import unittest
from io import BytesIO
from pathlib import Path

import app_server


def _sign_payload(payload: bytes, secret: str, ts: int = None) -> str:
    ts = ts if ts is not None else int(time.time())
    signed = f"{ts}.".encode("utf-8") + payload
    sig = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


class BillingWebhookTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        base_dir = Path(self.temp_dir.name)
        app_server.DB_PATH = base_dir / "test.db"
        app_server.UPLOAD_DIR = base_dir / "uploads"
        app_server.initialize_tool_schema_provider_for_tests()
        app_server.init_db()
        self._orig_secret = app_server.STRIPE_WEBHOOK_SECRET
        self._orig_skey = app_server.STRIPE_SECRET_KEY
        self._orig_price = app_server.STRIPE_PRICE_PLUS
        app_server.STRIPE_WEBHOOK_SECRET = "whsec_test"
        app_server.STRIPE_SECRET_KEY = "sk_test"
        app_server.STRIPE_PRICE_PLUS = "price_test"

        self.user_id = "user-1"
        self.conn = app_server.get_conn()
        now = app_server.now_iso()
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, email, created_at) VALUES (?,?,?,?,?)",
            (self.user_id, "alice", "x", "alice@example.com", now),
        )
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?,?,?,?)",
            ("tok-1", self.user_id, now, now),
        )
        self.conn.execute(
            "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?,?,?)",
            (self.user_id, json.dumps({"books": [], "sessions": [], "quotes": [], "chatHistories": {}}), now),
        )
        self.conn.commit()
        self.conn.close()

    def tearDown(self):
        app_server.STRIPE_WEBHOOK_SECRET = self._orig_secret
        app_server.STRIPE_SECRET_KEY = self._orig_skey
        app_server.STRIPE_PRICE_PLUS = self._orig_price
        self.temp_dir.cleanup()

    def _post_webhook(self, event, *, secret=None, bad_signature=False, stale=False):
        body = json.dumps(event).encode("utf-8")
        sig_secret = secret or app_server.STRIPE_WEBHOOK_SECRET
        ts = int(time.time()) - (10_000 if stale else 0)
        sig_header = _sign_payload(body, sig_secret, ts=ts)
        if bad_signature:
            sig_header = sig_header.replace("v1=", "v1=ffff")
        handler = app_server.Handler.__new__(app_server.Handler)
        handler.path = "/api/billing/webhook"
        handler.command = "POST"
        handler.headers = {
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "Stripe-Signature": sig_header,
        }
        handler.rfile = BytesIO(body)
        handler.wfile = BytesIO()
        handler._status = None
        handler.send_response = lambda c: setattr(handler, "_status", c)
        handler.send_header = lambda *a, **k: None
        handler.end_headers = lambda: None
        handler.do_POST()
        out = handler.wfile.getvalue().decode("utf-8")
        try:
            return handler._status, json.loads(out)
        except Exception:
            return handler._status, {"_raw": out}

    def test_signature_verification_rejects_bad_sig(self):
        status, body = self._post_webhook(
            {"id": "evt_1", "type": "ping"}, bad_signature=True,
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid_signature")

    def test_signature_verification_rejects_stale_timestamp(self):
        status, body = self._post_webhook(
            {"id": "evt_1", "type": "ping"}, stale=True,
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid_signature")

    def test_checkout_session_completed_upgrades_user_to_plus(self):
        event = {
            "id": "evt_checkout_1",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "client_reference_id": self.user_id,
                    "customer": "cus_123",
                    "subscription": "sub_123",
                    "amount_total": 4800,
                    "currency": "usd",
                }
            },
        }
        status, body = self._post_webhook(event)
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "handled")
        conn = app_server.get_conn()
        plan = conn.execute(
            "SELECT plan FROM users WHERE id=?", (self.user_id,)
        ).fetchone()["plan"]
        pay = conn.execute(
            "SELECT * FROM payments WHERE user_id=?", (self.user_id,)
        ).fetchone()
        conn.close()
        self.assertEqual(plan, "plus")
        self.assertEqual(pay["provider_subscription_id"], "sub_123")
        self.assertEqual(pay["amount_cents"], 4800)

    def test_subscription_updated_sets_plan_expires_at_to_current_period_end(self):
        # First seed a checkout-completed event to map subscription→user
        self._post_webhook({
            "id": "evt_checkout_x",
            "type": "checkout.session.completed",
            "data": {"object": {
                "client_reference_id": self.user_id,
                "subscription": "sub_xx",
                "customer": "cus_xx",
            }},
        })
        future_ts = int(time.time()) + 30 * 86400
        status, body = self._post_webhook({
            "id": "evt_sub_upd_1",
            "type": "customer.subscription.updated",
            "data": {"object": {
                "id": "sub_xx",
                "status": "active",
                "current_period_end": future_ts,
            }},
        })
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "handled")
        conn = app_server.get_conn()
        row = conn.execute(
            "SELECT plan, plan_expires_at FROM users WHERE id=?", (self.user_id,)
        ).fetchone()
        conn.close()
        self.assertEqual(row["plan"], "plus")
        self.assertTrue(row["plan_expires_at"], "plan_expires_at must be set")

    def test_subscription_deleted_downgrades_user_to_free(self):
        # Seed the subscription mapping
        self._post_webhook({
            "id": "evt_seed",
            "type": "checkout.session.completed",
            "data": {"object": {
                "client_reference_id": self.user_id,
                "subscription": "sub_to_cancel",
                "customer": "cus_y",
            }},
        })
        status, body = self._post_webhook({
            "id": "evt_cancel",
            "type": "customer.subscription.deleted",
            "data": {"object": {"id": "sub_to_cancel"}},
        })
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "handled")
        conn = app_server.get_conn()
        row = conn.execute(
            "SELECT plan, plan_expires_at FROM users WHERE id=?", (self.user_id,)
        ).fetchone()
        conn.close()
        self.assertEqual(row["plan"], "free")
        self.assertEqual(row["plan_expires_at"], "")

    def test_duplicate_event_is_idempotent(self):
        event = {
            "id": "evt_dup",
            "type": "checkout.session.completed",
            "data": {"object": {
                "client_reference_id": self.user_id,
                "subscription": "sub_dup",
                "customer": "cus_d",
            }},
        }
        status1, body1 = self._post_webhook(event)
        status2, body2 = self._post_webhook(event)
        self.assertEqual(status1, 200)
        self.assertEqual(body1["status"], "handled")
        self.assertEqual(status2, 200)
        self.assertEqual(body2["status"], "duplicate")
        # Only one payment row
        conn = app_server.get_conn()
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM payments WHERE user_id=?",
            (self.user_id,),
        ).fetchone()["n"]
        conn.close()
        self.assertEqual(count, 1)

    def test_payment_failed_records_event_without_changing_plan(self):
        # First make user plus
        self._post_webhook({
            "id": "evt_checkout",
            "type": "checkout.session.completed",
            "data": {"object": {
                "client_reference_id": self.user_id,
                "subscription": "sub_pf",
                "customer": "cus_pf",
            }},
        })
        status, body = self._post_webhook({
            "id": "evt_pf",
            "type": "invoice.payment_failed",
            "data": {"object": {"subscription": "sub_pf"}},
        })
        self.assertEqual(status, 200)
        conn = app_server.get_conn()
        row = conn.execute(
            "SELECT plan FROM users WHERE id=?", (self.user_id,)
        ).fetchone()
        pay = conn.execute(
            "SELECT status FROM payments WHERE provider_event_id='evt_pf'"
        ).fetchone()
        conn.close()
        self.assertEqual(row["plan"], "plus",
                         "payment_failed alone should not immediately downgrade (grace)")
        self.assertEqual(pay["status"], "payment_failed")

    def test_unknown_event_type_is_ignored_gracefully(self):
        status, body = self._post_webhook({
            "id": "evt_unknown",
            "type": "customer.created",  # not handled by us
            "data": {"object": {}},
        })
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ignored")

    def test_checkout_endpoint_returns_503_when_billing_not_configured(self):
        app_server.STRIPE_SECRET_KEY = ""
        body = b"{}"
        h = app_server.Handler.__new__(app_server.Handler)
        h.path = "/api/billing/checkout"
        h.command = "POST"
        h.headers = {"Authorization": "Bearer tok-1", "Content-Length": "0"}
        h.rfile = BytesIO(body)
        h.wfile = BytesIO()
        h._status = None
        h.send_response = lambda c: setattr(h, "_status", c)
        h.send_header = lambda *a, **k: None
        h.end_headers = lambda: None
        h.do_POST()
        self.assertEqual(h._status, 503)
        payload = json.loads(h.wfile.getvalue().decode())
        self.assertEqual(payload["error"], "billing_not_configured")

    def test_checkout_endpoint_returns_url_when_stripe_responds(self):
        # Patch stripe_request to fake a Checkout Session creation
        self._orig_stripe_req = app_server.stripe_request

        def fake_stripe(method, endpoint, *, params=None, idempotency_key=""):
            self.assertEqual(endpoint, "/checkout/sessions")
            self.assertEqual(params["line_items[0][price]"], "price_test")
            return {"url": "https://checkout.stripe.com/c/pay/cs_test_123"}

        app_server.stripe_request = fake_stripe
        try:
            body = b"{}"
            h = app_server.Handler.__new__(app_server.Handler)
            h.path = "/api/billing/checkout"
            h.command = "POST"
            h.headers = {"Authorization": "Bearer tok-1", "Content-Length": "0"}
            h.rfile = BytesIO(body)
            h.wfile = BytesIO()
            h._status = None
            h.send_response = lambda c: setattr(h, "_status", c)
            h.send_header = lambda *a, **k: None
            h.end_headers = lambda: None
            h.do_POST()
            self.assertEqual(h._status, 200)
            payload = json.loads(h.wfile.getvalue().decode())
            self.assertIn("checkout.stripe.com", payload["url"])
        finally:
            app_server.stripe_request = self._orig_stripe_req


class StripeSignatureUtilTests(unittest.TestCase):
    def test_verify_returns_true_for_correctly_signed_payload(self):
        payload = b'{"hello": "world"}'
        sig = _sign_payload(payload, "whsec_abc")
        self.assertTrue(app_server.verify_stripe_webhook_signature(payload, sig, "whsec_abc"))

    def test_verify_returns_false_when_payload_tampered(self):
        payload = b'{"hello": "world"}'
        sig = _sign_payload(payload, "whsec_abc")
        self.assertFalse(
            app_server.verify_stripe_webhook_signature(b'{"hello": "tampered"}', sig, "whsec_abc")
        )

    def test_verify_returns_false_for_empty_secret(self):
        self.assertFalse(
            app_server.verify_stripe_webhook_signature(b"x", "t=1,v1=abc", "")
        )

    def test_verify_handles_multiple_v1_signatures(self):
        # Stripe sometimes sends multiple v1 signatures (e.g. during key rotation)
        payload = b"x"
        sig = _sign_payload(payload, "whsec_a")
        # Append a bogus second signature
        bad_sig = sig + ",v1=bad"
        self.assertTrue(app_server.verify_stripe_webhook_signature(payload, bad_sig, "whsec_a"))


if __name__ == "__main__":
    unittest.main()
