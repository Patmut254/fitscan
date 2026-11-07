"""
Create a study account.

    python manage.py create_user anita --role researcher           # can collect, edit, export
    python manage.py create_user supervisor --role viewer          # read-only dashboard
    python manage.py create_user admin --role researcher --superuser  # also gets /admin/
    python manage.py create_user anita --show                      # see the password as you type

Passwords need at least 10 characters, can't be all numbers, and can't be a common password.
"""
import getpass

from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create a FitScan researcher or viewer account"

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--role", choices=["researcher", "viewer"], default="researcher")
        parser.add_argument("--superuser", action="store_true", help="Also allow access to Django /admin/")
        parser.add_argument("--password", help="Avoid on shared machines; prompts if omitted")
        parser.add_argument("--show", action="store_true", help="Show the password while typing it")

    def handle(self, username, role, superuser, password, show, **_):
        User = get_user_model()
        if User.objects.filter(username=username).exists():
            raise CommandError(f"User {username} already exists")
        user = User(username=username, is_staff=superuser, is_superuser=superuser)

        if password:
            try:
                password_validation.validate_password(password, user)
            except ValidationError as e:
                raise CommandError(" ".join(e.messages))
        else:
            self.stdout.write("Password rules: at least 10 characters, not all numbers, not a common password.")
            ask = input if show else getpass.getpass
            if not show:
                self.stdout.write("Typing is hidden. Add --show to see the password as you type.")
            while True:
                password = ask("Password: ")
                if password != ask("Password (again): "):
                    self.stderr.write("The two passwords don't match. Try again.")
                    continue
                try:
                    password_validation.validate_password(password, user)
                    break
                except ValidationError as e:
                    self.stderr.write(" ".join(e.messages) + " Try again.")

        user.set_password(password)
        user.save()
        user.groups.add(Group.objects.get(name="Researcher" if role == "researcher" else "Viewer"))
        self.stdout.write(self.style.SUCCESS(f"Created {role} {username}{' (superuser)' if superuser else ''}"))
