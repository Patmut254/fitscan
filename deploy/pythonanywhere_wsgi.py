# Paste this into the WSGI configuration file on PythonAnywhere's Web tab.
# Replace USERNAME with your PythonAnywhere username.
import os
import sys

path = "/home/USERNAME/fitscan/backend"
if path not in sys.path:
    sys.path.insert(0, path)

os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"

from django.core.wsgi import get_wsgi_application  # noqa: E402

application = get_wsgi_application()
