"""
Django admin. Study data is VIEW-ONLY here so every change goes through the app, where a
reason is required and an audit entry is written. Use the admin for accounts and groups.
"""
import json

from django.contrib import admin
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import format_html

from . import logic
from .models import AuditEntry, CalibrationModel, ConsentForm, ConsentRecord, Counter, Record, ReservedId
from .serializers import to_api


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


def pretty(v):
    return format_html("<pre style='white-space:pre-wrap;max-width:900px'>{}</pre>", json.dumps(v, indent=2))


@admin.action(description="Export selected records to CSV")
def export_csv(modeladmin, request, queryset):
    rows = [logic.flatten(to_api(r)) for r in queryset.select_related("collected_by")]
    resp = HttpResponse(logic.to_csv(rows), content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="fitscan-records-{timezone.localdate()}.csv"'
    AuditEntry.objects.create(action="export", by=request.user, reason=f"admin CSV ({len(rows)} records)")
    return resp


@admin.register(Record)
class RecordAdmin(ReadOnlyAdmin):
    list_display = ("participant_id", "created_at", "sex", "age_band", "height_cm", "self_size", "tape_size", "scan_size", "cal_size", "sus_score", "app_version")
    list_filter = ("sex", "age_band", "chart", "app_version", "phone_model")
    search_fields = ("participant_id",)
    date_hierarchy = "created_at"
    actions = [export_csv]
    readonly_fields = [f.name for f in Record._meta.fields if f.name not in ("tape", "tape_mean", "scan", "calibrated", "sizes")] + ["tape_pretty", "tape_mean_pretty", "scan_pretty", "calibrated_pretty", "sizes_pretty"]
    exclude = ("tape", "tape_mean", "scan", "calibrated", "sizes")

    def get_actions(self, request):
        # Read-only admins still need the export action, which Django hides without change permission.
        actions = super().get_actions(request)
        actions["export_csv"] = (export_csv, "export_csv", export_csv.short_description)
        return actions

    def _size(self, obj, k):
        return ((obj.sizes or {}).get(k) or {}).get("size") or "—"

    @admin.display(description="Tape size")
    def tape_size(self, obj):
        return self._size(obj, "tape")

    @admin.display(description="Scan size")
    def scan_size(self, obj):
        return self._size(obj, "scanRaw")

    @admin.display(description="Calibrated size")
    def cal_size(self, obj):
        return self._size(obj, "scanCal")

    def tape_pretty(self, obj):
        return pretty(obj.tape)

    def tape_mean_pretty(self, obj):
        return pretty(obj.tape_mean)

    def scan_pretty(self, obj):
        s = dict(obj.scan or {})
        if "landmarks" in s:
            s["landmarks"] = f"{len(s['landmarks'].get('front', []))} front + {len(s['landmarks'].get('side', []))} side points (see landmarks CSV)"
        return pretty(s)

    def calibrated_pretty(self, obj):
        return pretty(obj.calibrated)

    def sizes_pretty(self, obj):
        return pretty(obj.sizes)


@admin.register(AuditEntry)
class AuditAdmin(ReadOnlyAdmin):
    list_display = ("at", "action", "record_id", "by", "reason", "app_version")
    list_filter = ("action", "by")
    search_fields = ("record_id", "reason")


@admin.register(ReservedId)
class ReservedIdAdmin(ReadOnlyAdmin):
    list_display = ("participant_id", "reserved_at", "reserved_by", "saved")

    @admin.display(boolean=True)
    def saved(self, obj):
        return Record.objects.filter(participant_id=obj.participant_id).exists()


@admin.register(CalibrationModel)
class CalibrationAdmin(ReadOnlyAdmin):
    list_display = ("version", "is_active", "uploaded_at", "uploaded_by")


@admin.register(Counter)
class CounterAdmin(ReadOnlyAdmin):
    list_display = ("name", "next_value")


@admin.register(ConsentRecord)
class ConsentRecordAdmin(ReadOnlyAdmin):
    list_display = ("participant_id", "method", "initials", "signed_at", "form_version", "collected_by")
    list_filter = ("method", "form_version")
    search_fields = ("participant_id",)


@admin.register(ConsentForm)
class ConsentFormAdmin(ReadOnlyAdmin):
    list_display = ("version", "title", "created_at", "created_by")
