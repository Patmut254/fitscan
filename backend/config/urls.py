from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponse
from django.urls import include, path, re_path

admin.site.site_header = settings.ADMIN_SITE_HEADER
admin.site.site_title = "FitScan admin"
admin.site.index_title = "Study data and accounts"


def spa(request, *args, **kwargs):
    """Serves the built React app for every non-API, non-admin URL."""
    index = settings.FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(open(index, "rb"), content_type="text/html")
    return HttpResponse(
        "<h1>FitScan API is running</h1><p>Build the app with <code>cd frontend && npm run build</code>, "
        "or run <code>npm run dev</code> and open http://localhost:5173. Django admin: <a href='/admin/'>/admin/</a></p>"
    )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("study.urls")),
    re_path(r"^(?!api/|admin/|static/).*$", spa),
]
