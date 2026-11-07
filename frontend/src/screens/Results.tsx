import type { FitRecord, MeasureKey } from '../types';
import { MEASURE_KEYS } from '../types';
import { ActionBar } from '../components/ActionBar';

const LABEL: Record<MeasureKey, string> = { chest: 'Chest / bust', waist: 'Waist', hip: 'Hip', inseam: 'Inseam' };
const f1 = (v?: number | null) => (v == null ? '–' : v.toFixed(1));

export function Results({ record, calibrationNote, onNext, onRescan }: { record: FitRecord; calibrationNote: string; onNext: () => void; onRescan: () => void }) {
  const s = record.scan!;
  const sizes: { label: string; size?: string; margin?: number }[] = [
    { label: 'Tape', size: record.sizes.tape?.size, margin: record.sizes.tape?.boundaryDistanceCm },
    { label: 'Scan', size: record.sizes.scanRaw?.size, margin: record.sizes.scanRaw?.boundaryDistanceCm },
    { label: 'Calibrated', size: record.sizes.scanCal?.size, margin: record.sizes.scanCal?.boundaryDistanceCm },
    { label: 'They buy', size: record.sizes.self === 'unknown' ? '?' : record.sizes.self },
  ];
  const match = record.sizes.tape?.size && record.sizes.tape.size === record.sizes.scanRaw?.size;

  return (
    <div className="space-y-5">
      <section className="sheet">
        <p className="text-sm text-ink-soft">Recommended {record.chart} size</p>
        <div className="mt-3 grid grid-cols-4 divide-x divide-grid text-center">
          {sizes.map((c) => (
            <div key={c.label} className="px-1">
              <div className="num text-3xl font-extrabold" style={{ fontStretch: '115%' }}>{c.size ?? '–'}</div>
              <div className="mt-1 text-xs text-ink-soft">{c.label}</div>
              {c.margin != null && c.margin < 1 && <div className="mt-0.5 text-[11px] text-tape-deep">near boundary</div>}
            </div>
          ))}
        </div>
        <p className={`mt-4 ${match ? 'note-ok' : 'note-warn'}`}>{match ? 'Scan and tape agree on size.' : 'Scan and tape suggest different sizes.'}</p>
      </section>

      <section className="panel overflow-hidden">
        <table className="num w-full text-sm">
          <thead className="border-b border-grid text-left text-ink-soft">
            <tr>
              <th className="px-4 py-2.5 font-medium">cm</th>
              <th className="px-2 py-2.5 text-right font-medium">Tape</th>
              <th className="px-2 py-2.5 text-right font-medium">Scan</th>
              <th className="px-2 py-2.5 text-right font-medium">Cal.</th>
              <th className="px-4 py-2.5 text-right font-medium">Scan − tape</th>
            </tr>
          </thead>
          <tbody>
            {MEASURE_KEYS.map((k) => {
              const d = s[k] - record.tapeMean[k];
              return (
                <tr key={k} className="border-t border-grid first:border-t-0">
                  <td className="px-4 py-3 font-medium">{LABEL[k]}</td>
                  <td className="px-2 py-3 text-right">{f1(record.tapeMean[k])}</td>
                  <td className="px-2 py-3 text-right">{f1(s[k])}</td>
                  <td className="px-2 py-3 text-right">{f1(record.calibrated?.[k])}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${Math.abs(d) > 3 ? 'text-chalk' : ''}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-ink-faint">
        {calibrationNote}. Processed in {s.processingMs} ms with {s.retakes} {s.retakes === 1 ? 'retake' : 'retakes'}.
      </p>

      <ActionBar>
        <button className="btn-ghost" onClick={onRescan}>Rescan</button>
        <button className="btn-tape flex-1" onClick={onNext}>Hand phone to participant</button>
      </ActionBar>
    </div>
  );
}
