// Shared types for FitScan. No participant-identifying fields exist anywhere in this model.

export type Sex = 'female' | 'male' | 'prefer_not_to_say';
export type AgeBand = '18-24' | '25-34' | '35-44' | '45-54' | '55+';
export type ChartKey = 'womenswear' | 'menswear';
export type MeasureKey = 'chest' | 'waist' | 'hip' | 'inseam';

export const MEASURE_KEYS: MeasureKey[] = ['chest', 'waist', 'hip', 'inseam'];
export const AGE_BANDS: AgeBand[] = ['18-24', '25-34', '35-44', '45-54', '55+'];

/** A stored landmark: normalised image coords (0-1), z relative to hips, visibility 0-1. */
export interface StoredLandmark {
  x: number;
  y: number;
  z: number;
  v: number;
}

export interface ScanMeasurements {
  chest: number;
  waist: number;
  hip: number;
  inseam: number;
}

export interface ScanResult extends ScanMeasurements {
  /** Pose landmarks for each photo (33 points each). Coordinates only — never images. */
  landmarks: { front: StoredLandmark[]; side: StoredLandmark[] };
  /** Total ms spent in pose detection + measurement for the accepted front and side captures. */
  processingMs: number;
  processingMsFront: number;
  processingMsSide: number;
  /** Total retakes across both views (captures beyond the first, for any reason). */
  retakes: number;
  retakesFront: number;
  retakesSide: number;
  /** Intermediate derived numbers, kept for analysis/auditing of the pipeline. */
  detail: {
    cmPerPxFront: number;
    cmPerPxSide: number;
    widthsCm: { chest: number; waist: number; hip: number };
    depthsCm: { chest: number; waist: number; hip: number };
    widthMethod: 'mask' | 'landmark';
    depthMethod: 'mask' | 'landmark';
    imageFront: { w: number; h: number };
    imageSide: { w: number; h: number };
  };
}

export interface SizeMatchSummary {
  size: string;
  /** Smallest signed distance (cm) to a range boundary across used dimensions. Negative = outside a range. */
  boundaryDistanceCm: number;
}

export interface FitRecord {
  id: string; // P001, P002 ...
  createdAt: string; // ISO timestamp, set on session start
  savedAt?: string;
  lastEditedAt?: string | null;
  collectedBy?: string;
  appVersion: string;
  consentPaperSigned: true;
  sex: Sex;
  ageBand: AgeBand;
  heightCm: number;
  weightKg: number;
  selfSize: string;
  chart: ChartKey;
  phoneModel: string;
  tape: Record<MeasureKey, number[]>;
  tapeMean: Record<MeasureKey, number>;
  scan: ScanResult | null;
  calibrated: (Partial<ScanMeasurements> & { modelVersion: string }) | null;
  sizes: {
    self: string;
    tape: SizeMatchSummary | null;
    scanRaw: SizeMatchSummary | null;
    scanCal: SizeMatchSummary | null;
  };
  sus: { items: number[]; score: number } | null;
}

export interface AuditEntry {
  at: string;
  action: 'create' | 'edit' | 'calibration' | 'export' | 'password';
  recordId: string;
  by: string; // username
  appVersion: string;
  reason?: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
}
