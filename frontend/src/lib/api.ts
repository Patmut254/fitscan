/** Django REST API client. The auth token is kept in localStorage so a page reload keeps you signed in. */
import type { AuditEntry, FitRecord } from '../types';
import type { CalibrationFile } from './calibrate';

export const APP_VERSION = __APP_VERSION__;
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const KEY = 'fitscan.token';

export type Role = 'researcher' | 'viewer' | 'none';
export interface Me {
  username: string;
  name: string;
  role: Role;
  isSuperuser: boolean;
  mustChangePassword: boolean;
}

export interface TeamMember {
  username: string;
  name: string;
  role: Role;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLogin: string | null;
  dateJoined: string;
}
export const listTeam = () => req<TeamMember[]>('team');
export const addTeamMember = (m: { username: string; name: string; password: string; role: 'researcher' | 'viewer'; isAdmin: boolean }) => post<TeamMember>('team', m);
export const updateTeamMember = (username: string, changes: Partial<{ role: 'researcher' | 'viewer'; isAdmin: boolean; isActive: boolean; password: string; name: string }>) =>
  req<TeamMember>(`team/${encodeURIComponent(username)}`, { method: 'PATCH', body: JSON.stringify(changes) });

/** Readable temporary password, e.g. "Fit-7Kq4-mRw9". Easy to read out or write down. */
export function makeTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => chars[x % chars.length]).join('');
  return `Fit-${pick(4)}-${pick(4)}`;
}

let token: string | null = null;
try {
  token = localStorage.getItem(KEY);
} catch {
  token = null;
}
function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: token lives in memory only */
  }
}
export const hasToken = () => Boolean(token);

/** Free hosting sleeps when idle; ping as soon as the app opens so it is awake by sign-in. */
export function wakeServer() {
  fetch(`${BASE}/api/health`).catch(() => undefined);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (f: () => void) => (onUnauthorized = f);

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers as Record<string, string>) };
  if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Token ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/${path}`, { ...opts, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the FitScan server. Check the connection and try again.');
  }
  if (res.status === 401 && path !== 'auth/login') {
    setToken(null);
    onUnauthorized();
  }
  if (!res.ok) {
    let msg = `Something went wrong on the server (error ${res.status}). Try again; if it keeps happening, check the server window for details.`;
    let json = false;
    try {
      const j = await res.json();
      json = true;
      if (j?.detail) msg = j.detail;
    } catch {
      /* not JSON */
    }
    // During development, Vite answers 500/502/504 itself when Django isn't running.
    if (!json && [500, 502, 503, 504].includes(res.status) && import.meta.env.DEV)
      msg = "Can't reach the Django server. In the backend folder run: python manage.py runserver";
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (res.headers.get('content-type') ?? '').includes('json') ? res.json() : (res.text() as unknown as T);
}

const post = <T>(path: string, body?: unknown) => req<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export async function login(username: string, password: string): Promise<Me> {
  const r = await post<{ token: string; user: Me }>('auth/login', { username, password });
  setToken(r.token);
  return r.user;
}
export async function logout() {
  try {
    await post('auth/logout');
  } finally {
    setToken(null);
  }
}
export const me = () => req<Me>('auth/me');
export async function changePassword(oldPassword: string, newPassword: string) {
  const r = await post<{ token: string }>('auth/change-password', { oldPassword, newPassword });
  setToken(r.token);
}

export const reserveParticipantId = () => post<{ id: string; createdAt: string }>('participants/reserve');
export const listGaps = () => req<{ id: string; reservedAt: string }[]>('participants/gaps');
export const saveRecord = (r: FitRecord) => post<FitRecord>('records', r);
export const listRecords = () => req<FitRecord[]>('records');
export const getRecord = (id: string) => req<FitRecord>(`records/${encodeURIComponent(id)}`);
export const editRecord = (id: string, changes: Record<string, unknown>, reason: string) =>
  req<FitRecord>(`records/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ changes, reason, appVersion: APP_VERSION }) });
export const listAudit = () => req<AuditEntry[]>('audit');
export const getStats = () => req<Stats>('stats');
export const getCalibration = () => req<{ calibration: CalibrationFile | null; uploadedAt: string | null }>('calibration');
export const uploadCalibration = (c: unknown) => post<{ calibration: CalibrationFile }>('calibration', c);

/** Downloads a CSV through the authenticated API. */
export async function downloadExport(kind: 'records' | 'landmarks' | 'audit') {
  const res = await fetch(`${BASE}/api/export?kind=${kind}`, { headers: token ? { Authorization: `Token ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, `Export failed (${res.status})`);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `fitscan-${kind}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface MeasureStats {
  n: number;
  rawBias: number | null;
  rawMae: number | null;
  rawLoaLow: number | null;
  rawLoaHigh: number | null;
  calN: number;
  calMae: number | null;
  pairs: { id: string; tape: number; scan: number; cal: number | null }[];
}
export interface Stats {
  n: number;
  bySex: Record<string, number>;
  byAge: Record<string, number>;
  measures: Record<'chest' | 'waist' | 'hip' | 'inseam', MeasureStats>;
  sizeAgreement: Record<'scanRawVsTape' | 'scanCalVsTape' | 'selfVsTape', { n: number; pct: number | null }>;
  sus: { n: number; mean: number | null; sd: number | null; scores: number[] };
  processingMsMean: number | null;
  retakesMean: number | null;
  phones: string[];
}
