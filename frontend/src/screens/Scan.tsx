import { useCallback, useEffect, useRef, useState } from 'react';
import { Silhouette } from '../components/Silhouette';
import { detectPose, getPoseLandmarker, wipeCanvas } from '../lib/pose';
import {
  checkVisibility,
  combine,
  measureFront,
  measureSide,
  round1,
  type FrontResult,
  type ImageSize,
  type LM,
  type SideResult,
} from '../lib/measure';
import type { ScanResult, StoredLandmark } from '../types';

type View = 'front' | 'side';
type Phase = 'live' | 'processing' | 'review' | 'rejected';

interface Accepted {
  landmarks: LM[];
  img: ImageSize;
  ms: number;
  front?: FrontResult;
  side?: SideResult;
}

// Skeleton edges for the review overlay.
const EDGES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [0, 2], [0, 5],
];

const toStored = (l: LM[]): StoredLandmark[] =>
  l.map((p) => ({ x: +p.x.toFixed(5), y: +p.y.toFixed(5), z: +(p.z ?? 0).toFixed(5), v: +(p.visibility ?? 0).toFixed(3) }));

export function Scan({ heightCm, onDone, onBack }: { heightCm: number; onDone: (s: ScanResult) => void; onBack: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null); // offscreen, in-memory only
  const reviewRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [view, setView] = useState<View>('front');
  const [phase, setPhase] = useState<Phase>('live');
  const [camError, setCamError] = useState('');
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [attempts, setAttempts] = useState({ front: 0, side: 0 });
  const [pending, setPending] = useState<Accepted | null>(null);
  const [front, setFront] = useState<Accepted | null>(null);
  const [tilt, setTilt] = useState<number | null>(null);

  // Camera
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        setCamError((e as Error).message || 'Camera unavailable');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      wipeCanvas(workRef.current);
      wipeCanvas(reviewRef.current);
    };
  }, []);

  // Model (warm up while the researcher positions the participant)
  useEffect(() => {
    getPoseLandmarker().then(
      () => setModelState('ready'),
      (e) => {
        console.error(e);
        setModelState('error');
      },
    );
  }, []);

  // Phone tilt (beta ≈ 90° when the phone is upright). Works on Android without permission.
  useEffect(() => {
    const h = (e: DeviceOrientationEvent) => e.beta != null && setTilt(e.beta);
    window.addEventListener('deviceorientation', h);
    return () => window.removeEventListener('deviceorientation', h);
  }, []);

  async function enableTiltIOS() {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (DOE.requestPermission) await DOE.requestPermission().catch(() => undefined);
  }

  const drawReview = useCallback((src: HTMLCanvasElement, landmarks: LM[]) => {
    const c = reviewRef.current;
    if (!c) return;
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    ctx.lineWidth = Math.max(3, src.width / 200);
    ctx.strokeStyle = '#F2C230';
    for (const [a, b] of EDGES) {
      if (!landmarks[a] || !landmarks[b]) continue;
      ctx.beginPath();
      ctx.moveTo(landmarks[a].x * c.width, landmarks[a].y * c.height);
      ctx.lineTo(landmarks[b].x * c.width, landmarks[b].y * c.height);
      ctx.stroke();
    }
    for (const p of landmarks) {
      ctx.fillStyle = (p.visibility ?? 0) >= 0.6 ? '#8FD3AE' : '#E0775F';
      ctx.beginPath();
      ctx.arc(p.x * c.width, p.y * c.height, ctx.lineWidth * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  /** Shared path for camera frames and (dev/testing) image files. Pixels stay in memory. */
  async function processSource(draw: (ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) => void, w: number, h: number) {
    setPhase('processing');
    setMessage('');
    setAttempts((a) => ({ ...a, [view]: a[view] + 1 }));
    const c = (workRef.current ??= document.createElement('canvas'));
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: false })!;
    draw(ctx, c);
    try {
      const t0 = performance.now();
      const det = await detectPose(c);
      const img = { w, h };
      const vis = checkVisibility(det.landmarks, view);
      if (!vis.ok) {
        wipeCanvas(c);
        setMessage(`Retake needed. Not clearly visible: ${vis.failing.join(', ')}.`);
        setPhase('rejected');
        return;
      }
      // Measure immediately; the mask is then dropped (only numbers are kept).
      let frontResult: FrontResult | undefined;
      let sideResult: SideResult | undefined;
      if (view === 'front') frontResult = measureFront(det.landmarks, img, heightCm, det.mask);
      else sideResult = measureSide(det.landmarks, img, heightCm, front!.front!.levels, front!.front!.widthsCm, det.mask);
      const ms = performance.now() - t0;

      drawReview(c, det.landmarks);
      wipeCanvas(c);
      setPending({ landmarks: det.landmarks, img, ms, front: frontResult, side: sideResult });
      setPhase('review');
    } catch (e) {
      wipeCanvas(c);
      setMessage(`Could not process the photo: ${(e as Error).message}`);
      setPhase('rejected');
    }
  }

  function captureFromCamera() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    processSource((ctx) => ctx.drawImage(v, 0, 0), v.videoWidth, v.videoHeight);
  }

  async function captureFromFile(file: File) {
    const bmp = await createImageBitmap(file);
    await processSource((ctx) => ctx.drawImage(bmp, 0, 0), bmp.width, bmp.height);
    bmp.close();
  }

  function retake() {
    wipeCanvas(reviewRef.current);
    setPending(null);
    setPhase('live');
  }

  function accept() {
    if (!pending) return;
    wipeCanvas(reviewRef.current);
    if (view === 'front') {
      setFront(pending);
      setPending(null);
      setView('side');
      setPhase('live');
      return;
    }
    // Side accepted → compute final values.
    const f = front!;
    const fr = f.front!;
    const side = pending.side!;
    const comb = combine(fr, side);
    const sideMs = pending.ms;

    const retakesFront = Math.max(0, attempts.front - 1);
    const retakesSide = Math.max(0, attempts.side - 1);
    onDone({
      chest: round1(comb.chest),
      waist: round1(comb.waist),
      hip: round1(comb.hip),
      inseam: round1(comb.inseam),
      landmarks: { front: toStored(f.landmarks), side: toStored(pending.landmarks) },
      processingMsFront: Math.round(f.ms),
      processingMsSide: Math.round(sideMs),
      processingMs: Math.round(f.ms + sideMs),
      retakesFront,
      retakesSide,
      retakes: retakesFront + retakesSide,
      detail: {
        cmPerPxFront: +fr.cmPerPx.toFixed(5),
        cmPerPxSide: +side.cmPerPx.toFixed(5),
        widthsCm: { chest: round1(fr.widthsCm.chest), waist: round1(fr.widthsCm.waist), hip: round1(fr.widthsCm.hip) },
        depthsCm: { chest: round1(side.depthsCm.chest), waist: round1(side.depthsCm.waist), hip: round1(side.depthsCm.hip) },
        widthMethod: fr.method,
        depthMethod: side.method,
        imageFront: f.img,
        imageSide: pending.img,
      },
    });
  }

  const tiltOk = tilt != null && Math.abs(tilt - 90) <= 5;
  const canCapture = phase === 'live' && modelState === 'ready' && !camError;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{view === 'front' ? 'Front photo, 1 of 2' : 'Side photo, 2 of 2'}</h3>
        <span className="num text-sm text-ink-soft">Retakes {Math.max(0, attempts.front - 1) + Math.max(0, attempts.side - 1)}</span>
      </div>

      <div className="overflow-hidden rounded-xl bg-ink text-white">
        <div className="relative mx-auto aspect-[9/16] max-h-[70vh] overflow-hidden bg-ink">
          <video ref={videoRef} playsInline muted className={`h-full w-full object-contain ${phase === 'review' ? 'hidden' : ''}`} />
          <canvas ref={reviewRef} className={`h-full w-full object-contain ${phase === 'review' ? '' : 'hidden'}`} />
          {phase !== 'review' && <Silhouette view={view} />}
          {phase === 'processing' && <div className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-semibold">Finding body landmarks…</div>}
          <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs">
            {tilt == null ? (
              <button onClick={enableTiltIOS} className="underline">Tilt check</button>
            ) : (
              <span className={tiltOk ? 'text-[#8FD3AE]' : 'text-tape'}>Tilt {tilt.toFixed(0)}° {tiltOk ? '✓ upright' : '— hold upright'}</span>
            )}
          </div>
        </div>
      </div>

      <div className="sheet text-sm text-ink-soft">
        <p className="font-semibold text-ink">Set-up</p>
        <p>
          Phone upright at <b>1.0 m</b> height, participant <b>2.5 m</b> away, fitted clothing, feet hip-width apart, arms held slightly away from the body.
          {view === 'front' ? ' Participant faces the camera.' : ' Participant turns 90° to their left (right side to the camera), arms relaxed.'} Align head and feet with the yellow lines.
        </p>
      </div>

      {camError && <p className="note-err">Camera: {camError}. Use HTTPS and allow camera access.</p>}
      {modelState === 'loading' && <p className="text-sm text-ink-faint">Loading the pose model…</p>}
      {modelState === 'error' && <p className="note-err">Pose model failed to load. Check the connection and reload.</p>}
      {message && <p className="note-warn" role="alert">{message}</p>}

      {phase === 'review' ? (
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={retake}>Retake</button>
          <button className="btn-primary flex-[2]" onClick={accept}>Accept {view} photo</button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={phase === 'rejected' ? retake : onBack} disabled={phase === 'processing'}>
            {phase === 'rejected' ? 'Try again' : 'Back'}
          </button>
          <button className="btn-tape flex-[2]" disabled={!canCapture} onClick={captureFromCamera}>
            Capture {view}
          </button>
        </div>
      )}

      <details className="text-xs text-ink-faint">
        <summary>No camera? Analyse an image file (processed in memory, not uploaded)</summary>
        <input
          type="file"
          accept="image/*"
          className="mt-2"
          disabled={!canCapture}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) captureFromFile(f);
          }}
        />
      </details>
    </div>
  );
}
