from django.contrib.auth.models import Group, User
from django.core.cache import cache
from rest_framework.test import APITestCase

from study.models import ConsentRecord
from study.tests.test_api import payload

PW = "Str0ng-Pass-2026!"


class ConsentTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_superuser("Herbert", password=PW)
        self.admin.groups.add(Group.objects.get(name="Researcher"))
        v = User.objects.create_user("sup", password=PW)
        v.groups.add(Group.objects.get(name="Viewer"))

    def login(self, u):
        r = self.client.post("/api/auth/login", {"username": u, "password": PW}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")

    def save(self, consent):
        pid = self.client.post("/api/participants/reserve").data["id"]
        return pid, self.client.post("/api/records", payload(pid, consent=consent), format="json")

    def test_default_form_exists_and_admin_can_edit(self):
        self.login("Herbert")
        f = self.client.get("/api/consent-form").data
        self.assertEqual(f["version"], 1)
        self.assertGreaterEqual(len(f["statements"]), 3)
        r = self.client.post("/api/consent-form", {"title": "New title", "intro": "", "statements": ["I agree.", "  "]}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["version"], 2)
        self.assertEqual(r.data["statements"], ["I agree."])
        self.login("sup")
        self.assertEqual(self.client.post("/api/consent-form", {"title": "x", "statements": ["y"]}, format="json").status_code, 403)

    def test_electronic_consent_saved_separately_with_wording(self):
        self.login("Herbert")
        pid, r = self.save({"method": "electronic", "initials": "j.k.", "formVersion": 1, "signedAt": "2026-11-08T10:00:00+03:00", "agreedAll": True})
        self.assertEqual(r.status_code, 201, r.data)
        c = ConsentRecord.objects.get(participant_id=pid)
        self.assertEqual(c.initials, "JK")
        self.assertEqual(c.form_version, 1)
        self.assertTrue(c.statements)
        self.assertEqual(r.data["consentMethod"], "electronic")

    def test_electronic_consent_rules(self):
        self.login("Herbert")
        base = {"method": "electronic", "initials": "JK", "formVersion": 1, "signedAt": "2026-11-08T10:00:00+03:00", "agreedAll": True}
        self.assertEqual(self.save({**base, "initials": "  "})[1].status_code, 400)
        self.assertEqual(self.save({**base, "initials": "ABCDE"})[1].status_code, 400)
        self.assertEqual(self.save({**base, "agreedAll": False})[1].status_code, 400)
        self.assertEqual(self.save({**base, "formVersion": 99})[1].status_code, 400)
        self.assertEqual(self.save({"method": "paper"})[1].status_code, 201)

    def test_initials_private(self):
        self.login("Herbert")
        pid, _ = self.save({"method": "electronic", "initials": "MW", "formVersion": 1, "signedAt": "2026-11-08T10:00:00+03:00", "agreedAll": True})
        self.assertEqual(self.client.get(f"/api/records/{pid}").data["consent"]["initials"], "MW")
        csv = self.client.get("/api/export?kind=records").content.decode("utf-8-sig")
        self.assertNotIn("MW", csv)
        self.assertIn("MW", self.client.get("/api/export?kind=consent").content.decode("utf-8-sig"))
        self.login("sup")
        self.assertNotIn("initials", self.client.get(f"/api/records/{pid}").data["consent"])
        self.assertEqual(self.client.get("/api/export?kind=consent").status_code, 403)

    def test_app_payload_with_consent_method_is_accepted(self):
        # The app sends consentMethod alongside the consent block (bug: "Fields not allowed: consentMethod").
        self.login("Herbert")
        pid = self.client.post("/api/participants/reserve").data["id"]
        body = payload(pid, consent={"method": "paper"})
        body["consentMethod"] = "paper"
        r = self.client.post("/api/records", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
