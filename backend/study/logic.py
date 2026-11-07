"""Pure server-side checks and summaries (mirrors frontend/src/lib/*.ts where relevant)."""
import csv
import io
import math

from .models import MEASURES

TAPE_TOLERANCE_CM = 1.0
SEX_CODING_DEFAULT = {"female": 0.0, "male": 1.0, "prefer_not_to_say": 0.5}


def needs_third(r1, r2):
    return round(abs(r1 - r2), 3) > TAPE_TOLERANCE_CM


def mean_closest_two(readings):
    if len(readings) < 2:
        raise ValueError("At least two readings are required")
    if len(readings) == 2:
        return (readings[0] + readings[1]) / 2
    best, best_d = (readings[0], readings[1]), math.inf
    for i in range(len(readings)):
        for j in range(i + 1, len(readings)):
            d = abs(readings[i] - readings[j])
            if d < best_d - 1e-9:
                best_d, best = d, (readings[i], readings[j])
    return (best[0] + best[1]) / 2


def check_tape(tape):
    """Returns {measure: mean} or raises ValueError. Enforces the 1.0 cm third-reading rule."""
    means = {}
    for m in MEASURES:
        r = tape.get(m)
        if not isinstance(r, list) or not all(isinstance(x, (int, float)) for x in r):
            raise ValueError(f"tape.{m} must be a list of numbers")
        if len(r) < 2 or len(r) > 3:
            raise ValueError(f"tape.{m} needs 2 or 3 readings")
        if any(x < 20 or x > 250 for x in r):
            raise ValueError(f"tape.{m} readings must be 20-250 cm")
        if needs_third(r[0], r[1]) and len(r) != 3:
            raise ValueError(f"tape.{m}: readings 1 and 2 differ by more than 1.0 cm, reading 3 required")
        if not needs_third(r[0], r[1]) and len(r) == 3:
            raise ValueError(f"tape.{m}: reading 3 given but not required")
        means[m] = round(mean_closest_two(r), 2)
    return means


def sus_score(items):
    if not isinstance(items, list) or len(items) != 10:
        raise ValueError("SUS requires exactly 10 responses")
    total = 0
    for i, r in enumerate(items):
        if not isinstance(r, int) or isinstance(r, bool) or r < 1 or r > 5:
            raise ValueError(f"SUS item {i + 1} must be an integer 1-5")
        total += (r - 1) if i % 2 == 0 else (5 - r)
    return total * 2.5


def validate_calibration(c):
    if not isinstance(c, dict):
        raise ValueError("Calibration file is not a JSON object")
    if not isinstance(c.get("version"), str) or not c["version"]:
        raise ValueError('Calibration file needs a "version" string')
    models = c.get("models")
    if not isinstance(models, dict) or not models:
        raise ValueError('Calibration file needs non-empty "models"')
    for k, m in models.items():
        if k not in MEASURES:
            raise ValueError(f'Unknown measurement "{k}"')
        for b in ("b0", "b1", "b2", "b3"):
            v = (m or {}).get(b)
            if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
                raise ValueError(f"{k}.{b} must be a finite number")
    out = dict(c)
    out["sexCoding"] = {**SEX_CODING_DEFAULT, **(c.get("sexCoding") or {})}
    out["trainedOnIds"] = list(c.get("trainedOnIds") or [])
    return out


# ─── CSV ────────────────────────────────────────────────────────────────────────────────

def _r(v):
    if isinstance(v, float):
        return round(v, 3)
    return "" if v is None else v


def flatten(rec):
    """One flat row per participant. `rec` is the API (camelCase) representation."""
    o = {
        "id": rec["id"], "createdAt": rec["createdAt"], "savedAt": rec["savedAt"], "lastEditedAt": rec.get("lastEditedAt") or "",
        "appVersion": rec["appVersion"], "collectedBy": rec.get("collectedBy", ""), "consentPaperSigned": rec["consentPaperSigned"],
        "sex": rec["sex"], "ageBand": rec["ageBand"], "heightCm": rec["heightCm"], "weightKg": rec["weightKg"],
        "selfSize": rec["selfSize"], "chart": rec["chart"], "phoneModel": rec["phoneModel"],
    }
    for m in MEASURES:
        t = rec["tape"].get(m, [])
        for i in range(3):
            o[f"tape_{m}_r{i + 1}"] = t[i] if i < len(t) else ""
        o[f"tape_{m}_mean"] = rec["tapeMean"].get(m)
    scan = rec.get("scan") or {}
    detail = scan.get("detail") or {}
    for m in MEASURES:
        o[f"scan_{m}"] = scan.get(m)
    for k in ("processingMs", "processingMsFront", "processingMsSide", "retakes", "retakesFront", "retakesSide"):
        o[f"scan_{k}"] = scan.get(k)
    o["scan_widthMethod"] = detail.get("widthMethod")
    o["scan_depthMethod"] = detail.get("depthMethod")
    o["scan_cmPerPxFront"] = detail.get("cmPerPxFront")
    o["scan_cmPerPxSide"] = detail.get("cmPerPxSide")
    for k in ("chest", "waist", "hip"):
        o[f"scan_width_{k}"] = (detail.get("widthsCm") or {}).get(k)
        o[f"scan_depth_{k}"] = (detail.get("depthsCm") or {}).get(k)
    cal = rec.get("calibrated") or {}
    for m in MEASURES:
        o[f"cal_{m}"] = cal.get(m)
    o["cal_modelVersion"] = cal.get("modelVersion", "")
    sizes = rec.get("sizes") or {}
    o["size_self"] = sizes.get("self")
    for k in ("tape", "scanRaw", "scanCal"):
        s = sizes.get(k) or {}
        o[f"size_{k}"] = s.get("size")
        o[f"size_{k}_boundaryCm"] = s.get("boundaryDistanceCm")
    sus = rec.get("sus") or {}
    items = sus.get("items") or []
    for i in range(10):
        o[f"sus_q{i + 1}"] = items[i] if i < len(items) else ""
    o["sus_score"] = sus.get("score")
    return o


def to_csv(rows, header=None):
    buf = io.StringIO()
    buf.write("﻿")
    if header is None:
        header = list(rows[0].keys()) if rows else []
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(header)
    for r in rows:
        w.writerow([_r(r.get(h)) for h in header])
    return buf.getvalue()


def landmarks_rows(recs):
    for rec in recs:
        for view in ("front", "side"):
            for i, l in enumerate(((rec.get("scan") or {}).get("landmarks") or {}).get(view, [])):
                yield {"id": rec["id"], "view": view, "landmark": i, "x": l.get("x"), "y": l.get("y"), "z": l.get("z"), "visibility": l.get("v")}


# ─── Dashboard stats ────────────────────────────────────────────────────────────────────

def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _sd(xs):
    xs = [x for x in xs if x is not None]
    if len(xs) < 2:
        return None
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def stats(recs):
    """Summary numbers for the dashboard. `recs` are API representations."""
    n = len(recs)
    per_measure = {}
    for m in MEASURES:
        raw_err, cal_err, pairs = [], [], []
        for r in recs:
            tape = r["tapeMean"].get(m)
            scan = (r.get("scan") or {}).get(m)
            cal = (r.get("calibrated") or {}).get(m)
            if tape is not None and scan is not None:
                raw_err.append(scan - tape)
                pairs.append({"id": r["id"], "tape": tape, "scan": scan, "cal": cal})
            if tape is not None and cal is not None:
                cal_err.append(cal - tape)
        bias = _mean(raw_err)
        sd = _sd(raw_err)
        per_measure[m] = {
            "n": len(raw_err),
            "rawBias": bias,
            "rawMae": _mean([abs(e) for e in raw_err]),
            "rawLoaLow": bias - 1.96 * sd if bias is not None and sd is not None else None,
            "rawLoaHigh": bias + 1.96 * sd if bias is not None and sd is not None else None,
            "calN": len(cal_err),
            "calMae": _mean([abs(e) for e in cal_err]),
            "pairs": pairs,
        }

    def agree(a, b):
        hits = tot = 0
        for r in recs:
            s = r.get("sizes") or {}
            x = s.get(a) if a == "self" else (s.get(a) or {}).get("size")
            y = (s.get(b) or {}).get("size")
            if x and y and x != "unknown":
                tot += 1
                hits += x == y
        return {"n": tot, "pct": (100 * hits / tot) if tot else None}

    by_sex, by_age = {}, {}
    for r in recs:
        by_sex[r["sex"]] = by_sex.get(r["sex"], 0) + 1
        by_age[r["ageBand"]] = by_age.get(r["ageBand"], 0) + 1

    sus = [r["sus"]["score"] for r in recs if r.get("sus")]
    return {
        "n": n,
        "bySex": by_sex,
        "byAge": by_age,
        "measures": per_measure,
        "sizeAgreement": {
            "scanRawVsTape": agree("scanRaw", "tape"),
            "scanCalVsTape": agree("scanCal", "tape"),
            "selfVsTape": agree("self", "tape"),
        },
        "sus": {"n": len(sus), "mean": _mean(sus), "sd": _sd(sus), "scores": sus},
        "processingMsMean": _mean([(r.get("scan") or {}).get("processingMs") for r in recs]),
        "retakesMean": _mean([(r.get("scan") or {}).get("retakes") for r in recs]),
        "phones": sorted({r["phoneModel"] for r in recs}),
    }
