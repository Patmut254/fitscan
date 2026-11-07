from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APITestCase

from study.logic import check_tape, mean_closest_two, needs_third, stats, sus_score, validate_calibration
from study.models import AuditEntry, Record

PW = "Str0ng-Pass-2026!"


def payload(pid, **over):
    p = {
        "id": pid, "createdAt": "2026-11-07T09:00:00+03:00", "appVersion": "0.2.0", "consentPaperSigned": True,
        "sex": "female", "ageBand": "25-34", "heightCm": 165, "weightKg": 60, "selfSize": "10",
        "chart": "womenswear", "phoneModel": "Pixel 8",
        "tape": {"chest": [86, 86.4], "waist": [68, 70, 69.6], "hip": [93, 93], "inseam": [76, 76.2]},
        "tapeMean": {"chest": 0, "waist": 0, "hip": 0, "inseam": 0},
        "scan": {"chest": 84, "waist": 66, "hip": 90, "inseam": 74, "processingMs": 800, "retakes": 1,
                 "landmarks": {"front": [{"x": 0.5, "y": 0.1, "z": 0, "v": 0.9}], "side": []}},
        "calibrated": None,
        "sizes": {"self": "10", "tape": {"size": "10", "boundaryDistanceCm": 2}, "scanRaw": {"size": "8", "boundaryDistanceCm": -0.3}, "scanCal": None},
        "sus": {"items": [4, 2, 4, 1, 4, 2, 3, 2, 4, 1], "score": 0},
    }
    p.update(over)
    return p


class LogicTests(APITestCase):
    def test_tape_rules(self):
        self.assertFalse(needs_third(80.3, 79.3))
        self.assertTrue(needs_third(80, 81.1))
        self.assertAlmostEqual(mean_closest_two([80, 82, 82.4]), 82.2)
        with self.assertRaisesRegex(ValueError, "reading 3 required"):
            check_tape({"chest": [80, 82], "waist": [70, 70], "hip": [90, 90], "inseam": [70, 70]})

    def test_sus(self):
        self.assertEqual(sus_score([5, 1] * 5), 100)
        self.assertEqual(sus_score([4, 2, 4, 1, 4, 2, 3, 2, 4, 1]), 77.5)
        with self.assertRaises(ValueError):
            sus_score([6] * 10)

    def test_calibration_validation(self):
        c = validate_calibration({"version": "v1", "models": {"chest": {"b0": 1, "b1": 1, "b2": 0, "b3": 0}}})
        self.assertEqual(c["sexCoding"]["prefer_not_to_say"], 0.5)
        with self.assertRaises(ValueError):
            validate_calibration({"version": "v1", "models": {"neck": {"b0": 1, "b1": 1, "b2": 0, "b3": 0}}})


class ApiTests(APITestCase):
    def setUp(self):
        cache.clear()  # reset login throttle between tests
        self.res = User.objects.create_user("anita", password=PW)
        self.res.groups.add(Group.objects.get(name="Researcher"))
        self.viewer = User.objects.create_user("supervisor", password=PW)
        self.viewer.groups.add(Group.objects.get(name="Viewer"))
        self.nobody = User.objects.create_user("random", password=PW)

    def login(self, username):
        r = self.client.post("/api/auth/login", {"username": username, "password": PW}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")
        return r.data

    def reserve(self):
        return self.client.post("/api/participants/reserve").data["id"]

    def test_login_and_roles(self):
        self.assertEqual(self.client.post("/api/auth/login", {"username": "anita", "password": "x"}, format="json").status_code, 401)
        self.assertEqual(self.login("anita")["user"]["role"], "researcher")
        self.client.credentials()
        self.assertEqual(self.client.get("/api/records").status_code, 401)

    def test_change_password(self):
        self.login("anita")
        r = self.client.post("/api/auth/change-password", {"oldPassword": "wrong", "newPassword": "An0ther-Good-Pass"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/auth/change-password", {"oldPassword": PW, "newPassword": "short"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/auth/change-password", {"oldPassword": PW, "newPassword": "An0ther-Good-Pass"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)  # old token revoked
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)
        self.assertTrue(User.objects.get(username="anita").check_password("An0ther-Good-Pass"))
        self.assertTrue(AuditEntry.objects.filter(action="password").exists())

    def test_sequential_ids(self):
        self.login("anita")
        self.assertEqual([self.reserve() for _ in range(3)], ["P001", "P002", "P003"])

    def test_create_record_recomputes_and_audits(self):
        self.login("anita")
        pid = self.reserve()
        r = self.client.post("/api/records", payload(pid), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["tapeMean"]["waist"], 69.8)
        self.assertEqual(r.data["sus"]["score"], 77.5)
        self.assertTrue(AuditEntry.objects.filter(action="create", record_id=pid).exists())
        self.assertEqual(self.client.post("/api/records", payload(pid), format="json").status_code, 409)

    def test_create_rejects_bad_input(self):
        self.login("anita")
        pid = self.reserve()
        self.assertEqual(self.client.post("/api/records", payload("P999"), format="json").status_code, 400)  # not reserved
        self.assertEqual(self.client.post("/api/records", payload(pid, name="Jane"), format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/records", payload(pid, consentPaperSigned=False), format="json").status_code, 400)
        big = payload(pid)
        big["scan"]["photo"] = "data:image/jpeg;base64," + "A" * 500
        r = self.client.post("/api/records", big, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("not allowed", r.data["detail"])

    def test_edit_requires_reason(self):
        self.login("anita")
        pid = self.reserve()
        self.client.post("/api/records", payload(pid), format="json")
        self.assertEqual(self.client.patch(f"/api/records/{pid}", {"changes": {"heightCm": 166}}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/records/{pid}", {"changes": {"tape": {}}, "reason": "x"}, format="json").status_code, 400)
        r = self.client.patch(f"/api/records/{pid}", {"changes": {"heightCm": 166}, "reason": "Typo in height"}, format="json")
        self.assertEqual(r.status_code, 200)
        e = AuditEntry.objects.get(action="edit")
        self.assertEqual(e.changes, {"heightCm": {"from": 165.0, "to": 166.0}})
        self.assertEqual(e.reason, "Typo in height")

    def test_viewer_is_read_only_and_nobody_has_no_access(self):
        self.login("anita")
        pid = self.reserve()
        self.client.post("/api/records", payload(pid), format="json")
        self.login("supervisor")
        self.assertEqual(len(self.client.get("/api/records").data), 1)
        self.assertEqual(self.client.get("/api/stats").status_code, 200)
        self.assertEqual(self.client.post("/api/participants/reserve").status_code, 403)
        self.assertEqual(self.client.patch(f"/api/records/{pid}", {"changes": {"heightCm": 170}, "reason": "x"}, format="json").status_code, 403)
        self.login("random")
        self.assertEqual(self.client.get("/api/records").status_code, 403)

    def test_export_and_stats(self):
        self.login("anita")
        for _ in range(2):
            self.client.post("/api/records", payload(self.reserve()), format="json")
        self.reserve()  # abandoned
        csv = self.client.get("/api/export?kind=records").content.decode("utf-8-sig").strip().split("\r\n")
        self.assertEqual(len(csv), 3)
        header = csv[0].split(",")
        self.assertEqual(csv[1].split(",")[header.index("tape_waist_r3")], "69.6")
        self.assertNotIn("name", header)
        lm = self.client.get("/api/export?kind=landmarks").content.decode("utf-8-sig").strip().split("\r\n")
        self.assertEqual(len(lm), 3)
        self.assertEqual([g["id"] for g in self.client.get("/api/participants/gaps").data], ["P003"])
        s = self.client.get("/api/stats").data
        self.assertEqual(s["n"], 2)
        self.assertAlmostEqual(s["measures"]["chest"]["rawBias"], 84 - 86.2)
        self.assertEqual(s["sizeAgreement"]["scanRawVsTape"]["pct"], 0)
        self.assertEqual(s["sus"]["mean"], 77.5)

    def test_calibration_upload(self):
        self.login("anita")
        self.assertIsNone(self.client.get("/api/calibration").data["calibration"])
        bad = self.client.post("/api/calibration", {"version": "v1", "models": {}}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post("/api/calibration", {"version": "v1", "trainedOnIds": ["P001"], "models": {"chest": {"b0": 1, "b1": 1, "b2": 0, "b3": 0}}}, format="json")
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(self.client.get("/api/calibration").data["calibration"]["version"], "v1")

    def test_seed_demo_and_clear(self):
        call_command("seed_demo", n=5, stdout=open("/dev/null", "w"))
        self.assertEqual(Record.objects.count(), 5)
        self.login("anita")
        self.assertEqual(self.client.get("/api/stats").data["n"], 5)
        call_command("seed_demo", clear=True, stdout=open("/dev/null", "w"))
        self.assertEqual(Record.objects.count(), 0)


class AdminTests(APITestCase):
    def test_admin_lists_records_read_only(self):
        su = User.objects.create_superuser("boss", password=PW)
        call_command("seed_demo", n=3, stdout=open("/dev/null", "w"))
        self.client.force_login(su)
        r = self.client.get("/admin/study/record/")
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "P001")
        self.assertNotContains(r, "Add record")
        rec = Record.objects.first()
        self.assertEqual(self.client.get(f"/admin/study/record/{rec.pk}/change/").status_code, 200)
        r = self.client.post("/admin/study/record/", {"action": "export_csv", "_selected_action": [rec.pk]})
        self.assertEqual(r["Content-Type"], "text/csv; charset=utf-8")
