import { SUS_ITEMS } from '../lib/sus';
import { ActionBar } from '../components/ActionBar';

const ANCHORS = ['Strongly disagree', '', 'Neutral', '', 'Strongly agree'];

export function Sus({ values, onChange, onSubmit, saving, error }: { values: (number | null)[]; onChange: (v: (number | null)[]) => void; onSubmit: () => void; saving: boolean; error: string }) {
  const answered = values.filter((v) => v != null).length;
  return (
    <div className="space-y-4">
      <section className="rounded-xl bg-ink p-5 text-white">
        <h3 className="text-xl font-bold">How was the app to use?</h3>
        <p className="mt-1 text-white/80">Tap one answer for each statement. There are no right or wrong answers.</p>
      </section>
      <ol className="space-y-3">
        {SUS_ITEMS.map((q, i) => (
          <li key={i} className="sheet">
            <fieldset>
              <legend className="mb-3 font-medium leading-snug">
                <span className="num mr-2 text-ink-faint">{i + 1}</span>
                {q}
              </legend>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={values[i] === n}
                    aria-label={`${n}${ANCHORS[n - 1] ? `, ${ANCHORS[n - 1]}` : ''}`}
                    onClick={() => onChange(values.map((v, j) => (j === i ? n : v)))}
                    className={`num h-12 rounded-lg border text-lg font-bold transition-colors ${values[i] === n ? 'border-tape bg-tape text-ink' : 'border-grid bg-paper text-ink-soft hover:border-ink-faint'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-ink-faint">
                <span>Strongly disagree</span>
                <span>Strongly agree</span>
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      {error && <p className="note-err" role="alert">{error}</p>}
      <ActionBar>
        <button className="btn-primary flex-1" disabled={answered < 10 || saving} onClick={onSubmit}>
          {saving ? 'Saving…' : answered < 10 ? `${answered} of 10 answered` : 'Finish'}
        </button>
      </ActionBar>
    </div>
  );
}
