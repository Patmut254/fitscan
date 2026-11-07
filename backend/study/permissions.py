from rest_framework.permissions import SAFE_METHODS, BasePermission

RESEARCHER_GROUP = "Researcher"
VIEWER_GROUP = "Viewer"


def role_of(user):
    if user.is_superuser or user.groups.filter(name=RESEARCHER_GROUP).exists():
        return "researcher"
    if user.groups.filter(name=VIEWER_GROUP).exists():
        return "viewer"
    return "none"


class StudyAccess(BasePermission):
    """Researchers read and write; viewers (e.g. a supervisor) read only; other accounts get nothing."""

    message = "Your account has no access to this study. Ask the admin to add you to the Researcher or Viewer group."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        role = role_of(request.user)
        if role == "researcher":
            return True
        return role == "viewer" and request.method in SAFE_METHODS


class TeamAdmin(BasePermission):
    """Only study admins (superusers) can add people, change roles or reset passwords."""

    message = "Only the study admin can manage the team."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)
