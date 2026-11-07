// Copies the MediaPipe WASM runtime into public/ so the app serves it itself (no CDN needed on site).
import { cpSync, mkdirSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dst = 'public/mediapipe/wasm';
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`Copied MediaPipe WASM → ${dst}`);
