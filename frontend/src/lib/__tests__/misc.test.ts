import { describe, expect, it } from 'vitest';
import { susScore } from '../sus';
import { formatParticipantId, parseParticipantId } from '../ids';
import { phoneModelFromUA } from '../phone';

describe('SUS', () => {
  it('scores best and worst cases', () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
  });
  it('matches a worked example', () => {
    // odd: 4,4,4,3,4 → 3+3+3+2+3 = 14 ; even: 2,1,2,2,1 → 3+4+3+3+4 = 17 ; 31 × 2.5 = 77.5
    expect(susScore([4, 2, 4, 1, 4, 2, 3, 2, 4, 1])).toBe(77.5);
  });
  it('rejects bad input', () => {
    expect(() => susScore([1, 2, 3])).toThrow();
    expect(() => susScore([6, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toThrow();
  });
});

describe('participant ids', () => {
  it('formats sequentially', () => {
    expect(formatParticipantId(1)).toBe('P001');
    expect(formatParticipantId(42)).toBe('P042');
    expect(formatParticipantId(1000)).toBe('P1000');
    expect(() => formatParticipantId(0)).toThrow();
  });
  it('parses', () => {
    expect(parseParticipantId('P007')).toBe(7);
    expect(parseParticipantId('X1')).toBeNull();
  });
});

describe('phone model', () => {
  it('reads Android models', () => {
    expect(phoneModelFromUA('Mozilla/5.0 (Linux; Android 13; SM-A546B Build/TP1A) AppleWebKit')).toBe('SM-A546B');
    expect(phoneModelFromUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit')).toBe('Pixel 8');
    expect(phoneModelFromUA('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit')).toBe('Android 10 (model hidden)');
  });
  it('reads iPhones', () => {
    expect(phoneModelFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)')).toBe('iPhone (iOS 17.4)');
  });
});
