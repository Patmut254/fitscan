from django.urls import path

from . import views

urlpatterns = [
    path("health", views.HealthView.as_view()),
    path("auth/login", views.LoginView.as_view()),
    path("auth/logout", views.LogoutView.as_view()),
    path("auth/me", views.MeView.as_view()),
    path("auth/change-password", views.ChangePasswordView.as_view()),
    path("participants/reserve", views.ReserveIdView.as_view()),
    path("participants/gaps", views.GapsView.as_view()),
    path("records", views.RecordListView.as_view()),
    path("records/<str:pid>", views.RecordDetailView.as_view()),
    path("audit", views.AuditListView.as_view()),
    path("stats", views.StatsView.as_view()),
    path("export", views.ExportView.as_view()),
    path("calibration", views.CalibrationView.as_view()),
    path("team", views.TeamView.as_view()),
    path("team/<str:username>", views.TeamMemberView.as_view()),
]
