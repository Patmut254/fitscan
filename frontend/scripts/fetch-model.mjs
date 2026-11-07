// Optional: download the pose model so it is served from your own hosting (works offline after first load).
// Then set VITE_MP_MODEL_URL=/models/pose_landmarker_heavy.task in .env.local
import { writeFileSync, mkdirSync } from 'node:fs';
const url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task';
mkdirSync('public/models', { recursive: true });
const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
writeFileSync('public/models/pose_landmarker_heavy.task', Buffer.from(await res.arrayBuffer()));
console.log('Saved public/models/pose_landmarker_heavy.task');
