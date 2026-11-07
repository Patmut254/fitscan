import { AGE_BANDS, type ChartKey, type Sex } from '../types';
import { SIZE_CHARTS, chartForSex } from '../lib/size';
import type { Draft } from '../state/draft';
import { ActionBar } from '../components/ActionBar';

const SEXES: { v: Sex; l: string }[] = [
  { v: 'female', l: 'Female' },
  { v: 'male', l: 'Male' },
  { v: 'prefer_not_to_say', l: 'Prefer not to say' },
];

export function participantValid(d: Draft): string | null {
  if (!d.sex) return 'Choose sex';
  if (!d.ageBand) return 'Choose an age band';
  if (d.heightCm == null || d.heightCm < 120 || d.heightCm > 230) return 'Height must be 120–230 cm';
  if (d.weightKg == null || d.weightKg < 30 || d.weightKg > 250) return 'Weight must be 30–250 kg';
  if (!d.selfSize) return 'Choose the size the participant usually buys';
  if (!d.phoneModel.trim()) return 'Enter the phone model';
  return null;
}

function Segments<T extends string>({ options, value, onChange, cols }: { options: { v: T; l: string }[]; value: string; onChange: (v: T) => void; cols: string }) {
  return (
    <div className={`grid gap-2 ${cols}`}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)} className={`seg ${value === o.v ? 'seg-on' : 'seg-off'}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Participant({ draft, setDraft, onNext, onBack }: { draft: Draft; setDraft: (d: Draft) => void; onNext: () => void; onBack: () => void }) {
  const err = participantValid(draft);
  const num = (v: string) => (v === '' ? null : Number(v));
  const sizes = SIZE_CHARTS[draft.chart].sizes.map((s) => ({ v: s.size, l: s.size }));

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="label">Sex</legend>
        <Segments
          cols="grid-cols-3"
          options={SEXES}
          value={draft.sex}
          onChange={(v) => {
            const chart = v === 'prefer_not_to_say' ? draft.chart : chartForSex(v);
            setDraft({ ...draft, sex: v, chart, selfSize: chart === draft.chart ? draft.selfSize : '' });
          }}
        />
      </fieldset>

      <fieldset>
        <legend className="label">Age band</legend>
        <Segments cols="grid-cols-5" options={AGE_BANDS.map((a) => ({ v: a, l: a }))} value={draft.ageBand} onChange={(v) => setDraft({ ...draft, ageBand: v })} />
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="h">Height, measured</label>
          <div className="relative">
            <input id="h" className="input num pr-12" type="number" inputMode="decimal" step="0.1" value={draft.heightCm ?? ''} onChange={(e) => setDraft({ ...draft, heightCm: num(e.target.value) })} />
            <span className="pointer-events-none absolute right-3 top-3 text-ink-faint">cm</span>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="w">Weight, measured</label>
          <div className="relative">
            <input id="w" className="input num pr-12" type="number" inputMode="decimal" step="0.1" value={draft.weightKg ?? ''} onChange={(e) => setDraft({ ...draft, weightKg: num(e.target.value) })} />
            <span className="pointer-events-none absolute right-3 top-3 text-ink-faint">kg</span>
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="label">Size chart</legend>
        <Segments
          cols="grid-cols-2"
          options={[{ v: 'womenswear' as ChartKey, l: 'Womenswear' }, { v: 'menswear' as ChartKey, l: 'Menswear' }]}
          value={draft.chart}
          onChange={(v) => setDraft({ ...draft, chart: v, selfSize: v === draft.chart ? draft.selfSize : '' })}
        />
      </fieldset>

      <fieldset>
        <legend className="label">Size they usually buy (UK)</legend>
        <Segments cols="grid-cols-4" options={[...sizes, { v: 'unknown', l: "Don't know" }]} value={draft.selfSize} onChange={(v) => setDraft({ ...draft, selfSize: v })} />
      </fieldset>

      <div>
        <label className="label" htmlFor="phone">Phone model</label>
        <input id="phone" className="input" value={draft.phoneModel} onChange={(e) => setDraft({ ...draft, phoneModel: e.target.value })} />
        <p className="mt-1.5 text-xs text-ink-faint">Filled in from this phone. Correct it if it's wrong.</p>
      </div>

      <ActionBar>
        <button className="btn-ghost" onClick={onBack}>Back</button>
        <button className="btn-primary flex-1" disabled={!!err} onClick={onNext}>{err ?? 'Next: tape measurements'}</button>
      </ActionBar>
    </div>
  );
}
