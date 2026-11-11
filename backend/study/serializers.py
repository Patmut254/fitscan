"""Converts between the app's JSON shape (camelCase, same as frontend/src/types.ts) and the model."""
import re

from django.utils.dateparse import parse_datetime

from .logic import check_tape, sus_score
from .models import AGE_BANDS, CHART_CHOICES, SEX_CHOICES, Record

ALLOWED_KEYS = {
    "id", "createdAt", "savedAt", "appVersion", "consentPaperSigned", "sex", "ageBand", "heightCm", "weightKg",
    "selfSize", "chart", "phoneModel", "tape", "tapeMean", "scan", "calibrated", "sizes", "sus", "consent",
    "consentMethod",  # sent by the app; the stored method is taken from the consent block
}
SEXES = {s for s, _ in SEX_CHOICES}
CHARTS = {c for c, _ in CHART_CHOICES}
MAX_STRING = 200  # blocks base64 images or free-text notes from ever being stored in JSON fields

EDITABLE = {
    "sex": "sex",
    "ageBand": "age_band",
    "heightCm": "height_cm",
    "weightKg": "weight_kg",
    "selfSize": "self_size",
    "phoneModel": "phone_model",
}


class ValidationError(Exception):
    pass


def to_api(r: Record, consent=None, show_initials=False) -> dict:
    """consent: the participant's ConsentRecord (optional). Initials only when show_initials (researchers)."""
    c = None
    if consent is not None:
        c = {
            "method": consent.method,
            "formVersion": consent.form_version,
            "signedAt": consent.signed_at.isoformat(),
            "statements": consent.statements,
        }
        if show_initials:
            c["initials"] = consent.initials
    elif r.consent_method:
        c = {"method": r.consent_method}
    return {
        "id": r.participant_id,
        "createdAt": r.created_at.isoformat(),
        "savedAt": r.saved_at.isoformat(),
        "lastEditedAt": r.last_edited_at.isoformat() if r.last_edited_at else None,
        "appVersion": r.app_version,
        "collectedBy": r.collected_by.get_username(),
        "consentPaperSigned": r.consent_paper_signed,
        "sex": r.sex,
        "ageBand": r.age_band,
        "heightCm": r.height_cm,
        "weightKg": r.weight_kg,
        "selfSize": r.self_size,
        "chart": r.chart,
        "phoneModel": r.phone_model,
        "tape": r.tape,
        "tapeMean": r.tape_mean,
        "scan": r.scan,
        "calibrated": r.calibrated,
        "sizes": r.sizes,
        "sus": {"items": r.sus_items, "score": r.sus_score} if r.sus_items else None,
        "consentMethod": r.consent_method,
        "consent": c,
    }


def to_summary(r: Record) -> dict:
    """Lighter list representation (no landmarks)."""
    d = to_api(r)
    if d["scan"]:
        d["scan"] = {k: v for k, v in d["scan"].items() if k != "landmarks"}
    return d


def _no_long_strings(v, path="scan"):
    if isinstance(v, str) and len(v) > MAX_STRING:
        raise ValidationError(f"{path} contains a long text value; images or free text are not allowed")
    if isinstance(v, dict):
        for k, x in v.items():
            _no_long_strings(x, f"{path}.{k}")
    if isinstance(v, list):
        for i, x in enumerate(v):
            _no_long_strings(x, f"{path}[{i}]")


def _num(d, key, lo, hi):
    v = d.get(key)
    if not isinstance(v, (int, float)) or isinstance(v, bool) or not (lo <= v <= hi):
        raise ValidationError(f"{key} must be a number between {lo} and {hi}")
    return float(v)


def validate_edit_value(api_key, value):
    if api_key == "sex" and value not in SEXES:
        raise ValidationError("Invalid sex")
    if api_key == "ageBand" and value not in AGE_BANDS:
        raise ValidationError("Invalid age band")
    if api_key == "heightCm":
        return _num({"heightCm": value}, "heightCm", 120, 230)
    if api_key == "weightKg":
        return _num({"weightKg": value}, "weightKg", 30, 250)
    if api_key in ("selfSize", "phoneModel"):
        if not isinstance(value, str) or not value.strip() or len(value) > 80:
            raise ValidationError(f"{api_key} must be non-empty text (max 80 chars)")
        return value.strip()
    return value


def normalise_initials(v) -> str:
    return re.sub(r"[^A-Za-z]", "", str(v or "")).upper()


def consent_from_api(d: dict):
    """Validates the consent block. Returns (method, initials, form_version, signed_at)."""
    c = d.get("consent") or {"method": "paper"}
    if not isinstance(c, dict):
        raise ValidationError("consent must be an object")
    method = c.get("method")
    if method == "paper":
        return "paper", "", None, parse_datetime(d.get("createdAt") or "")
    if method != "electronic":
        raise ValidationError("consent.method must be paper or electronic")
    initials = normalise_initials(c.get("initials"))
    if not 1 <= len(initials) <= 4:
        raise ValidationError("Initials must be 1 to 4 letters")
    if c.get("agreedAll") is not True:
        raise ValidationError("Every consent statement must be agreed to")
    version = c.get("formVersion")
    signed = parse_datetime(c.get("signedAt") or "")
    if not isinstance(version, int) or not signed:
        raise ValidationError("consent needs formVersion and signedAt")
    return "electronic", initials, version, signed


def from_api(d: dict) -> dict:
    """Validates a new record payload and returns model field kwargs (without collected_by)."""
    if not isinstance(d, dict):
        raise ValidationError("Body must be a JSON object")
    extra = set(d) - ALLOWED_KEYS
    if extra:
        raise ValidationError(f"Fields not allowed: {', '.join(sorted(extra))}")
    if d.get("consentPaperSigned") is not True:
        raise ValidationError("Consent must be confirmed")
    if d.get("sex") not in SEXES:
        raise ValidationError("Invalid sex")
    if d.get("ageBand") not in AGE_BANDS:
        raise ValidationError("Invalid age band")
    if d.get("chart") not in CHARTS:
        raise ValidationError("Invalid chart")
    created = parse_datetime(d.get("createdAt") or "")
    if not created:
        raise ValidationError("createdAt must be an ISO timestamp")
    try:
        tape_mean = check_tape(d.get("tape") or {})
    except ValueError as e:
        raise ValidationError(str(e))
    sus = d.get("sus")
    items = score = None
    if sus is not None:
        try:
            items = sus.get("items")
            score = sus_score(items)
        except (ValueError, AttributeError) as e:
            raise ValidationError(str(e))
    for key in ("scan", "calibrated", "sizes"):
        v = d.get(key)
        if v is not None and not isinstance(v, dict):
            raise ValidationError(f"{key} must be an object or null")
        _no_long_strings(v, key)
    if not isinstance(d.get("sizes"), dict):
        raise ValidationError("sizes is required")
    return {
        "participant_id": d.get("id"),
        "created_at": created,
        "app_version": str(d.get("appVersion") or "")[:20],
        "consent_paper_signed": True,
        "consent_method": consent_from_api(d)[0],
        "sex": d["sex"],
        "age_band": d["ageBand"],
        "height_cm": _num(d, "heightCm", 120, 230),
        "weight_kg": _num(d, "weightKg", 30, 250),
        "self_size": validate_edit_value("selfSize", d.get("selfSize")),
        "chart": d["chart"],
        "phone_model": validate_edit_value("phoneModel", d.get("phoneModel")),
        "tape": d["tape"],
        "tape_mean": tape_mean,
        "scan": d.get("scan"),
        "calibrated": d.get("calibrated"),
        "sizes": d["sizes"],
        "sus_items": items,
        "sus_score": score,
    }
