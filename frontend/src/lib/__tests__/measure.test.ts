import { describe, expect, it } from 'vitest';
import {
  ASSUME,
  anklePx,
  checkVisibility,
  circumferenceFromWidthDepth,
  cmPerPx,
  combine,
  ellipseCircumference,
  headTopPx,
  inseamPx,
  maskRunWidth,
  measureFront,
  measureSide,
} from '../measure';
import { IMG, frontLandmarks, frontMask, makeMask, sideLandmarks, sideMask } from './fixtures';

describe('ellipseCircumference (Ramanujan)', () => {
  it('is exact for a circle', () => {
    expect(ellipseCircumference(10, 10)).toBeCloseTo(2 * Math.PI * 10, 10);
  });
  it('matches the known perimeter of a 2:1 ellipse within 0.01%', () => {
    // a=2, b=1 → 9.688448220547675 (numerical elliptic integral)
    expect(Math.abs(ellipseCircumference(2, 1) - 9.688448220547675) / 9.688448220547675).toBeLessThan(1e-4);
  });
  it('degenerates to 4a for b = 0 within Ramanujan error', () => {
    expect(ellipseCircumference(5, 0)).toBeCloseTo(20, 0);
  });
  it('is symmetric in a and b', () => {
    expect(ellipseCircumference(15, 11)).toBeCloseTo(ellipseCircumference(11, 15), 12);
  });
  it('rejects negative axes', () => {
    expect(() => ellipseCircumference(-1, 2)).toThrow();
  });
  it('uses half-width and half-depth', () => {
    expect(circumferenceFromWidthDepth(30, 22)).toBeCloseTo(ellipseCircumference(15, 11), 12);
  });
});

describe('checkVisibility', () => {
  it('passes a fully visible front pose', () => {
    expect(checkVisibility(frontLandmarks(), 'front')).toEqual({ ok: true, failing: [] });
  });
  it('rejects when a required landmark is below 0.6', () => {
    const lms = frontLandmarks();
    lms[27] = { ...lms[27], visibility: 0.59 };
    const r = checkVisibility(lms, 'front');
    expect(r.ok).toBe(false);
    expect(r.failing).toEqual(['left ankle']);
  });
  it('accepts exactly 0.6', () => {
    const lms = frontLandmarks();
    lms[27] = { ...lms[27], visibility: 0.6 };
    expect(checkVisibility(lms, 'front').ok).toBe(true);
  });
  it('side view needs only the more visible of each pair', () => {
    expect(checkVisibility(sideLandmarks(), 'side').ok).toBe(true);
  });
  it('side view fails when both of a pair are hidden', () => {
    const lms = sideLandmarks();
    lms[23] = { ...lms[23], visibility: 0.2 };
    expect(checkVisibility(lms, 'side').failing).toEqual(['hip']);
  });
  it('rejects an empty detection', () => {
    expect(checkVisibility([], 'front')).toEqual({ ok: false, failing: ['no person detected'] });
  });
});

describe('scale', () => {
  it('head-top from mask is the first person row above the eyes', () => {
    expect(headTopPx(frontLandmarks(), IMG, 'front', frontMask()).y).toBeCloseTo(200, 0);
  });
  it('head-top without mask uses the eye-mouth ratio', () => {
    // eyes y=300, mouth y=360 → 300 − 1.65·60 = 201
    expect(headTopPx(frontLandmarks(), IMG, 'front').y).toBeCloseTo(300 - ASSUME.HEAD_TOP_EYE_MOUTH_RATIO * 60, 6);
  });
  it('ankle midpoint averages both ankles', () => {
    expect(anklePx(frontLandmarks(), IMG, 'front')).toEqual({ x: 500, y: 1800 });
  });
  it('cm_per_px = height / vertical pixel span', () => {
    expect(cmPerPx(160, { x: 0, y: 200 }, { x: 0, y: 1800 })).toBeCloseTo(0.1, 12);
  });
  it('throws on zero span or bad height', () => {
    expect(() => cmPerPx(160, { x: 0, y: 5 }, { x: 0, y: 5 })).toThrow();
    expect(() => cmPerPx(0, { x: 0, y: 0 }, { x: 0, y: 100 })).toThrow();
  });
});

describe('mask helpers', () => {
  it('maskRunWidth stops at the arm gap', () => {
    const m = frontMask();
    // image row 640 → mask row 320; torso 350..650 image → 175..325 mask → 150 px
    expect(maskRunWidth(m, 320, 250)).toBe(150);
  });
  it('returns 0 when the start pixel is background', () => {
    expect(maskRunWidth(makeMask(() => []), 10, 10)).toBe(0);
  });
});

describe('measureFront', () => {
  it('with a mask: finds widths at chest, narrowest waist, widest hip', () => {
    const r = measureFront(frontLandmarks(), IMG, 160, frontMask());
    expect(r.method).toBe('mask');
    expect(r.cmPerPx).toBeCloseTo(0.1, 3);
    expect(r.widthsCm.chest).toBeCloseTo(30, 1);
    expect(r.widthsCm.waist).toBeCloseTo(24, 1);
    expect(r.widthsCm.hip).toBeCloseTo(34, 1);
    expect(r.levels.waist).toBeGreaterThanOrEqual(ASSUME.WAIST_SEARCH[0]);
    expect(r.levels.hip).toBeLessThanOrEqual(ASSUME.HIP_SEARCH[1]);
  });
  it('without a mask: falls back to landmark ratios', () => {
    const r = measureFront(frontLandmarks(), IMG, 160);
    expect(r.method).toBe('landmark');
    const scale = 160 / (1800 - (300 - ASSUME.HEAD_TOP_EYE_MOUTH_RATIO * 60));
    expect(r.cmPerPx).toBeCloseTo(scale, 10);
    expect(r.widthsCm.chest).toBeCloseTo(ASSUME.CHEST_W_PER_SHOULDER * 200 * scale, 8);
    expect(r.widthsCm.hip).toBeCloseTo(ASSUME.HIP_W_PER_HIPJOINT * 140 * scale, 8);
    expect(r.widthsCm.waist).toBeCloseTo(ASSUME.WAIST_W_PER_HIPJOINT * 140 * scale, 8);
  });
  it('inseam = mean hip→ankle distance × scale', () => {
    const px = inseamPx(frontLandmarks(), IMG);
    expect(px).toBeCloseTo(Math.hypot(20, 800), 8);
    const r = measureFront(frontLandmarks(), IMG, 160, frontMask());
    expect(r.inseamCm).toBeCloseTo(px * r.cmPerPx, 8);
  });
  it('scales linearly with measured height', () => {
    const a = measureFront(frontLandmarks(), IMG, 160, frontMask());
    const b = measureFront(frontLandmarks(), IMG, 176, frontMask());
    expect(b.widthsCm.chest / a.widthsCm.chest).toBeCloseTo(1.1, 6);
  });
});

describe('measureSide + combine', () => {
  it('measures depths at the front levels and combines via Ramanujan', () => {
    const f = measureFront(frontLandmarks(), IMG, 160, frontMask());
    const s = measureSide(sideLandmarks(), IMG, 160, f.levels, f.widthsCm, sideMask());
    expect(s.method).toBe('mask');
    expect(s.depthsCm.chest).toBeCloseTo(22, 1);
    expect(s.depthsCm.waist).toBeCloseTo(20, 1);
    expect(s.depthsCm.hip).toBeCloseTo(26, 1);
    const c = combine(f, s);
    expect(c.chest).toBeCloseTo(circumferenceFromWidthDepth(f.widthsCm.chest, s.depthsCm.chest), 10);
    expect(c.chest).toBeCloseTo(ellipseCircumference(15, 11), 0);
    expect(c.inseam).toBe(f.inseamCm);
  });
  it('falls back to depth ratios without a mask', () => {
    const f = measureFront(frontLandmarks(), IMG, 160);
    const s = measureSide(sideLandmarks(), IMG, 160, f.levels, f.widthsCm);
    expect(s.method).toBe('landmark');
    expect(s.depthsCm.hip).toBeCloseTo(f.widthsCm.hip * ASSUME.DEPTH_PER_WIDTH.hip, 10);
  });
});
