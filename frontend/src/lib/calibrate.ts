/**
 * Calibration (pure functions + JSON loader).
 *
 * Model, fitted separately for each measurement m ∈ {chest, waist, hip, inseam}:
 *     tape_m = b0 + b1·scan_m + b2·sex + b3·height_cm          (ordinary least squares)
 *
 * sex coding (stored in the JSON so the notebook and the app always agree):
 *     female = 0, male = 1, prefer_not_to_say = 0.5 (midpoint; documented limitation).
 *
 * Coefficients are produced OFFLINE by analysis/fit_calibration.py and loaded at runtime.
 * The app NEVER fits on live data. To guarantee it never predicts a record that was in the
 * training set, the JSON lists `trainedOnIds`; applyCalibration() refuses those IDs.
 * (For evaluating calibrated accuracy on participants already collected, use the notebook's
 * leave-one-out predictions, not the app.)
 */
import type { MeasureKey, Sex, ScanMeasurements } from '../types';
import { MEASURE_KEYS } from '../types';

export interface CoefSet {
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  n?: number;
  r2?: number;
  rmse?: number;
  looRmse?: number;
}

export interface CalibrationFile {
  version: string;
  createdAt?: string;
  sexCoding: Record<Sex, number>;
  trainedOnIds: string[];
  models: Partial<Record<MeasureKey, CoefSet>>;
}

export const DEFAULT_SEX_CODING: Record<Sex, number> = { female: 0, male: 1, prefer_not_to_say: 0.5 };

export function validateCalibration(raw: unknown): CalibrationFile {
  const c = raw as CalibrationFile;
  if (!c || typeof c !== 'object') throw new Error('Calibration file is not an object');
  if (typeof c.version !== 'string' || !c.version) throw new Error('Calibration file needs a "version" string');
  if (!c.models || typeof c.models !== 'object') throw new Error('Calibration file needs "models"');
  for (const [k, m] of Object.entries(c.models)) {
    if (!MEASURE_KEYS.includes(k as MeasureKey)) throw new Error(`Unknown measurement "${k}"`);
    for (const b of ['b0', 'b1', 'b2', 'b3'] as const)
      if (typeof m?.[b] !== 'number' || !Number.isFinite(m[b])) throw new Error(`${k}.${b} must be a finite number`);
  }
  return {
    ...c,
    sexCoding: { ...DEFAULT_SEX_CODING, ...(c.sexCoding ?? {}) },
    trainedOnIds: Array.isArray(c.trainedOnIds) ? c.trainedOnIds : [],
  };
}

export function predict(coef: CoefSet, scan: number, sexCode: number, heightCm: number): number {
  return coef.b0 + coef.b1 * scan + coef.b2 * sexCode + coef.b3 * heightCm;
}

export type CalibrationOutcome =
  | { ok: true; values: Partial<ScanMeasurements>; modelVersion: string }
  | { ok: false; reason: string };

export function applyCalibration(
  cal: CalibrationFile | null,
  recordId: string,
  scan: ScanMeasurements,
  sex: Sex,
  heightCm: number,
): CalibrationOutcome {
  if (!cal) return { ok: false, reason: 'No calibration model loaded' };
  if (cal.trainedOnIds.includes(recordId))
    return { ok: false, reason: `${recordId} was in the calibration training set; not predicting it` };
  const values: Partial<ScanMeasurements> = {};
  for (const k of MEASURE_KEYS) {
    const coef = cal.models[k];
    if (coef) values[k] = predict(coef, scan[k], cal.sexCoding[sex], heightCm);
  }
  if (Object.keys(values).length === 0) return { ok: false, reason: 'Calibration file has no models' };
  return { ok: true, values, modelVersion: cal.version };
}

// ─── OLS (used by tests and available for parity checks with the notebook) ─────────────────

/** Solve A x = b for a small dense system by Gaussian elimination with partial pivoting. */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('Singular system (predictors are collinear)');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** OLS via normal equations. X rows exclude the intercept; returns [b0, b1, ...]. */
export function fitOls(X: number[][], y: number[]): number[] {
  if (X.length !== y.length || X.length === 0) throw new Error('X and y must be non-empty and the same length');
  const rows = X.map((r) => [1, ...r]);
  const p = rows[0].length;
  if (rows.length < p) throw new Error(`Need at least ${p} observations`);
  const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const Xty = Array.from({ length: p }, (_, i) => rows.reduce((s, r, k) => s + r[i] * y[k], 0));
  return solve(XtX, Xty);
}

/** Normalises the API response (null when no model is active). */
export function parseCalibration(raw: unknown | null): CalibrationFile | null {
  if (!raw) return null;
  const c = raw as CalibrationFile;
  if (!c.models || Object.keys(c.models).length === 0) return null;
  return validateCalibration(c);
}
