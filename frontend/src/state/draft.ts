import type { AgeBand, ChartKey, MeasureKey, ScanResult, Sex } from '../types';

export type Readings = [number | null, number | null, number | null];

export interface Draft {
  id: string;
  createdAt: string;
  consent: boolean;
  sex: Sex | '';
  ageBand: AgeBand | '';
  heightCm: number | null;
  weightKg: number | null;
  selfSize: string;
  chart: ChartKey;
  phoneModel: string;
  tape: Record<MeasureKey, Readings>;
  scan: ScanResult | null;
  sus: (number | null)[];
}

export function emptyDraft(id: string, phoneModel: string): Draft {
  const r = (): Readings => [null, null, null];
  return {
    id,
    createdAt: new Date().toISOString(),
    consent: false,
    sex: '',
    ageBand: '',
    heightCm: null,
    weightKg: null,
    selfSize: '',
    chart: 'womenswear',
    phoneModel,
    tape: { chest: r(), waist: r(), hip: r(), inseam: r() },
    scan: null,
    sus: Array(10).fill(null),
  };
}
