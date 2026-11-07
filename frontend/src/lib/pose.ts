/**
 * Thin wrapper around MediaPipe PoseLandmarker (runs entirely in the browser).
 * Images are drawn to an in-memory canvas, analysed, and then the canvas is wiped.
 * Nothing here uploads or stores pixels.
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { LM, Mask } from './measure';

const WASM_BASE = import.meta.env.VITE_MP_WASM_BASE || `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL_URL =
  import.meta.env.VITE_MP_MODEL_URL ||
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task';

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'IMAGE' as const,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        outputSegmentationMasks: true,
      });
      try {
        return await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch {
        return await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    })();
    landmarkerPromise.catch(() => (landmarkerPromise = null));
  }
  return landmarkerPromise;
}

export interface Detection {
  landmarks: LM[];
  mask?: Mask;
  detectMs: number;
}

/** Runs detection on a canvas and copies the outputs into plain JS arrays. */
export async function detectPose(canvas: HTMLCanvasElement): Promise<Detection> {
  const lm = await getPoseLandmarker();
  const t0 = performance.now();
  const res = lm.detect(canvas);
  const detectMs = performance.now() - t0;
  const landmarks: LM[] = (res.landmarks[0] ?? []).map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 }));
  let mask: Mask | undefined;
  const m = res.segmentationMasks?.[0];
  if (m) {
    mask = { data: Float32Array.from(m.getAsFloat32Array()), w: m.width, h: m.height };
  }
  res.close();
  return { landmarks, mask, detectMs };
}

/** Wipe pixel data from a canvas after use. */
export function wipeCanvas(c: HTMLCanvasElement | null) {
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx?.clearRect(0, 0, c.width, c.height);
  c.width = 0;
  c.height = 0;
}
