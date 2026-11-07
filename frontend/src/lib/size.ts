/**
 * Size engine (pure). Size charts live in src/data/sizeCharts.json.
 *
 * Matching rule:
 *  1. For each size, compute an out-of-range penalty: Σ over available dimensions of the
 *     squared distance (cm) by which the measurement falls outside that dimension's range
 *     (0 when inside). Lowest penalty wins.
 *  2. Ties are broken first by the number of dimensions outside their range (a value exactly
 *     at a range max is outside, because ranges are [min, max)), then by the smallest
 *     Σ squared distance to the range centres.
 *  3. boundaryDistanceCm = the minimum, over used dimensions, of the signed distance to the
 *     nearest boundary of the chosen size's range (positive = inside, negative = outside).
 *     Small values flag "borderline" recommendations.
 */
import chartsJson from '../data/sizeCharts.json';
import type { ChartKey } from '../types';

export type Range = [number, number];
export interface SizeRow {
  size: string;
  [dim: string]: Range | string;
}
export interface SizeChart {
  label: string;
  dims: string[];
  sizes: SizeRow[];
}
export type SizeCharts = Record<ChartKey, SizeChart>;

export const SIZE_CHARTS = chartsJson as unknown as SizeCharts;

/** Body values keyed by our measurement names. bust ≡ chest. */
export interface BodyValues {
  chest?: number | null;
  waist?: number | null;
  hip?: number | null;
}

export interface SizeMatch {
  size: string;
  penalty: number;
  boundaryDistanceCm: number;
  perDim: Record<string, { value: number; range: Range; signedMarginCm: number }>;
}

function valueFor(dim: string, body: BodyValues): number | null {
  const v = dim === 'bust' || dim === 'chest' ? body.chest : dim === 'waist' ? body.waist : dim === 'hip' ? body.hip : null;
  return v == null || !Number.isFinite(v) ? null : v;
}

/** Signed margin to nearest boundary: positive inside [lo, hi), negative outside. */
export function signedMargin(v: number, [lo, hi]: Range): number {
  if (v < lo) return v - lo;
  if (v >= hi) return hi - v; // at/above max → outside (ranges are [lo, hi)); 0 exactly at max
  return Math.min(v - lo, hi - v);
}

export function recommendSize(body: BodyValues, chart: SizeChart): SizeMatch | null {
  const dims = chart.dims.filter((d) => valueFor(d, body) !== null);
  if (dims.length === 0) return null;

  let best: (SizeMatch & { centre: number; outside: number }) | null = null;
  for (const row of chart.sizes) {
    let penalty = 0;
    let outside = 0;
    let centre = 0;
    let minMargin = Infinity;
    const perDim: SizeMatch['perDim'] = {};
    for (const d of dims) {
      const v = valueFor(d, body)!;
      const range = row[d] as Range;
      const out = v < range[0] ? range[0] - v : v >= range[1] ? v - range[1] : 0;
      penalty += out * out;
      if (v < range[0] || v >= range[1]) outside++;
      centre += (v - (range[0] + range[1]) / 2) ** 2;
      const m = signedMargin(v, range);
      minMargin = Math.min(minMargin, m);
      perDim[d] = { value: v, range, signedMarginCm: m };
    }
    const samePenalty = best !== null && Math.abs(penalty - best.penalty) <= 1e-9;
    const better =
      !best ||
      penalty < best.penalty - 1e-9 ||
      (samePenalty && outside < best.outside) ||
      (samePenalty && outside === best.outside && centre < best.centre);
    if (better) best = { size: row.size, penalty, outside, centre, boundaryDistanceCm: minMargin, perDim };
  }
  if (!best) return null;
  const { size, penalty, boundaryDistanceCm: _b, perDim } = best;
  const rest = { size, penalty, boundaryDistanceCm: _b, perDim };
  return { ...rest, boundaryDistanceCm: Math.round(rest.boundaryDistanceCm * 10) / 10 };
}

export function chartForSex(sex: string): ChartKey {
  return sex === 'male' ? 'menswear' : 'womenswear';
}
