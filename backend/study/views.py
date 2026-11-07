from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.models import update_last_login
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import logic
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

from .models import AuditEntry, CalibrationModel, Counter, Record, ReservedId, StudyProfile
from .permissions import RESEARCHER_GROUP, VIEWER_GROUP, StudyAccess, TeamAdmin, role_of
from .serializers import EDITABLE, ValidationError, from_api, to_api, to_summary, validate_edit_value


def must_change(u):
    p = StudyProfile.objects.filter(user=u).first()
    return bool(p and p.must_change_password)


def user_json(u):
    return {
        "username": u.get_username(),
        "name": u.get_full_name() or u.get_username(),
        "role": role_of(u),
        "isSuperuser": u.is_superuser,
        "mustChangePassword": must_change(u),
    }


def bad(msg, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": msg}, status=code)


class HealthView(APIView):
    """Unauthenticated ping used by Render's health check and to wake the server early."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"ok": True})


# ─── Auth ───────────────────────────────────────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "login"

    def post(self, request):
        user = authenticate(request, username=(request.data.get("username") or "").strip(), password=request.data.get("password") or "")
        if not user:
            return bad("Incorrect username or password.", status.HTTP_401_UNAUTHORIZED)
        token, _ = Token.objects.get_or_create(user=user)
        update_last_login(None, user)
        return Response({"token": token.key, "user": user_json(user)})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(user_json(request.user))


class ChangePasswordView(APIView):
    """Any signed-in user can change their own password. Other sessions are signed out."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        old, new = request.data.get("oldPassword") or "", request.data.get("newPassword") or ""
        if not user.check_password(old):
            return bad("Current password is incorrect.")
        if old == new:
            return bad("New password must be different from the current one.")
        try:
            password_validation.validate_password(new, user)
        except DjangoValidationError as e:
            return bad(" ".join(e.messages))
        user.set_password(new)
        user.save()
        StudyProfile.objects.update_or_create(user=user, defaults={"must_change_password": False})
        Token.objects.filter(user=user).delete()
        token = Token.objects.create(user=user)
        AuditEntry.objects.create(action="password", by=user)
        return Response({"token": token.key})


# ─── Study data ─────────────────────────────────────────────────────────────────────────

class ReserveIdView(APIView):
    permission_classes = [StudyAccess]

    def post(self, request):
        with transaction.atomic():
            c, _ = Counter.objects.select_for_update().get_or_create(name="participants")
            n = c.next_value
            c.next_value = n + 1
            c.save()
            pid = f"P{n:03d}"
            ReservedId.objects.create(participant_id=pid, reserved_by=request.user)
        return Response({"id": pid, "createdAt": timezone.now().isoformat()}, status=status.HTTP_201_CREATED)


class RecordListView(APIView):
    permission_classes = [StudyAccess]

    def get(self, request):
        qs = Record.objects.select_related("collected_by")
        return Response([to_summary(r) for r in qs])

    def post(self, request):
        try:
            fields = from_api(request.data)
        except ValidationError as e:
            return bad(str(e))
        pid = fields["participant_id"]
        if not ReservedId.objects.filter(participant_id=pid).exists():
            return bad(f"{pid} was never reserved.")
        try:
            with transaction.atomic():
                rec = Record.objects.create(collected_by=request.user, **fields)
                AuditEntry.objects.create(action="create", record_id=pid, by=request.user, app_version=fields["app_version"])
        except IntegrityError:
            return bad(f"{pid} has already been saved.", status.HTTP_409_CONFLICT)
        return Response(to_api(rec), status=status.HTTP_201_CREATED)


class RecordDetailView(APIView):
    permission_classes = [StudyAccess]

    def get_object(self, pid):
        return Record.objects.select_related("collected_by").filter(participant_id=pid).first()

    def get(self, request, pid):
        rec = self.get_object(pid)
        return Response(to_api(rec)) if rec else bad("Not found", status.HTTP_404_NOT_FOUND)

    def patch(self, request, pid):
        """Edits after saving require a reason and are written to the audit log with before/after values."""
        rec = self.get_object(pid)
        if not rec:
            return bad("Not found", status.HTTP_404_NOT_FOUND)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return bad("A reason is required to edit a saved record.")
        incoming = request.data.get("changes") or {}
        if not isinstance(incoming, dict):
            return bad("changes must be an object")
        bad_keys = set(incoming) - set(EDITABLE)
        if bad_keys:
            return bad(f"Not editable: {', '.join(sorted(bad_keys))}")
        diff = {}
        try:
            for k, v in incoming.items():
                v = validate_edit_value(k, v)
                old = getattr(rec, EDITABLE[k])
                if old != v:
                    diff[k] = {"from": old, "to": v}
                    setattr(rec, EDITABLE[k], v)
        except ValidationError as e:
            return bad(str(e))
        if not diff:
            return bad("No changes.")
        with transaction.atomic():
            rec.last_edited_at = timezone.now()
            rec.save()
            AuditEntry.objects.create(
                action="edit", record_id=pid, by=request.user, reason=reason, changes=diff,
                app_version=str(request.data.get("appVersion") or "")[:20],
            )
        return Response(to_api(rec))


class AuditListView(APIView):
    permission_classes = [StudyAccess]

    def get(self, request):
        qs = AuditEntry.objects.select_related("by")[:1000]
        return Response([
            {"at": a.at.isoformat(), "action": a.action, "recordId": a.record_id, "by": a.by.get_username(),
             "appVersion": a.app_version, "reason": a.reason, "changes": a.changes}
            for a in qs
        ])


class GapsView(APIView):
    """Participant IDs that were reserved but never saved (abandoned sessions)."""

    permission_classes = [StudyAccess]

    def get(self, request):
        saved = set(Record.objects.values_list("participant_id", flat=True))
        return Response([
            {"id": r.participant_id, "reservedAt": r.reserved_at.isoformat()}
            for r in ReservedId.objects.all() if r.participant_id not in saved
        ])


class StatsView(APIView):
    permission_classes = [StudyAccess]

    def get(self, request):
        recs = [to_api(r) for r in Record.objects.select_related("collected_by")]
        return Response(logic.stats(recs))


class ExportView(APIView):
    """CSV downloads: ?kind=records (one row per participant) | landmarks (long format) | audit."""

    permission_classes = [StudyAccess]

    def get(self, request):
        kind = request.query_params.get("kind", "records")
        stamp = timezone.localdate().isoformat()
        if kind == "audit":
            rows = [{"at": a.at.isoformat(), "action": a.action, "recordId": a.record_id, "by": a.by.get_username(),
                     "appVersion": a.app_version, "reason": a.reason, "changes": a.changes or ""}
                    for a in AuditEntry.objects.select_related("by").order_by("at", "id")]
            body = logic.to_csv(rows, ["at", "action", "recordId", "by", "appVersion", "reason", "changes"])
        else:
            recs = [to_api(r) for r in Record.objects.select_related("collected_by")]
            if kind == "landmarks":
                body = logic.to_csv(list(logic.landmarks_rows(recs)), ["id", "view", "landmark", "x", "y", "z", "visibility"])
            elif kind == "records":
                rows = [logic.flatten(r) for r in recs]
                body = logic.to_csv(rows, list(rows[0].keys()) if rows else ["id"])
            else:
                return bad("kind must be records, landmarks or audit")
        AuditEntry.objects.create(action="export", by=request.user, reason=f"{kind} CSV")
        resp = HttpResponse(body, content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="fitscan-{kind}-{stamp}.csv"'
        return resp


class CalibrationView(APIView):
    permission_classes = [StudyAccess]

    def get(self, request):
        c = CalibrationModel.objects.filter(is_active=True).first()
        return Response({"calibration": c.data if c else None, "uploadedAt": c.uploaded_at.isoformat() if c else None})

    def post(self, request):
        try:
            data = logic.validate_calibration(request.data)
        except ValueError as e:
            return bad(f"Rejected: {e}")
        with transaction.atomic():
            CalibrationModel.objects.filter(is_active=True).update(is_active=False)
            CalibrationModel.objects.create(version=data["version"], data=data, uploaded_by=request.user)
            AuditEntry.objects.create(action="calibration", by=request.user, reason=f"Activated {data['version']}")
        return Response({"calibration": data}, status=status.HTTP_201_CREATED)


# ─── Team (study admin only) ────────────────────────────────────────────────────────────

ROLE_GROUP = {"researcher": RESEARCHER_GROUP, "viewer": VIEWER_GROUP}


def team_json(u):
    return {
        "username": u.get_username(),
        "name": u.get_full_name(),
        "role": role_of(u),
        "isAdmin": u.is_superuser,
        "isActive": u.is_active,
        "mustChangePassword": must_change(u),
        "lastLogin": u.last_login.isoformat() if u.last_login else None,
        "dateJoined": u.date_joined.isoformat(),
    }


def _set_role(u, role):
    u.groups.remove(*Group.objects.filter(name__in=ROLE_GROUP.values()))
    u.groups.add(Group.objects.get(name=ROLE_GROUP[role]))


def _check_password(pw, user):
    try:
        password_validation.validate_password(pw, user)
    except DjangoValidationError as e:
        raise ValidationError(" ".join(e.messages))


class TeamView(APIView):
    permission_classes = [TeamAdmin]

    def get(self, request):
        return Response([team_json(u) for u in get_user_model().objects.order_by("-is_active", "username")])

    def post(self, request):
        User = get_user_model()
        d = request.data
        username = (d.get("username") or "").strip()
        role = d.get("role")
        if not username or len(username) > 150 or not all(c.isalnum() or c in "@.+-_" for c in username):
            return bad("Username can use letters, numbers and @ . + - _ only.")
        if User.objects.filter(username__iexact=username).exists():
            return bad(f"The username {username} is already taken.")
        if role not in ROLE_GROUP:
            return bad("Choose Researcher or Viewer.")
        is_admin = bool(d.get("isAdmin"))
        u = User(username=username, first_name=(d.get("name") or "").strip()[:150], is_staff=is_admin, is_superuser=is_admin)
        try:
            _check_password(d.get("password") or "", u)
        except ValidationError as e:
            return bad(str(e))
        with transaction.atomic():
            u.set_password(d["password"])
            u.save()
            _set_role(u, role)
            StudyProfile.objects.create(user=u, must_change_password=True)
            AuditEntry.objects.create(action="account", by=request.user, reason=f"Added {username} as {role}{' (admin)' if is_admin else ''}")
        return Response(team_json(u), status=status.HTTP_201_CREATED)


class TeamMemberView(APIView):
    permission_classes = [TeamAdmin]

    def patch(self, request, username):
        u = get_user_model().objects.filter(username=username).first()
        if not u:
            return bad("Not found", status.HTTP_404_NOT_FOUND)
        d = request.data
        is_self = u.pk == request.user.pk
        notes = []
        try:
            with transaction.atomic():
                if "role" in d:
                    if d["role"] not in ROLE_GROUP:
                        raise ValidationError("Choose Researcher or Viewer.")
                    _set_role(u, d["role"])
                    notes.append(f"role to {d['role']}")
                if "isAdmin" in d:
                    if is_self and not d["isAdmin"]:
                        raise ValidationError("You can't remove your own admin rights.")
                    u.is_superuser = u.is_staff = bool(d["isAdmin"])
                    notes.append("made admin" if d["isAdmin"] else "removed admin")
                if "isActive" in d:
                    if is_self and not d["isActive"]:
                        raise ValidationError("You can't switch off your own account.")
                    u.is_active = bool(d["isActive"])
                    if not u.is_active:
                        Token.objects.filter(user=u).delete()
                    notes.append("switched on" if u.is_active else "switched off")
                if d.get("password"):
                    _check_password(d["password"], u)
                    u.set_password(d["password"])
                    Token.objects.filter(user=u).delete()
                    StudyProfile.objects.update_or_create(user=u, defaults={"must_change_password": True})
                    notes.append("password reset")
                if "name" in d:
                    u.first_name = (d.get("name") or "").strip()[:150]
                    notes.append("name changed")
                if not notes:
                    raise ValidationError("No changes.")
                u.save()
                AuditEntry.objects.create(action="account", by=request.user, reason=f"{username}: {', '.join(notes)}")
        except ValidationError as e:
            return bad(str(e))
        return Response(team_json(u))
