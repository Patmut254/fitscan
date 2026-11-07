import { useEffect, useState } from 'react';
import { getConsentForm, saveConsentForm } from '../../lib/api';
import type { ConsentForm } from '../../types';

export function ConsentEditor() {
  const [current, setCurrent] = useState<ConsentForm | null>(null);
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [statements, setStatements] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load(f: ConsentForm | null) {
    setCurrent(f);
    setTitle(f?.title ?? '');
    setIntro(f?.intro ?? '');
    setStatements(f?.statements.length ? f.statements : ['']);
  }
  useEffect(() => {
    getConsentForm().then(load, (e) => setMsg({ ok: false, text: e.message }));
  }, []);

  const changed = !current || title !== current.title || intro !== current.intro || JSON.stringify(statements.filter((s) => s.trim())) !== JSON.stringify(current.statements);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const f = await saveConsentForm({ title, intro, statements });
      load(f);
      setMsg({ ok: true, text: `Saved as version ${f.version}. New participants will see this wording; earlier signatures keep the version they agreed to.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Consent form</h1>
        <p className="mt-1 text-ink-soft">
          The wording participants agree to when they sign on the phone. Use the exact wording your ethics committee approved.
          {current && ` Current version: ${current.version}.`}
        </p>
      </div>

      <section className="sheet space-y-4">
        <div>
          <label className="label" htmlFor="c-title">Title</label>
          <input id="c-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="c-intro">Introduction (optional)</label>
          <textarea id="c-intro" className="input" rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} />
        </div>
        <fieldset>
          <legend className="label">Statements (the participant ticks each one)</legend>
          <ol className="space-y-2">
            {statements.map((st, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="num mt-3 w-5 shrink-0 text-right text-sm text-ink-faint">{i + 1}</span>
                <textarea
                  className="input"
                  rows={2}
                  aria-label={`Statement ${i + 1}`}
                  value={st}
                  onChange={(e) => setStatements(statements.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button type="button" className="btn-ghost btn-sm mt-1 shrink-0" disabled={statements.length === 1} onClick={() => setStatements(statements.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => setStatements([...statements, ''])}>Add a statement</button>
        </fieldset>
        {msg && <p className={msg.ok ? 'note-ok' : 'note-err'}>{msg.text}</p>}
        <button className="btn-primary" disabled={busy || !changed || !title.trim() || !statements.some((s) => s.trim())} onClick={save}>
          {busy ? 'Saving…' : changed ? 'Save as new version' : 'No changes'}
        </button>
      </section>
    </div>
  );
}
