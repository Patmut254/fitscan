"""
Create a study account.

    python manage.py create_user anita --role researcher           # can collect, edit, export
    python manage.py create_user supervisor --role viewer          # read-only dashboard
    python manage.py create_user admin --role researcher --superuser  # also gets /admin/
"""
import getpass

from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create a FitScan researcher or viewer account"

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--role", choices=["researcher", "viewer"], default="researcher")
        parser.add_argument("--superuser", action="store_true", help="Also allow access to Django /admin/")
        parser.add_argument("--password", help="Avoid on shared machines; prompts if omitted")

    def handle(self, username, role, superuser, password, **_):
        User = get_user_model()
        if User.objects.filter(username=username).exists():
            raise CommandError(f"User {username} already exists")
        if not password:
            password = getpass.getpass("Password: ")
            if password != getpass.getpass("Password (again): "):
                raise CommandError("Passwords do not match")
        user = User(username=username, is_staff=superuser, is_superuser=superuser)
        password_validation.validate_password(password, user)
        user.set_password(password)
        user.save()
        user.groups.add(Group.objects.get(name="Researcher" if role == "researcher" else "Viewer"))
        self.stdout.write(self.style.SUCCESS(f"Created {role} {username}{' (superuser)' if superuser else ''}"))
