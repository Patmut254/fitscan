import { MEASURE_KEYS, type MeasureKey } from '../types';
import { meanOfClosestTwo, needsThirdReading, validateReadings } from '../lib/tape';
import { TAPE_PROTOCOL, TapeDiagram } from '../components/TapeDiagram';
import type { Draft, Readings } from '../state/draft';
import { ActionBar } from '../components/ActionBar';

export function tapeValid(d: Draft): boolean {
  return MEASURE_KEYS.every((k) => validateReadings(d.tape[k]) === null);
}

export function readingsToStore(r: Readings): number[] {
  const out = [r[0]!, r[1]!];
  if (needsThirdReading(r[0], r[1]) && r[2] != null) out.push(r[2]);
  return out;
}

function TapeCard({ k, readings, onChange }: { k: MeasureKey; readings: Readings; onChange: (r: Readings) => void }) {
  const third = needsThirdReading(readings[0], readings[1]);
  const err = validateReadings(readings);
  const set = (i: number, v: string) => {
    const next = [...readings] as Readings;
    next[i] = v === '' ? null : Number(v);
    if (i < 2 && !needsThirdReading(next[0], next[1])) next[2] = null;
    onChange(next);
  };
  const mean = err ? null : meanOfClosestTwo(readingsToStore(readings));

  return (
    <section className={`sheet ${err ? '' : 'border-sage'}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold">{TAPE_PROTOCOL[k].title}</h3>
        {mean != null && <span className="num text-2xl font-extrabold">{mean.toFixed(1)}<span className="ml-1 text-sm font-medium text-ink-faint">cm</span></span>}
      </div>
      <div className="mt-2 flex gap-3">
        <TapeDiagram which={k} />
        <p className="text-sm leading-relaxed text-ink-soft">{TAPE_PROTOCOL[k].text}</p>
      </div>
      <div className={`mt-3 grid gap-2 ${third ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {[0, 1, ...(third ? [2] : [])].map((i) => (
          <div key={i}>
            <label className="label" htmlFor={`${k}-${i}`}>Reading {i + 1} (cm)</label>
            <input
              id={`${k}-${i}`}
              className={`input num ${i === 2 ? 'border-tape-deep bg-tape-light' : ''}`}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={readings[i] ?? ''}
              onChange={(e) => set(i, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 text-sm">
        {third && readings[2] == null && <p className="note-warn">Readings 1 and 2 are more than 1.0 cm apart. Take a third reading.</p>}
        {mean != null && <p className="text-ink-faint">Saved value is the mean of the two closest readings.</p>}
      </div>
    </section>
  );
}

export function Tape({ draft, setDraft, onNext, onBack }: { draft: Draft; setDraft: (d: Draft) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-4">
      {MEASURE_KEYS.map((k) => (
        <TapeCard key={k} k={k} readings={draft.tape[k]} onChange={(r) => setDraft({ ...draft, tape: { ...draft.tape, [k]: r } })} />
      ))}
      <ActionBar>
        <button className="btn-ghost" onClick={onBack}>Back</button>
        <button className="btn-primary flex-1" disabled={!tapeValid(draft)} onClick={onNext}>
          {tapeValid(draft) ? 'Next: photo scan' : `${MEASURE_KEYS.filter((k) => validateReadings(draft.tape[k]) === null).length} of 4 measured`}
        </button>
      </ActionBar>
    </div>
  );
}
