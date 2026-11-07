from django.contrib.auth.models import Group, User
from django.core.cache import cache
from rest_framework.test import APITestCase

from study.models import AuditEntry

PW = "Str0ng-Pass-2026!"


class TeamTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_superuser("Herbert", password=PW)
        self.admin.groups.add(Group.objects.get(name="Researcher"))
        self.ra = User.objects.create_user("ra1", password=PW)
        self.ra.groups.add(Group.objects.get(name="Researcher"))

    def login(self, u, pw=PW):
        r = self.client.post("/api/auth/login", {"username": u, "password": pw}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}" if r.status_code == 200 else "")
        return r

    def test_only_admin_manages_team(self):
        self.login("ra1")
        self.assertEqual(self.client.get("/api/team").status_code, 403)
        self.login("Herbert")
        self.assertEqual(len(self.client.get("/api/team").data), 2)

    def test_add_person_then_forced_password_change(self):
        self.login("Herbert")
        r = self.client.post("/api/team", {"username": "mary", "name": "Mary K", "password": "Temp-Pass-4821", "role": "researcher"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data["mustChangePassword"])
        self.assertEqual(self.client.post("/api/team", {"username": "MARY", "password": "Temp-Pass-4821", "role": "viewer"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/team", {"username": "sam", "password": "123", "role": "viewer"}, format="json").status_code, 400)
        r = self.login("mary", "Temp-Pass-4821")
        self.assertTrue(r.data["user"]["mustChangePassword"])
        self.assertEqual(r.data["user"]["role"], "researcher")
        r = self.client.post("/api/auth/change-password", {"oldPassword": "Temp-Pass-4821", "newPassword": "Marys-Own-Pass-77"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")
        self.assertFalse(self.client.get("/api/auth/me").data["mustChangePassword"])
        self.assertTrue(AuditEntry.objects.filter(action="account", reason__contains="Added mary").exists())

    def test_change_role_reset_and_switch_off(self):
        self.login("Herbert")
        r = self.client.patch("/api/team/ra1", {"role": "viewer"}, format="json")
        self.assertEqual(r.data["role"], "viewer")
        r = self.client.patch("/api/team/ra1", {"password": "Reset-Pass-9911"}, format="json")
        self.assertTrue(r.data["mustChangePassword"])
        self.client.patch("/api/team/ra1", {"isActive": False}, format="json")
        self.assertEqual(self.login("ra1", "Reset-Pass-9911").status_code, 401)
        self.login("Herbert")
        self.client.patch("/api/team/ra1", {"isActive": True}, format="json")
        self.assertEqual(self.login("ra1", "Reset-Pass-9911").status_code, 200)

    def test_admin_cannot_lock_self_out(self):
        self.login("Herbert")
        self.assertEqual(self.client.patch("/api/team/Herbert", {"isActive": False}, format="json").status_code, 400)
        self.assertEqual(self.client.patch("/api/team/Herbert", {"isAdmin": False}, format="json").status_code, 400)
