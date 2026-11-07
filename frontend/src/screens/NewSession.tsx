import type { Draft } from '../state/draft';
import { ActionBar } from '../components/ActionBar';

export function NewSession({ draft, setDraft, onNext }: { draft: Draft; setDraft: (d: Draft) => void; onNext: () => void }) {
  const started = new Date(draft.createdAt);
  return (
    <div>
      <section className="sheet">
        <p className="text-sm text-ink-soft">Participant</p>
        <p className="num mt-1 text-6xl font-extrabold leading-none" style={{ fontStretch: '125%' }}>{draft.id}</p>
        <p className="mt-3 text-sm text-ink-soft">
          Started {started.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} at{' '}
          {started.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </p>
      </section>

      <p className="mt-5 text-ink-soft">
        Write <strong className="num text-ink">{draft.id}</strong> on the paper consent form. Never type the participant's name, email or phone number into this app.
      </p>

      <label className={`mt-5 flex cursor-pointer items-start gap-4 rounded-xl border-2 p-4 transition-colors ${draft.consent ? 'border-sage bg-sage-light' : 'border-grid bg-paper-raised'}`}>
        <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-[#2F6F4E]" checked={draft.consent} onChange={(e) => setDraft({ ...draft, consent: e.target.checked })} />
        <span>
          <span className="block font-semibold">Paper consent form signed and dated</span>
          <span className="text-sm text-ink-soft">Required before any measurement.</span>
        </span>
      </label>

      <ActionBar>
        <button className="btn-primary flex-1" disabled={!draft.consent} onClick={onNext}>Start session</button>
      </ActionBar>
    </div>
  );
}
