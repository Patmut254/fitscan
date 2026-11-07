/** Tape-measurement protocol helpers (pure). */

export const TAPE_TOLERANCE_CM = 1.0;

/** A third reading is required when readings 1 and 2 differ by MORE than 1.0 cm. */
export function needsThirdReading(r1: number | null | undefined, r2: number | null | undefined): boolean {
  if (r1 == null || r2 == null || !Number.isFinite(r1) || !Number.isFinite(r2)) return false;
  // Round to avoid float noise (e.g. 80.3 - 79.3 = 1.0000000000000142).
  return Math.round(Math.abs(r1 - r2) * 1000) / 1000 > TAPE_TOLERANCE_CM;
}

/**
 * Mean of the closest two readings. With two readings, their mean. With three, the pair with
 * the smallest absolute difference (ties → the earlier pair, i.e. (r1,r2) before (r1,r3) before (r2,r3)).
 */
export function meanOfClosestTwo(readings: number[]): number {
  const r = readings.filter((x) => Number.isFinite(x));
  if (r.length < 2) throw new Error('At least two readings are required');
  if (r.length === 2) return (r[0] + r[1]) / 2;
  let best: [number, number] = [r[0], r[1]];
  let bestDiff = Infinity;
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) {
      const d = Math.abs(r[i] - r[j]);
      if (d < bestDiff - 1e-9) {
        bestDiff = d;
        best = [r[i], r[j]];
      }
    }
  return (best[0] + best[1]) / 2;
}

/** Validates one landmark's readings; returns an error message or null. */
export function validateReadings(readings: (number | null)[], min = 20, max = 250): string | null {
  const [r1, r2, r3] = readings;
  if (r1 == null || r2 == null) return 'Enter reading 1 and reading 2';
  for (const r of readings) if (r != null && (r < min || r > max)) return `Readings must be between ${min} and ${max} cm`;
  if (needsThirdReading(r1, r2) && r3 == null) return 'Readings differ by more than 1.0 cm — take reading 3';
  return null;
}
