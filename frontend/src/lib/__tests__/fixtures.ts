import type { LM, Mask } from '../measure';

export const IMG = { w: 1000, h: 2000 };

/** 33 landmarks, all visible, placed in IMAGE pixels then normalised. */
export function makeLandmarks(px: Record<number, [number, number]>, vis = 0.99, img = IMG): LM[] {
  const lms: LM[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));
  for (const [i, [x, y]] of Object.entries(px)) lms[Number(i)] = { x: x / img.w, y: y / img.h, z: 0, visibility: vis };
  return lms;
}

/** Synthetic front pose: head-top 200, ankles 1800 → 1600 px for the body. */
export function frontLandmarks(vis = 0.99) {
  return makeLandmarks(
    {
      0: [500, 330], // nose
      2: [480, 300], // left eye
      5: [520, 300], // right eye
      9: [490, 360], // mouth left
      10: [510, 360], // mouth right
      11: [400, 500], // left shoulder
      12: [600, 500], // right shoulder
      23: [430, 1000], // left hip
      24: [570, 1000], // right hip
      27: [450, 1800], // left ankle
      28: [550, 1800], // right ankle
    },
    vis,
  );
}

/** Synthetic side pose: left side visible, right side occluded (low visibility). */
export function sideLandmarks() {
  const lms = makeLandmarks({
    0: [520, 330],
    2: [505, 300],
    9: [510, 360],
    11: [500, 500],
    23: [500, 1000],
    27: [500, 1800],
  });
  for (const i of [5, 10, 12, 24, 28]) lms[i] = { ...lms[i], visibility: 0.1 };
  return lms;
}

/**
 * Build a half-resolution mask (500 × 1000) from a function giving, for an IMAGE row y,
 * a list of [x0, x1) IMAGE-pixel runs that are "person".
 */
export function makeMask(runs: (y: number) => [number, number][], img = IMG, scale = 0.5): Mask {
  const w = img.w * scale;
  const h = img.h * scale;
  const data = new Float32Array(w * h);
  for (let my = 0; my < h; my++) {
    const y = my / scale;
    for (const [x0, x1] of runs(y)) for (let mx = Math.round(x0 * scale); mx < Math.round(x1 * scale); mx++) data[my * w + mx] = 1;
  }
  return { data, w, h };
}

/** Front silhouette: head top at 200; chest 300 px wide, waist 240, hip 340; arms separated by a gap. */
export function frontMask() {
  return makeMask((y) => {
    if (y < 200) return [];
    if (y < 420) return [[420, 580]];
    const arms: [number, number][] = y >= 450 && y < 1000 ? [[280, 320], [680, 720]] : [];
    if (y < 700) return [[350, 650], ...arms];
    if (y < 900) return [[380, 620], ...arms];
    if (y < 1200) return [[330, 670], ...arms];
    if (y < 1800) return [[380, 480], [520, 620]];
    return [];
  });
}

/** Side silhouette: depth chest 220, waist 200, hip 260 px, centred on x = 500. */
export function sideMask() {
  return makeMask((y) => {
    if (y < 200) return [];
    if (y < 420) return [[430, 570]];
    if (y < 700) return [[390, 610]];
    if (y < 900) return [[400, 600]];
    if (y < 1200) return [[370, 630]];
    if (y < 1800) return [[440, 560]];
    return [];
  });
}
