"""
Adds synthetic DEMO participants so you can explore the dashboard before real sessions.
Demo records have app_version "demo". Remove them with:  python manage.py seed_demo --clear
Never run this on the live study database once real data collection starts.
"""
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from study.logic import mean_closest_two, needs_third, sus_score
from study.models import AuditEntry, Counter, Record, ReservedId

W = [("4", 74, 56, 81), ("6", 78, 60, 85), ("8", 82, 64, 89), ("10", 86, 68, 93), ("12", 90.5, 72.5, 97.5),
     ("14", 95.5, 77.5, 102.5), ("16", 100.5, 82.5, 107.5), ("18", 106, 88, 113)]
M = [("S", 90, 75, 90), ("M", 98, 83, 98), ("L", 106, 91, 106), ("XL", 114, 99, 114)]


def nearest(chart, c, w, h):
    return min(chart, key=lambda s: (s[1] - c) ** 2 + (s[2] - w) ** 2 + (s[3] - h) ** 2)[0]


class Command(BaseCommand):
    help = "Create synthetic demo records (app_version=demo)"

    def add_arguments(self, parser):
        parser.add_argument("--n", type=int, default=16)
        parser.add_argument("--clear", action="store_true")

    @transaction.atomic
    def handle(self, n, clear, **_):
        if clear:
            ids = list(Record.objects.filter(app_version="demo").values_list("participant_id", flat=True))
            Record.objects.filter(app_version="demo").delete()
            AuditEntry.objects.filter(record_id__in=ids).delete()
            self.stdout.write(self.style.SUCCESS(f"Removed {len(ids)} demo records"))
            return
        user = get_user_model().objects.filter(is_superuser=True).first() or get_user_model().objects.first()
        if not user:
            self.stderr.write("Create a user first (python manage.py create_user ...)")
            return
        rnd = random.Random(7)
        c, _ = Counter.objects.get_or_create(name="participants")
        start = timezone.now() - timedelta(days=n)
        for i in range(n):
            pid = f"P{c.next_value:03d}"
            c.next_value += 1
            ReservedId.objects.create(participant_id=pid, reserved_by=user)
            male = rnd.random() < 0.45
            h = rnd.gauss(176 if male else 163, 7)
            body = {
                "chest": rnd.gauss(100 if male else 90, 7),
                "waist": rnd.gauss(86 if male else 74, 8),
                "hip": rnd.gauss(100 if male else 99, 6),
                "inseam": h * 0.45 + rnd.gauss(0, 2),
            }
            tape, tape_mean, scan = {}, {}, {}
            for k, v in body.items():
                r = [round(v + rnd.gauss(0, 0.5), 1), round(v + rnd.gauss(0, 0.6), 1)]
                if needs_third(*r):
                    r.append(round(v + rnd.gauss(0, 0.4), 1))
                tape[k] = r
                tape_mean[k] = round(mean_closest_two(r), 2)
                scan[k] = round(v * 1.04 + rnd.gauss(0, 2.5), 1)
            chart = M if male else W
            ts = nearest(chart, tape_mean["chest"], tape_mean["waist"], tape_mean["hip"])
            ss = nearest(chart, scan["chest"], scan["waist"], scan["hip"])
            items = [min(5, max(1, round(rnd.gauss(4.2 if j % 2 == 0 else 1.8, 0.7)))) for j in range(10)]
            Record.objects.create(
                participant_id=pid, created_at=start + timedelta(days=i, hours=rnd.randint(9, 16)), app_version="demo",
                collected_by=user, consent_paper_signed=True, sex="male" if male else "female",
                age_band=rnd.choice(["18-24", "25-34", "25-34", "35-44", "45-54", "55+"]), height_cm=round(h, 1),
                weight_kg=round(rnd.gauss(78 if male else 65, 9), 1), self_size=rnd.choice([ts, ts, nearest(chart, *[x + 4 for x in body.values()][:3])]),
                chart="menswear" if male else "womenswear", phone_model=rnd.choice(["Pixel 8", "SM-A546B", "iPhone (iOS 18.1)"]),
                tape=tape, tape_mean=tape_mean,
                scan={**scan, "processingMs": rnd.randint(450, 1400), "retakes": rnd.choice([0, 0, 0, 1, 1, 2]),
                      "detail": {"widthMethod": "mask", "depthMethod": "mask"}, "landmarks": {"front": [], "side": []}},
                calibrated=None,
                sizes={"self": ts, "tape": {"size": ts, "boundaryDistanceCm": round(abs(rnd.gauss(1.5, 1)), 1)},
                       "scanRaw": {"size": ss, "boundaryDistanceCm": round(rnd.gauss(1, 1.2), 1)}, "scanCal": None},
                sus_items=items, sus_score=sus_score(items),
            )
            AuditEntry.objects.create(action="create", record_id=pid, by=user, app_version="demo")
        c.save()
        self.stdout.write(self.style.SUCCESS(f"Created {n} demo records"))
