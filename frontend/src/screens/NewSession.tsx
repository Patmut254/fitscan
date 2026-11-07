import type { Draft } from '../state/draft';
import type { ConsentForm, ConsentMethod } from '../types';
import { ActionBar } from '../components/ActionBar';

/** Initials: letters only, upper case, 1–4 characters (dots and spaces ignored). */
export const cleanInitials = (v: string) => v.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

export function consentReady(d: Draft, form: ConsentForm | null): boolean {
  if (d.consentMethod === 'paper') return d.consent;
  if (!form) return false;
  return form.statements.every((_, i) => d.consentAgreed[i]) && cleanInitials(d.consentInitials).length >= 1;
}

export function NewSession({
  draft,
  setDraft,
  form,
  formError,
  onNext,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  form: ConsentForm | null;
  formError: string;
  onNext: () => void;
}) {
  const started = new Date(draft.createdAt);
  const ready = consentReady(draft, form);
  const setMethod = (m: ConsentMethod) => setDraft({ ...draft, consentMethod: m, consent: false });
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  function next() {
    if (draft.consentMethod === 'electronic' && form) {
      setDraft({
        ...draft,
        consent: true,
        consentInitials: cleanInitials(draft.consentInitials),
        consentSignedAt: new Date().toISOString(),
        consentFormVersion: form.version,
      });
    }
    onNext();
  }

  return (
    <div>
      <section className="sheet">
        <p className="text-sm text-ink-soft">Participant</p>
        <p className="num mt-1 text-6xl font-bold leading-none">{draft.id}</p>
        <p className="mt-3 text-sm text-ink-soft">
          Started {started.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} at{' '}
          {started.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </p>
      </section>

      <fieldset className="mt-5">
        <legend className="label">How is consent given?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['electronic', 'On this phone', 'Participant ticks and types initials'],
              ['paper', 'Paper form', 'Signed and dated on paper'],
            ] as const
          ).map(([m, title, sub]) => (
            <button key={m} type="button" aria-pressed={draft.consentMethod === m} onClick={() => setMethod(m)} className={`seg h-auto px-3 py-3 text-left ${draft.consentMethod === m ? 'seg-on' : 'seg-off'}`}>
              <span className="block font-semibold">{title}</span>
              <span className={`block text-xs ${draft.consentMethod === m ? 'text-white/80' : 'text-ink-soft'}`}>{sub}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {draft.consentMethod === 'paper' ? (
        <>
          <p className="mt-5 text-ink-soft">
            Write <strong className="num text-ink">{draft.id}</strong> on the paper consent form. Never type the participant's name, email or phone number into this app.
          </p>
          <label className={`mt-4 flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors ${draft.consent ? 'border-transparent bg-sage-light' : 'border-grid bg-paper-raised'}`}>
            <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-[#2F6F4E]" checked={draft.consent} onChange={(e) => setDraft({ ...draft, consent: e.target.checked })} />
            <span>
              <span className="block font-semibold">Paper consent form signed and dated</span>
              <span className="text-sm text-ink-soft">Required before any measurement.</span>
            </span>
          </label>
        </>
      ) : formError ? (
        <p className="note-err mt-5">{formError}</p>
      ) : !form ? (
        <p className="mt-5 text-ink-faint">Loading the consent form…</p>
      ) : (
        <section className="sheet mt-5" aria-labelledby="consent-title">
          <p className="text-sm text-ink-soft">Please hand the phone to the participant.</p>
          <h2 id="consent-title" className="mt-2 text-xl font-bold">{form.title}</h2>
          {form.intro && <p className="mt-2 text-ink-soft">{form.intro}</p>}
          <ol className="mt-4 space-y-2">
            {form.statements.map((st, i) => {
              const on = !!draft.consentAgreed[i];
              return (
                <li key={i}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors ${on ? 'bg-sage-light' : 'bg-paper'}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-6 w-6 shrink-0 accent-[#2F6F4E]"
                      checked={on}
                      onChange={(e) => {
                        const agreed = [...draft.consentAgreed];
                        agreed[i] = e.target.checked;
                        setDraft({ ...draft, consentAgreed: agreed });
                      }}
                    />
                    <span className="leading-snug">{st}</span>
                  </label>
                </li>
              );
            })}
          </ol>
          <div className="mt-5">
            <label className="label" htmlFor="initials">Type your initials to sign</label>
            <input
              id="initials"
              className="input num w-40 text-center text-2xl font-bold tracking-[0.2em]"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={8}
              value={draft.consentInitials}
              onChange={(e) => setDraft({ ...draft, consentInitials: cleanInitials(e.target.value) })}
              placeholder="AB"
            />
            <p className="mt-2 text-sm text-ink-soft">Date: {today}. Consent form version {form.version}.</p>
          </div>
        </section>
      )}

      <ActionBar>
        <button className="btn-primary flex-1" disabled={!ready} onClick={next}>
          {ready ? (draft.consentMethod === 'electronic' ? 'Sign and continue' : 'Start session') : draft.consentMethod === 'electronic' ? 'Tick every statement and add initials' : 'Confirm the paper form first'}
        </button>
      </ActionBar>
    </div>
  );
}
