"""
FitScan data model. No participant names, emails or phone numbers exist anywhere here.
Photos are never sent to the server: a record holds only derived numbers and landmark coordinates.
"""
from django.conf import settings
from django.db import models

SEX_CHOICES = [("female", "Female"), ("male", "Male"), ("prefer_not_to_say", "Prefer not to say")]
AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55+"]
AGE_CHOICES = [(a, a) for a in AGE_BANDS]
CHART_CHOICES = [("womenswear", "Womenswear"), ("menswear", "Menswear")]
MEASURES = ["chest", "waist", "hip", "inseam"]


class Counter(models.Model):
    """Sequential counters (participant IDs). Incremented under a row lock."""

    name = models.CharField(max_length=40, primary_key=True)
    next_value = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"{self.name}: next {self.next_value}"


class ReservedId(models.Model):
    """Every participant ID handed out, so abandoned sessions show up as visible gaps."""

    participant_id = models.CharField(max_length=10, unique=True)
    reserved_at = models.DateTimeField(auto_now_add=True)
    reserved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["participant_id"]
        verbose_name = "reserved participant ID"

    def __str__(self):
        return self.participant_id


class Record(models.Model):
    participant_id = models.CharField("ID", max_length=10, unique=True)
    created_at = models.DateTimeField(help_text="Session start (set by the app)")
    saved_at = models.DateTimeField(auto_now_add=True)
    last_edited_at = models.DateTimeField(null=True, blank=True)
    app_version = models.CharField(max_length=20)
    collected_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="records")

    consent_paper_signed = models.BooleanField()
    sex = models.CharField(max_length=20, choices=SEX_CHOICES)
    age_band = models.CharField(max_length=8, choices=AGE_CHOICES)
    height_cm = models.FloatField()
    weight_kg = models.FloatField()
    self_size = models.CharField(max_length=12)
    chart = models.CharField(max_length=12, choices=CHART_CHOICES)
    phone_model = models.CharField(max_length=80)

    tape = models.JSONField(help_text="All readings per measurement, cm")
    tape_mean = models.JSONField(help_text="Mean of closest two readings, cm")
    scan = models.JSONField(null=True, blank=True)
    calibrated = models.JSONField(null=True, blank=True)
    sizes = models.JSONField()
    sus_items = models.JSONField(null=True, blank=True)
    sus_score = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["participant_id"]

    def __str__(self):
        return self.participant_id


class AuditEntry(models.Model):
    ACTIONS = [
        ("create", "Create"),
        ("edit", "Edit"),
        ("calibration", "Calibration uploaded"),
        ("export", "Data exported"),
        ("password", "Password changed"),
    ]
    at = models.DateTimeField(auto_now_add=True, db_index=True)
    action = models.CharField(max_length=20, choices=ACTIONS)
    record_id = models.CharField(max_length=10, blank=True)
    by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    app_version = models.CharField(max_length=20, blank=True)
    reason = models.TextField(blank=True)
    changes = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-at", "-id"]
        verbose_name_plural = "audit log"

    def __str__(self):
        return f"{self.at:%Y-%m-%d %H:%M} {self.action} {self.record_id}"


class CalibrationModel(models.Model):
    version = models.CharField(max_length=60)
    data = models.JSONField()
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.version}{' (active)' if self.is_active else ''}"
