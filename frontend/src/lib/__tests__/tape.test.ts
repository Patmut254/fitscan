import { describe, expect, it } from 'vitest';
import { meanOfClosestTwo, needsThirdReading, validateReadings } from '../tape';

describe('tape protocol', () => {
  it('needs a third reading only when the difference exceeds 1.0 cm', () => {
    expect(needsThirdReading(80, 81)).toBe(false);
    expect(needsThirdReading(80.3, 79.3)).toBe(false); // float noise
    expect(needsThirdReading(80, 81.1)).toBe(true);
    expect(needsThirdReading(80, null)).toBe(false);
  });
  it('means two readings', () => {
    expect(meanOfClosestTwo([80, 81])).toBe(80.5);
  });
  it('means the closest pair of three', () => {
    expect(meanOfClosestTwo([80, 82, 82.4])).toBeCloseTo(82.2, 10);
    expect(meanOfClosestTwo([90, 88, 89.8])).toBeCloseTo(89.9, 10);
  });
  it('breaks ties with the earliest pair', () => {
    expect(meanOfClosestTwo([80, 82, 84])).toBe(81);
  });
  it('requires two readings', () => {
    expect(() => meanOfClosestTwo([80])).toThrow();
  });
  it('validates', () => {
    expect(validateReadings([80, null])).toMatch(/reading 2/);
    expect(validateReadings([80, 82, null])).toMatch(/reading 3/);
    expect(validateReadings([80, 82, 81])).toBeNull();
    expect(validateReadings([5, 6])).toMatch(/between/);
  });
});
