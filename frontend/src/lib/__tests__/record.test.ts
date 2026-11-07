import { describe, expect, it } from 'vitest';
import { buildRecord } from '../record';
import { emptyDraft } from '../../state/draft';
import { validateCalibration } from '../calibrate';
import type { ScanResult } from '../../types';

function draft() {
  const d = emptyDraft('P003', 'Pixel 8');
  Object.assign(d, { consent: true, sex: 'female', ageBand: '25-34', heightCm: 165, weightKg: 60, selfSize: '10', chart: 'womenswear' });
  d.tape = { chest: [86, 86.4, null], waist: [68, 70, 69.6], hip: [93, 93, null], inseam: [76, 76.2, null] };
  d.scan = { chest: 84, waist: 66, hip: 90, inseam: 74 } as ScanResult;
  d.sus = [4, 2, 4, 1, 4, 2, 3, 2, 4, 1];
  return d;
}

describe('buildRecord', () => {
  it('stores all readings, closest-two means, sizes and SUS', () => {
    const { record } = buildRecord(draft(), '0.1.0', null);
    expect(record.tape.waist).toEqual([68, 70, 69.6]);
    expect(record.tape.chest).toEqual([86, 86.4]);
    expect(record.tapeMean.waist).toBe(69.8);
    expect(record.sizes.tape?.size).toBe('10');
    expect(record.sizes.scanRaw?.size).toBe('8');
    expect(record.calibrated).toBeNull();
    expect(record.sizes.scanCal).toBeNull();
    expect(record.sus?.score).toBe(77.5);
    expect(record.appVersion).toBe('0.1.0');
  });
  it('drops an unneeded reading 3', () => {
    const d = draft();
    d.tape.hip = [93, 93.5, 99];
    expect(buildRecord(d, '0.1.0', null).record.tape.hip).toEqual([93, 93.5]);
  });
  it('applies calibration and its size', () => {
    const cal = validateCalibration({ version: 'v1', trainedOnIds: [], models: { chest: { b0: 2, b1: 1, b2: 0, b3: 0 }, waist: { b0: 3, b1: 1, b2: 0, b3: 0 }, hip: { b0: 3, b1: 1, b2: 0, b3: 0 } } });
    const { record } = buildRecord(draft(), '0.1.0', cal);
    expect(record.calibrated).toEqual({ modelVersion: 'v1', chest: 86, waist: 69, hip: 93 });
    expect(record.sizes.scanCal?.size).toBe('10');
  });
  it('refuses calibration for a training-set participant', () => {
    const cal = validateCalibration({ version: 'v1', trainedOnIds: ['P003'], models: { chest: { b0: 0, b1: 1, b2: 0, b3: 0 } } });
    const { record, calibrationNote } = buildRecord(draft(), '0.1.0', cal);
    expect(record.calibrated).toBeNull();
    expect(calibrationNote).toMatch(/training set/);
  });
  it('contains no identifying fields', () => {
    const keys = Object.keys(buildRecord(draft(), '0.1.0', null).record);
    for (const bad of ['name', 'email', 'phone', 'photo', 'image']) expect(keys).not.toContain(bad);
  });
});
