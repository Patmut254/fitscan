/**
 * FitScan measurement pipeline — PURE FUNCTIONS ONLY.
 *
 * Nothing in this file touches the DOM, the camera, MediaPipe or Firebase, so every step
 * can be unit-tested with synthetic landmarks and masks (see __tests__/measure.test.ts).
 *
 * Inputs are MediaPipe Pose landmarks (33 points, normalised 0-1 to the image) plus the image
 * size in pixels, and optionally the person segmentation mask returned by PoseLandmarker.
 *
 * ─── GLOBAL ASSUMPTIONS ────────────────────────────────────────────────────────────────────
 * A1. Capture protocol: phone held upright at 1.0 m height, participant 2.5 m away, standing
 *     straight, feet hip-width apart, arms held slightly away from the body (A-pose), fitted
 *     clothing. At 2.5 m perspective distortion across the torso is small, so we treat the
 *     image as an orthographic projection with ONE scale factor per photo.
 * A2. The participant's body plane is parallel to the image plane (front photo) or
 *     perpendicular to it (side photo). Rotation is not corrected.
 * A3. Scale is derived per photo from measured stature (spec):
 *        cm_per_px = measured_height_cm / pixel distance(head-top estimate → ankle midpoint)
 *     The ankle joint sits roughly 6-8 cm above the floor, so this scale is systematically
 *     ~4% too large. We keep the spec definition; the calibration model (calibrate.ts)
 *     absorbs constant bias like this.
 * A4. Torso cross-sections at chest, waist and hip are modelled as ellipses whose axes are
 *     the front width (a = width/2) and side depth (b = depth/2). Real cross-sections are
 *     flatter at the back; again a systematic bias that calibration absorbs.
 * A5. All raw scan values are "uncalibrated estimates". Only calibrated values should be
 *     compared with tape in analysis claims.
 */

/** Minimal landmark shape (compatible with MediaPipe NormalizedLandmark). */
export interface LM {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface ImageSize {
  w: number;
  h: number;
}

/** Person segmentation mask: values 0-1 (probability of "person"), row-major, mask.w × mask.h. */
export interface Mask {
  data: ArrayLike<number>;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

// MediaPipe Pose landmark indices used here.
export const L = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export const MIN_VISIBILITY = 0.6;
export const MASK_THRESHOLD = 0.5;

/**
 * Tunable anthropometric constants. Every one of these is an ASSUMPTION; they are exported
 * so the analysis can report them and so tests can pin behaviour.
 */
export const ASSUME = {
  /**
   * Head-top (vertex) estimate when no mask is available: vertex is this many
   * eye-to-mouth distances above the eye midpoint. Adult anthropometry: vertex→eye ≈ 11-12 cm,
   * eye→mouth (stomion) ≈ 7 cm → ≈ 1.65.
   */
  HEAD_TOP_EYE_MOUTH_RATIO: 1.65,
  /**
   * Vertical levels, as fractions of the torso segment from shoulder-joint midpoint (0)
   * to hip-joint midpoint (1), measured in the same photo.
   *  - Chest/bust: ≈ 12-15 cm below shoulder joints on a ≈ 50 cm segment → 0.28.
   *  - Waist: natural waist lies ≈ 60-65 % down; when a mask exists we search a band for the
   *    narrowest row (the anatomical definition of natural waist).
   *  - Hip: the fullest part of the buttocks sits a little BELOW the hip-joint landmark
   *    (≈ greater trochanter level); with a mask we search a band for the widest row.
   */
  CHEST_LEVEL: 0.28,
  WAIST_LEVEL: 0.62,
  WAIST_SEARCH: [0.5, 0.78] as [number, number],
  HIP_LEVEL: 1.08,
  HIP_SEARCH: [0.95, 1.22] as [number, number],
  /**
   * Fallback widths when no segmentation mask is available. MediaPipe shoulder/hip landmarks
   * are JOINT CENTRES, not the body outline, so the outline width is a multiple of the joint
   * separation. Starting values from typical adult ratios:
   *  - chest breadth ≈ 0.90 × shoulder-joint separation
   *  - hip breadth   ≈ 1.55 × hip-joint separation
   *  - waist breadth ≈ 1.30 × hip-joint separation
   */
  CHEST_W_PER_SHOULDER: 0.9,
  HIP_W_PER_HIPJOINT: 1.55,
  WAIST_W_PER_HIPJOINT: 1.3,
  /** Fallback depth/width ratios (side depth when no mask): typical adult cross-sections. */
  DEPTH_PER_WIDTH: { chest: 0.72, waist: 0.75, hip: 0.8 },
};

// ─── Geometry primitives ────────────────────────────────────────────────────────────────────

export function toPx(lm: LM, img: ImageSize): Pt {
  return { x: lm.x * img.w, y: lm.y * img.h };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Ramanujan's first approximation of ellipse perimeter:
 *   C ≈ π [ 3(a + b) − √((3a + b)(a + 3b)) ]
 * Exact for a circle; error < 0.04 % for the aspect ratios of human torsos.
 */
export function ellipseCircumference(a: number, b: number): number {
  if (a < 0 || b < 0) throw new Error('Semi-axes must be non-negative');
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/** Circumference from a full width and full depth (a = width/2, b = depth/2). */
export function circumferenceFromWidthDepth(width: number, depth: number): number {
  return ellipseCircumference(width / 2, depth / 2);
}

// ─── Landmark quality ───────────────────────────────────────────────────────────────────────

export type View = 'front' | 'side';

/**
 * Required landmarks per view.
 *  FRONT: both eyes, nose, both shoulders, both hips, both ankles (scale, levels, widths, inseam).
 *  SIDE:  in profile the far-side joints are occluded, so for each pair we require the MORE
 *         visible member to pass (nose, eye, shoulder, hip, ankle).
 */
export function checkVisibility(
  landmarks: LM[],
  view: View,
  min = MIN_VISIBILITY,
): { ok: boolean; failing: string[] } {
  const v = (i: number) => landmarks[i]?.visibility ?? 0;
  const failing: string[] = [];
  if (!landmarks || landmarks.length < 33) return { ok: false, failing: ['no person detected'] };

  if (view === 'front') {
    const req: [string, number][] = [
      ['nose', L.NOSE],
      ['left eye', L.LEFT_EYE],
      ['right eye', L.RIGHT_EYE],
      ['left shoulder', L.LEFT_SHOULDER],
      ['right shoulder', L.RIGHT_SHOULDER],
      ['left hip', L.LEFT_HIP],
      ['right hip', L.RIGHT_HIP],
      ['left ankle', L.LEFT_ANKLE],
      ['right ankle', L.RIGHT_ANKLE],
    ];
    for (const [name, i] of req) if (v(i) < min) failing.push(name);
  } else {
    if (v(L.NOSE) < min) failing.push('nose');
    const pairs: [string, number, number][] = [
      ['eye', L.LEFT_EYE, L.RIGHT_EYE],
      ['shoulder', L.LEFT_SHOULDER, L.RIGHT_SHOULDER],
      ['hip', L.LEFT_HIP, L.RIGHT_HIP],
      ['ankle', L.LEFT_ANKLE, L.RIGHT_ANKLE],
    ];
    for (const [name, a, b] of pairs) if (Math.max(v(a), v(b)) < min) failing.push(name);
  }
  return { ok: failing.length === 0, failing };
}

/** For side view: pick the more visible of a left/right pair. */
export function moreVisible(landmarks: LM[], a: number, b: number): LM {
  return (landmarks[a].visibility ?? 0) >= (landmarks[b].visibility ?? 0) ? landmarks[a] : landmarks[b];
}

// ─── Mask helpers ──────────────────────────────────────────────────────────────────────────

function maskAt(mask: Mask, x: number, y: number): number {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= mask.w || yi >= mask.h) return 0;
  return mask.data[yi * mask.w + xi];
}

/**
 * Width of the contiguous "person" run on mask row y that contains x0 (both in MASK pixels).
 * Scans outwards from x0 until the first background pixel on each side, so arms held away
 * from the body (protocol A-pose) are NOT counted in torso width.
 * Returns 0 if x0 itself is background.
 */
export function maskRunWidth(mask: Mask, y: number, x0: number, threshold = MASK_THRESHOLD): number {
  if (maskAt(mask, x0, y) < threshold) return 0;
  let left = Math.round(x0);
  let right = Math.round(x0);
  while (left - 1 >= 0 && maskAt(mask, left - 1, y) >= threshold) left--;
  while (right + 1 < mask.w && maskAt(mask, right + 1, y) >= threshold) right++;
  return right - left + 1;
}

/** Topmost person pixel in a column band [x0 - halfBand, x0 + halfBand] above yStart (mask px). */
export function maskTopInBand(mask: Mask, x0: number, halfBand: number, yStart: number, threshold = MASK_THRESHOLD): number | null {
  const xa = Math.max(0, Math.round(x0 - halfBand));
  const xb = Math.min(mask.w - 1, Math.round(x0 + halfBand));
  for (let y = 0; y <= Math.min(mask.h - 1, Math.round(yStart)); y++) {
    for (let x = xa; x <= xb; x++) if (mask.data[y * mask.w + x] >= threshold) return y;
  }
  return null;
}

// ─── Scale ──────────────────────────────────────────────────────────────────────────────────

/**
 * Head-top (vertex) estimate in IMAGE pixels.
 *  - With a mask: the first person pixel scanning down the column band around the nose
 *    (band = ± half the eye-to-eye distance, min 2 px), searched from the image top to the eyes.
 *    Assumes no raised hands/hair accessories above the head (protocol).
 *  - Without a mask: eye midpoint minus HEAD_TOP_EYE_MOUTH_RATIO × eye-to-mouth distance.
 * For the side view, the visible eye and visible mouth corner are used.
 */
export function headTopPx(landmarks: LM[], img: ImageSize, view: View, mask?: Mask): Pt {
  const nose = toPx(landmarks[L.NOSE], img);
  let eye: Pt;
  let mouth: Pt;
  let eyeSpan: number;
  if (view === 'front') {
    const le = toPx(landmarks[L.LEFT_EYE], img);
    const re = toPx(landmarks[L.RIGHT_EYE], img);
    eye = mid(le, re);
    eyeSpan = dist(le, re);
    mouth = mid(toPx(landmarks[L.MOUTH_LEFT], img), toPx(landmarks[L.MOUTH_RIGHT], img));
  } else {
    eye = toPx(moreVisible(landmarks, L.LEFT_EYE, L.RIGHT_EYE), img);
    mouth = toPx(moreVisible(landmarks, L.MOUTH_LEFT, L.MOUTH_RIGHT), img);
    eyeSpan = Math.abs(eye.x - nose.x) * 2;
  }

  if (mask) {
    const sx = mask.w / img.w;
    const sy = mask.h / img.h;
    const half = Math.max(2, (eyeSpan / 2) * sx);
    const top = maskTopInBand(mask, nose.x * sx, half, eye.y * sy);
    if (top !== null) return { x: nose.x, y: top / sy };
  }
  const eyeMouth = Math.max(1, mouth.y - eye.y);
  return { x: eye.x, y: eye.y - ASSUME.HEAD_TOP_EYE_MOUTH_RATIO * eyeMouth };
}

/** Ankle midpoint (front) or visible ankle (side), image pixels. */
export function anklePx(landmarks: LM[], img: ImageSize, view: View): Pt {
  if (view === 'front') return mid(toPx(landmarks[L.LEFT_ANKLE], img), toPx(landmarks[L.RIGHT_ANKLE], img));
  return toPx(moreVisible(landmarks, L.LEFT_ANKLE, L.RIGHT_ANKLE), img);
}

/**
 * cm_per_px = measured_height_cm / pixel distance from head-top estimate to ankle midpoint.
 * We use the VERTICAL pixel distance: under A1 the participant stands upright, and the
 * vertical component is robust to the ankle midpoint shifting sideways with stance width.
 */
export function cmPerPx(heightCm: number, headTop: Pt, ankleMid: Pt): number {
  const px = Math.abs(ankleMid.y - headTop.y);
  if (!(heightCm > 0) || px < 1) throw new Error('Cannot compute scale: invalid height or pixel span');
  return heightCm / px;
}

// ─── Torso levels ───────────────────────────────────────────────────────────────────────────

export interface TorsoFrame {
  shoulderMid: Pt;
  hipMid: Pt;
  /** y (image px) at torso fraction t (0 = shoulders, 1 = hips; may exceed 1). */
  yAt: (t: number) => number;
  /** x (image px) of the torso centre line at torso fraction t. */
  xAt: (t: number) => number;
}

export function torsoFrame(landmarks: LM[], img: ImageSize, view: View): TorsoFrame {
  let shoulderMid: Pt;
  let hipMid: Pt;
  if (view === 'front') {
    shoulderMid = mid(toPx(landmarks[L.LEFT_SHOULDER], img), toPx(landmarks[L.RIGHT_SHOULDER], img));
    hipMid = mid(toPx(landmarks[L.LEFT_HIP], img), toPx(landmarks[L.RIGHT_HIP], img));
  } else {
    shoulderMid = toPx(moreVisible(landmarks, L.LEFT_SHOULDER, L.RIGHT_SHOULDER), img);
    hipMid = toPx(moreVisible(landmarks, L.LEFT_HIP, L.RIGHT_HIP), img);
  }
  return {
    shoulderMid,
    hipMid,
    yAt: (t) => shoulderMid.y + t * (hipMid.y - shoulderMid.y),
    xAt: (t) => shoulderMid.x + t * (hipMid.x - shoulderMid.x),
  };
}

/** Mask run width (converted to IMAGE px) at torso fraction t. */
function widthAtT(frame: TorsoFrame, mask: Mask, img: ImageSize, t: number): number {
  const sx = mask.w / img.w;
  const sy = mask.h / img.h;
  return maskRunWidth(mask, frame.yAt(t) * sy, frame.xAt(t) * sx) / sx;
}

/** Search band [t0, t1] in steps and return the t with min (or max) mask width. */
export function searchLevel(
  frame: TorsoFrame,
  mask: Mask,
  img: ImageSize,
  band: [number, number],
  mode: 'min' | 'max',
  steps = 28,
): { t: number; widthPx: number } {
  let best = { t: band[0], widthPx: mode === 'min' ? Infinity : -Infinity };
  for (let i = 0; i <= steps; i++) {
    const t = band[0] + ((band[1] - band[0]) * i) / steps;
    const w = widthAtT(frame, mask, img, t);
    if (w <= 0) continue;
    if ((mode === 'min' && w < best.widthPx) || (mode === 'max' && w > best.widthPx)) best = { t, widthPx: w };
  }
  if (!Number.isFinite(best.widthPx)) return { t: mode === 'min' ? ASSUME.WAIST_LEVEL : ASSUME.HIP_LEVEL, widthPx: 0 };
  return best;
}

export interface Levels {
  chest: number;
  waist: number;
  hip: number;
}

// ─── Front photo ────────────────────────────────────────────────────────────────────────────

export interface FrontResult {
  cmPerPx: number;
  widthsCm: Levels;
  /** Torso fractions used for each level (applied to the side photo too). */
  levels: Levels;
  inseamCm: number;
  method: 'mask' | 'landmark';
}

/**
 * Inseam proxy from the FRONT photo: mean of left and right hip-joint → ankle-joint Euclidean
 * distances. ASSUMPTION: hip joint is ≈ at crotch height and ankle ≈ floor; both offsets are
 * systematic and corrected by calibration.
 */
export function inseamPx(landmarks: LM[], img: ImageSize): number {
  const l = dist(toPx(landmarks[L.LEFT_HIP], img), toPx(landmarks[L.LEFT_ANKLE], img));
  const r = dist(toPx(landmarks[L.RIGHT_HIP], img), toPx(landmarks[L.RIGHT_ANKLE], img));
  return (l + r) / 2;
}

export function measureFront(landmarks: LM[], img: ImageSize, heightCm: number, mask?: Mask): FrontResult {
  const scale = cmPerPx(heightCm, headTopPx(landmarks, img, 'front', mask), anklePx(landmarks, img, 'front'));
  const frame = torsoFrame(landmarks, img, 'front');

  let widthsPx: Levels;
  let levels: Levels;
  let method: 'mask' | 'landmark' = 'landmark';

  const chestMaskW = mask ? widthAtT(frame, mask, img, ASSUME.CHEST_LEVEL) : 0;
  if (mask && chestMaskW > 0) {
    const waist = searchLevel(frame, mask, img, ASSUME.WAIST_SEARCH, 'min');
    const hip = searchLevel(frame, mask, img, ASSUME.HIP_SEARCH, 'max');
    if (waist.widthPx > 0 && hip.widthPx > 0) {
      method = 'mask';
      levels = { chest: ASSUME.CHEST_LEVEL, waist: waist.t, hip: hip.t };
      widthsPx = { chest: chestMaskW, waist: waist.widthPx, hip: hip.widthPx };
    }
  }
  if (method === 'landmark') {
    const shoulderSep = dist(toPx(landmarks[L.LEFT_SHOULDER], img), toPx(landmarks[L.RIGHT_SHOULDER], img));
    const hipSep = dist(toPx(landmarks[L.LEFT_HIP], img), toPx(landmarks[L.RIGHT_HIP], img));
    levels = { chest: ASSUME.CHEST_LEVEL, waist: ASSUME.WAIST_LEVEL, hip: ASSUME.HIP_LEVEL };
    widthsPx = {
      chest: ASSUME.CHEST_W_PER_SHOULDER * shoulderSep,
      waist: ASSUME.WAIST_W_PER_HIPJOINT * hipSep,
      hip: ASSUME.HIP_W_PER_HIPJOINT * hipSep,
    };
  }

  return {
    cmPerPx: scale,
    levels: levels!,
    widthsCm: { chest: widthsPx!.chest * scale, waist: widthsPx!.waist * scale, hip: widthsPx!.hip * scale },
    inseamCm: inseamPx(landmarks, img) * scale,
    method,
  };
}

// ─── Side photo ─────────────────────────────────────────────────────────────────────────────

export interface SideResult {
  cmPerPx: number;
  depthsCm: Levels;
  method: 'mask' | 'landmark';
}

/**
 * Side depths at the SAME torso fractions found in the front photo. The side photo has its
 * own scale (participant may shift slightly between photos). Depth = mask run width on the row,
 * starting from the torso centre line (shoulder→hip of the visible side).
 * ASSUMPTION: in profile the hanging arm lies within the torso outline, so it does not add depth.
 */
export function measureSide(
  landmarks: LM[],
  img: ImageSize,
  heightCm: number,
  levels: Levels,
  frontWidthsCm: Levels,
  mask?: Mask,
): SideResult {
  const scale = cmPerPx(heightCm, headTopPx(landmarks, img, 'side', mask), anklePx(landmarks, img, 'side'));
  const frame = torsoFrame(landmarks, img, 'side');
  if (mask) {
    const d = {
      chest: widthAtT(frame, mask, img, levels.chest),
      waist: widthAtT(frame, mask, img, levels.waist),
      hip: widthAtT(frame, mask, img, levels.hip),
    };
    if (d.chest > 0 && d.waist > 0 && d.hip > 0) {
      return { cmPerPx: scale, method: 'mask', depthsCm: { chest: d.chest * scale, waist: d.waist * scale, hip: d.hip * scale } };
    }
  }
  return {
    cmPerPx: scale,
    method: 'landmark',
    depthsCm: {
      chest: frontWidthsCm.chest * ASSUME.DEPTH_PER_WIDTH.chest,
      waist: frontWidthsCm.waist * ASSUME.DEPTH_PER_WIDTH.waist,
      hip: frontWidthsCm.hip * ASSUME.DEPTH_PER_WIDTH.hip,
    },
  };
}

// ─── Combine ────────────────────────────────────────────────────────────────────────────────

export interface CombinedResult {
  chest: number;
  waist: number;
  hip: number;
  inseam: number;
  front: FrontResult;
  side: SideResult;
}

export function combine(front: FrontResult, side: SideResult): CombinedResult {
  const c = (k: keyof Levels) => circumferenceFromWidthDepth(front.widthsCm[k], side.depthsCm[k]);
  return { chest: c('chest'), waist: c('waist'), hip: c('hip'), inseam: front.inseamCm, front, side };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
