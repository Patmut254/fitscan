import { describe, expect, it } from 'vitest';
import { SIZE_CHARTS, chartForSex, recommendSize, signedMargin } from '../size';
import { applyCalibration, fitOls, predict, validateCalibration } from '../calibrate';

describe('size engine', () => {
  const W = SIZE_CHARTS.womenswear;
  const M = SIZE_CHARTS.menswear;
  it('picks the size containing all measurements', () => {
    const r = recommendSize({ chest: 86, waist: 68, hip: 93 }, W)!;
    expect(r.size).toBe('10');
    expect(r.penalty).toBe(0);
    expect(r.boundaryDistanceCm).toBe(2);
  });
  it('ranges are [min, max): a value at the max belongs to the next size', () => {
    expect(recommendSize({ chest: 88, waist: 70, hip: 95 }, W)!.size).toBe('12');
  });
  it('balances mixed measurements by least squared out-of-range distance', () => {
    // bust in 10, waist in 12, hip in 12 → 12
    expect(recommendSize({ chest: 87, waist: 72, hip: 97 }, W)!.size).toBe('12');
    const r = recommendSize({ chest: 87, waist: 72, hip: 97 }, W)!;
    expect(r.boundaryDistanceCm).toBeLessThan(0); // bust is outside size 12
  });
  it('works with missing dimensions', () => {
    expect(recommendSize({ waist: 90 }, M)!.size).toBe('L');
    expect(recommendSize({}, M)).toBeNull();
  });
  it('clamps to the largest/smallest size', () => {
    expect(recommendSize({ chest: 150, waist: 140, hip: 150 }, M)!.size).toBe('3XL');
    expect(recommendSize({ chest: 60, waist: 50, hip: 60 }, W)!.size).toBe('4');
  });
  it('signed margin', () => {
    expect(signedMargin(85, [84, 88])).toBe(1);
    expect(signedMargin(83, [84, 88])).toBe(-1);
    expect(signedMargin(89, [84, 88])).toBe(-1);
  });
  it('chart by sex', () => {
    expect(chartForSex('male')).toBe('menswear');
    expect(chartForSex('female')).toBe('womenswear');
  });
});

describe('calibration', () => {
  it('OLS recovers known coefficients exactly from noiseless data', () => {
    const truth = [5, 0.9, 2.5, 0.05];
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 20; i++) {
      const scan = 70 + i * 1.7;
      const sex = i % 2;
      const h = 150 + ((i * 7) % 40);
      X.push([scan, sex, h]);
      y.push(truth[0] + truth[1] * scan + truth[2] * sex + truth[3] * h);
    }
    fitOls(X, y).forEach((b, i) => expect(b).toBeCloseTo(truth[i], 6));
  });
  it('detects collinearity', () => {
    expect(() => fitOls([[1, 0, 1], [2, 0, 2], [3, 0, 3], [4, 0, 4]], [1, 2, 3, 4])).toThrow(/Singular/);
  });
  const cal = validateCalibration({
    version: 'v1',
    trainedOnIds: ['P001', 'P002'],
    models: { chest: { b0: 2, b1: 1, b2: 1, b3: 0 } },
  });
  it('validates and fills defaults', () => {
    expect(cal.sexCoding.prefer_not_to_say).toBe(0.5);
    expect(() => validateCalibration({ version: 'x', models: { chest: { b0: 'a' } } })).toThrow();
    expect(() => validateCalibration({ version: 'x', models: { neck: { b0: 1, b1: 1, b2: 1, b3: 1 } } })).toThrow();
  });
  it('predicts with the stored sex coding', () => {
    expect(predict(cal.models.chest!, 90, cal.sexCoding.male, 170)).toBe(93);
    const r = applyCalibration(cal, 'P010', { chest: 90, waist: 70, hip: 95, inseam: 78 }, 'female', 160);
    expect(r).toEqual({ ok: true, values: { chest: 92 }, modelVersion: 'v1' });
  });
  it('never predicts a record that was in the training set', () => {
    const r = applyCalibration(cal, 'P002', { chest: 90, waist: 70, hip: 95, inseam: 78 }, 'female', 160);
    expect(r.ok).toBe(false);
  });
  it('reports no model', () => {
    expect(applyCalibration(null, 'P001', { chest: 1, waist: 1, hip: 1, inseam: 1 }, 'male', 1).ok).toBe(false);
  });
});
