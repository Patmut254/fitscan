"""
Fit FitScan calibration models from the exported CSV and write calibration.json.

    tape_m = b0 + b1*scan_m + b2*sex + b3*height_cm   (OLS, one model per measurement)

Usage:
    pip install pandas numpy
    python analysis/fit_calibration.py fitscan-records-YYYY-MM-DD.csv --out calibration.json --version cal-2026-11

Also prints leave-one-out (LOO) RMSE and writes loo_predictions.csv: for evaluating calibrated
accuracy in your write-up, use the LOO predictions, so no participant is predicted by a model
that was trained on them. The app enforces the same rule by refusing IDs listed in trainedOnIds.
"""
import argparse
import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd

SEX_CODING = {"female": 0.0, "male": 1.0, "prefer_not_to_say": 0.5}
MEASURES = ["chest", "waist", "hip", "inseam"]


def design(df, m):
    return np.column_stack([np.ones(len(df)), df[f"scan_{m}"], df["sex"].map(SEX_CODING), df["heightCm"]])


def fit(X, y):
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return beta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--out", default="calibration.json")
    ap.add_argument("--version", default=f"cal-{datetime.now(timezone.utc):%Y%m%d}")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    models, loo_rows = {}, []
    used_ids = set()
    for m in MEASURES:
        d = df.dropna(subset=[f"scan_{m}", f"tape_{m}_mean", "sex", "heightCm"]).reset_index(drop=True)
        if len(d) < 8:
            print(f"{m}: only {len(d)} complete rows; skipping (need >= 8)")
            continue
        X, y = design(d, m), d[f"tape_{m}_mean"].to_numpy()
        beta = fit(X, y)
        pred = X @ beta
        rmse = float(np.sqrt(np.mean((y - pred) ** 2)))
        r2 = float(1 - np.sum((y - pred) ** 2) / np.sum((y - y.mean()) ** 2))
        loo = np.empty(len(d))
        for i in range(len(d)):
            mask = np.arange(len(d)) != i
            loo[i] = X[i] @ fit(X[mask], y[mask])
            loo_rows.append({"id": d.loc[i, "id"], "measure": m, "tape": y[i], "scan_raw": d.loc[i, f"scan_{m}"], "loo_calibrated": loo[i]})
        loo_rmse = float(np.sqrt(np.mean((y - loo) ** 2)))
        models[m] = {"b0": beta[0], "b1": beta[1], "b2": beta[2], "b3": beta[3], "n": int(len(d)), "r2": r2, "rmse": rmse, "looRmse": loo_rmse}
        used_ids.update(d["id"])
        print(f"{m:7s} n={len(d):3d}  R²={r2:.3f}  RMSE={rmse:.2f} cm  LOO-RMSE={loo_rmse:.2f} cm")

    out = {
        "version": args.version,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sexCoding": SEX_CODING,
        "trainedOnIds": sorted(used_ids),
        "models": {k: {kk: (float(vv) if isinstance(vv, (float, np.floating)) else vv) for kk, vv in v.items()} for k, v in models.items()},
    }
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)
    pd.DataFrame(loo_rows).to_csv("loo_predictions.csv", index=False)
    print(f"Wrote {args.out} and loo_predictions.csv")


if __name__ == "__main__":
    main()
