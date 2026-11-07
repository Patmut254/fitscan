import { useEffect, useState } from 'react';
import { getStats, type Stats } from '../../lib/api';
import { MEASURE_KEYS, type MeasureKey } from '../../types';

const LABEL: Record<MeasureKey, string> = { chest: 'Chest / bust', waist: 'Waist', hip: 'Hip', inseam: 'Inseam' };
const fmt = (v: number | null | undefined, d = 1) => (v == null ? '–' : v.toFixed(d));
const signed = (v: number | null | undefined) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`);

/**
 * "Error ruler": scan minus tape for every participant on a cm scale.
 * Yellow band = 95% limits of agreement, dark mark = mean bias, dots = participants.
 */
function ErrorRuler({ m, s }: { m: MeasureKey; s: Stats['measures'][MeasureKey] }) {
  const diffs = s.pairs.map((p) => p.scan - p.tape);
  const span = Math.max(10, Math.ceil(Math.max(...diffs.map(Math.abs), Math.abs(s.rawLoaLow ?? 0), Math.abs(s.rawLoaHigh ?? 0)) / 5) * 5);
  const W = 600, PAD = 18;
  const x = (v: number) => PAD + ((v + span) / (2 * span)) * (W - 2 * PAD);
  const ticks = Array.from({ length: span * 2 + 1 }, (_, i) => i - span);
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-4 border-t border-grid py-4 first:border-t-0 max-sm:grid-cols-1 max-sm:gap-2">
      <div>
        <div className="font-semibold">{LABEL[m]}</div>
        <div className="num text-sm text-ink-soft">
          bias {signed(s.rawBias)} cm
          <br />
          avg error {fmt(s.rawMae)} cm
        </div>
      </div>
      <svg viewBox={`0 0 ${W} 58`} className="w-full" role="img" aria-label={`${LABEL[m]}: mean bias ${signed(s.rawBias)} cm, limits ${fmt(s.rawLoaLow)} to ${fmt(s.rawLoaHigh)} cm, ${s.n} participants`}>
        <rect x={PAD} y={8} width={W - 2 * PAD} height={26} fill="#FFFFFF" stroke="#D8DFE7" />
        {s.rawLoaLow != null && s.rawLoaHigh != null && <rect x={x(s.rawLoaLow)} y={8} width={x(s.rawLoaHigh) - x(s.rawLoaLow)} height={26} fill="#F2C230" opacity={0.75} />}
        {ticks.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={8} y2={t % 5 === 0 ? 18 : 13} stroke="#1B2A41" strokeOpacity={t === 0 ? 1 : t % 5 === 0 ? 0.6 : 0.25} strokeWidth={t === 0 ? 2 : 1} />
        ))}
        {diffs.map((d, i) => (
          <circle key={i} cx={x(d)} cy={27} r={3.6} fill="#1B2A41" fillOpacity={0.55}>
            <title>{`${s.pairs[i].id}: ${signed(d)} cm`}</title>
          </circle>
        ))}
        {s.rawBias != null && <line x1={x(s.rawBias)} x2={x(s.rawBias)} y1={4} y2={38} stroke="#B8432F" strokeWidth={3} />}
        {ticks.filter((t) => t % 5 === 0).map((t) => (
          <text key={t} x={x(t)} y={52} textAnchor="middle" fontSize={12} fill="#46556B" className="num">
            {t > 0 ? `+${t}` : t}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Scatter({ s, m }: { s: Stats['measures'][MeasureKey]; m: MeasureKey }) {
  const vals = s.pairs.flatMap((p) => [p.tape, p.scan, ...(p.cal != null ? [p.cal] : [])]);
  if (!vals.length) return null;
  const lo = Math.floor(Math.min(...vals) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...vals) / 5) * 5 + 5;
  const P = 36, S = 320;
  const sc = (v: number) => P + ((v - lo) / (hi - lo)) * (S - P - 8);
  const sy = (v: number) => S - sc(v) + P - 8;
  const grid: number[] = [];
  for (let v = lo; v <= hi; v += 10) grid.push(v);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-sm" role="img" aria-label={`${LABEL[m]}: scan against tape for ${s.n} participants`}>
      {grid.map((v) => (
        <g key={v}>
          <line x1={sc(v)} x2={sc(v)} y1={sy(lo)} y2={sy(hi)} stroke="#D8DFE7" />
          <line x1={sc(lo)} x2={sc(hi)} y1={sy(v)} y2={sy(v)} stroke="#D8DFE7" />
          <text x={sc(v)} y={S - 8} fontSize={11} textAnchor="middle" fill="#8693A5" className="num">{v}</text>
          {v !== grid[0] && <text x={P - 6} y={sy(v) + 4} fontSize={11} textAnchor="end" fill="#8693A5" className="num">{v}</text>}
        </g>
      ))}
      <line x1={sc(lo)} y1={sy(lo)} x2={sc(hi)} y2={sy(hi)} stroke="#1B2A41" strokeDasharray="4 4" strokeOpacity={0.5} />
      {s.pairs.map((p) => (
        <g key={p.id}>
          <circle cx={sc(p.tape)} cy={sy(p.scan)} r={5} fill="#1B2A41" fillOpacity={0.7}><title>{`${p.id}: tape ${p.tape.toFixed(1)}, scan ${p.scan.toFixed(1)}`}</title></circle>
          {p.cal != null && <rect x={sc(p.tape) - 4} y={sy(p.cal) - 4} width={8} height={8} fill="#C99A0E"><title>{`${p.id}: calibrated ${p.cal.toFixed(1)}`}</title></rect>}
        </g>
      ))}
    </svg>
  );
}

function Agreement({ label, a }: { label: string; a: { n: number; pct: number | null } }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-40 shrink-0 text-sm">{label}</span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-ink" style={{ width: `${a.pct ?? 0}%` }} />
      </div>
      <span className="num w-20 text-right text-sm font-semibold">{a.pct == null ? '–' : `${a.pct.toFixed(0)}%`}<span className="ml-1 font-normal text-ink-faint">n={a.n}</span></span>
    </div>
  );
}

export function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [m, setM] = useState<MeasureKey>('waist');

  useEffect(() => {
    getStats().then(setStats, (e) => setError(e.message));
  }, []);

  if (error) return <p className="note-err">{error}</p>;
  if (!stats) return <p className="text-ink-faint">Loading…</p>;
  if (stats.n === 0)
    return (
      <div className="sheet">
        <h1 className="text-2xl font-bold">No participants yet</h1>
        <p className="mt-2 text-ink-soft">Results appear here after the first session is saved. Start one from Collect.</p>
      </div>
    );

  const fem = stats.bySex.female ?? 0, male = stats.bySex.male ?? 0, pnts = stats.bySex.prefer_not_to_say ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{stats.n} participants measured</h1>
        <p className="mt-1 text-ink-soft">
          {fem} female, {male} male{pnts ? `, ${pnts} prefer not to say` : ''}. Scans took {fmt((stats.processingMsMean ?? 0) / 1000, 2)} s on average, with {fmt(stats.retakesMean, 1)} retakes.
        </p>
      </header>

      <section className="sheet">
        <h2 className="text-xl font-bold">How far is the raw scan from the tape?</h2>
        <p className="mt-1 text-sm text-ink-soft">Each dot is one participant (scan minus tape, cm). The yellow band holds 95% of differences; the red mark is the average.</p>
        <div className="mt-3">
          {MEASURE_KEYS.map((k) => <ErrorRuler key={k} m={k} s={stats.measures[k]} />)}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="sheet">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Scan against tape</h2>
            <select className="input w-auto py-2 text-sm" value={m} onChange={(e) => setM(e.target.value as MeasureKey)} aria-label="Measurement">
              {MEASURE_KEYS.map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}
            </select>
          </div>
          <p className="mt-1 text-sm text-ink-soft">Points on the dashed line are perfect agreement. Tape on the horizontal axis.</p>
          <div className="mt-3 flex justify-center"><Scatter s={stats.measures[m]} m={m} /></div>
          <p className="mt-2 text-xs text-ink-faint">Circles: raw scan. Yellow squares: calibrated ({stats.measures[m].calN} so far{stats.measures[m].calMae != null ? `, avg error ${fmt(stats.measures[m].calMae)} cm` : ''}).</p>
        </section>

        <div className="space-y-6">
          <section className="sheet">
            <h2 className="text-xl font-bold">Same size as the tape?</h2>
            <div className="mt-3">
              <Agreement label="Raw scan" a={stats.sizeAgreement.scanRawVsTape} />
              <Agreement label="Calibrated scan" a={stats.sizeAgreement.scanCalVsTape} />
              <Agreement label="Size they buy" a={stats.sizeAgreement.selfVsTape} />
            </div>
          </section>
          <section className="sheet">
            <h2 className="text-xl font-bold">Usability (SUS)</h2>
            <p className="num mt-2 text-4xl font-bold">{fmt(stats.sus.mean)}<span className="ml-2 text-base font-medium text-ink-soft">mean of {stats.sus.n}, SD {fmt(stats.sus.sd)}</span></p>
            <svg viewBox="0 0 400 34" className="mt-3 w-full" role="img" aria-label="SUS scores on a 0 to 100 scale; 68 is the usual average">
              <rect x={0} y={10} width={400} height={8} rx={4} fill="#F4F6F8" />
              <line x1={272} x2={272} y1={4} y2={24} stroke="#8693A5" strokeDasharray="2 2" />
              <text x={272} y={33} fontSize={10} textAnchor="middle" fill="#8693A5">68 avg</text>
              {stats.sus.scores.map((v, i) => <circle key={i} cx={v * 4} cy={14} r={4} fill="#1B2A41" fillOpacity={0.5} />)}
            </svg>
          </section>
        </div>
      </div>
    </div>
  );
}
