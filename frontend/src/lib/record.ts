/** Assembles the saved record from the in-progress session (pure, unit-tested). */
import type { Draft } from '../state/draft';
import type { FitRecord, MeasureKey, SizeMatchSummary } from '../types';
import { MEASURE_KEYS } from '../types';
import { meanOfClosestTwo, needsThirdReading } from './tape';
import { SIZE_CHARTS, recommendSize, type SizeMatch } from './size';
import { applyCalibration, type CalibrationFile } from './calibrate';
import { susScore } from './sus';
import { round1 } from './measure';

const summary = (m: SizeMatch | null): SizeMatchSummary | null => (m ? { size: m.size, boundaryDistanceCm: m.boundaryDistanceCm } : null);

export function buildRecord(d: Draft, appVersion: string, cal: CalibrationFile | null): { record: FitRecord; calibrationNote: string } {
  if (!d.sex || !d.ageBand || d.heightCm == null || d.weightKg == null) throw new Error('Participant details incomplete');
  const tape = {} as Record<MeasureKey, number[]>;
  const tapeMean = {} as Record<MeasureKey, number>;
  for (const k of MEASURE_KEYS) {
    const [r1, r2, r3] = d.tape[k];
    const readings = [r1!, r2!];
    if (needsThirdReading(r1, r2)) readings.push(r3!);
    tape[k] = readings;
    tapeMean[k] = Math.round(meanOfClosestTwo(readings) * 100) / 100;
  }

  const chart = SIZE_CHARTS[d.chart];
  let calibrated: FitRecord['calibrated'] = null;
  let calibrationNote = 'No calibration model loaded';
  if (d.scan) {
    const outcome = applyCalibration(cal, d.id, d.scan, d.sex, d.heightCm);
    if (outcome.ok) {
      calibrated = { modelVersion: outcome.modelVersion };
      for (const [k, v] of Object.entries(outcome.values)) calibrated[k as MeasureKey] = round1(v as number);
      calibrationNote = `Calibration ${outcome.modelVersion}`;
    } else calibrationNote = outcome.reason;
  }

  const items = d.sus.every((v) => v != null) ? (d.sus as number[]) : null;
  const record: FitRecord = {
    id: d.id,
    createdAt: d.createdAt,
    appVersion,
    consentPaperSigned: true,
    sex: d.sex,
    ageBand: d.ageBand,
    heightCm: d.heightCm,
    weightKg: d.weightKg,
    selfSize: d.selfSize,
    chart: d.chart,
    phoneModel: d.phoneModel.trim(),
    tape,
    tapeMean,
    scan: d.scan,
    calibrated,
    sizes: {
      self: d.selfSize,
      tape: summary(recommendSize(tapeMean, chart)),
      scanRaw: d.scan ? summary(recommendSize(d.scan, chart)) : null,
      scanCal: calibrated ? summary(recommendSize(calibrated, chart)) : null,
    },
    sus: items ? { items, score: susScore(items) } : null,
    consentMethod: d.consentMethod,
    consent:
      d.consentMethod === 'electronic'
        ? { method: 'electronic', initials: d.consentInitials, formVersion: d.consentFormVersion, signedAt: d.consentSignedAt ?? d.createdAt, agreedAll: true }
        : { method: 'paper' },
  };
  return { record, calibrationNote };
}
