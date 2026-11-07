import { useEffect, useMemo, useState } from 'react';
import { downloadExport, editRecord, getRecord, listRecords } from '../../lib/api';
import { AGE_BANDS, MEASURE_KEYS, type FitRecord } from '../../types';
import { SUS_ITEMS } from '../../lib/sus';

type EditableKey = 'sex' | 'ageBand' | 'heightCm' | 'weightKg' | 'selfSize' | 'phoneModel';
const EDITABLE: { key: EditableKey; label: string; type: 'text' | 'number' | 'select'; options?: string[] }[] = [
  { key: 'sex', label: 'Sex', type: 'select', options: ['female', 'male', 'prefer_not_to_say'] },
  { key: 'ageBand', label: 'Age band', type: 'select', options: AGE_BANDS },
  { key: 'heightCm', label: 'Height (cm)', type: 'number' },
  { key: 'weightKg', label: 'Weight (kg)', type: 'number' },
  { key: 'selfSize', label: 'Size they buy', type: 'text' },
  { key: 'phoneModel', label: 'Phone model', type: 'text' },
];
const SEX_SHORT: Record<string, string> = { female: 'F', male: 'M', prefer_not_to_say: '–' };
const f1 = (v?: number | null) => (v == null ? '–' : v.toFixed(1));

function EditForm({ rec, onDone }: { rec: FitRecord; onDone: (r: FitRecord | null) => void }) {
  const [vals, setVals] = useState<Record<EditableKey, string>>(Object.fromEntries(EDITABLE.map((f) => [f.key, String(rec[f.key] ?? '')])) as Record<EditableKey, string>);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const changes: Record<string, unknown> = {};
  for (const f of EDITABLE) {
    const v = f.type === 'number' ? Number(vals[f.key]) : vals[f.key];
    if (v !== rec[f.key]) changes[f.key] = v;
  }
  const n = Object.keys(changes).length;

  async function save() {
    setBusy(true);
    setErr('');
    try {
      onDone(await editRecord(rec.id, changes, reason));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-xl border-2 border-tape bg-tape-light/40 p-4">
      <h3 className="font-bold">Correct {rec.id}</h3>
      <p className="text-xs text-ink-soft">Scan values, sizes and calibration are not recalculated. Every change is logged with your reason.</p>
      <div className="grid grid-cols-2 gap-3">
        {EDITABLE.map((f) => (
          <div key={f.key}>
            <label className="label text-xs" htmlFor={`e-${f.key}`}>{f.label}</label>
            {f.type === 'select' ? (
              <select id={`e-${f.key}`} className="input py-2" value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>
                {f.options!.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input id={`e-${f.key}`} className="input py-2" type={f.type} value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
      <div>
        <label className="label text-xs" htmlFor="reason">Reason for the change</label>
        <textarea id="reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: height typed as 156, tape sheet says 165" />
      </div>
      {err && <p className="note-err">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost btn-sm" onClick={() => onDone(null)}>Cancel</button>
        <button className="btn-primary btn-sm flex-1" disabled={busy || !reason.trim() || n === 0} onClick={save}>
          {n === 0 ? 'No changes yet' : `Save ${n} ${n === 1 ? 'change' : 'changes'}`}
        </button>
      </div>
    </div>
  );
}

function Detail({ id, canEdit, onClose, onChanged }: { id: string; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [rec, setRec] = useState<FitRecord | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setRec(null);
    setEditing(false);
    getRecord(id).then(setRec);
  }, [id]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <aside className="fixed inset-0 z-40 flex justify-end bg-ink/30" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Record ${id}`}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-grid bg-paper p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="num text-3xl font-extrabold" style={{ fontStretch: '120%' }}>{id}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        {!rec ? (
          <p className="text-ink-faint">Loading…</p>
        ) : (
          <div className="space-y-5">
            <dl className="sheet grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {[
                ['Session', new Date(rec.createdAt).toLocaleString()],
                ['Collected by', rec.collectedBy],
                ['App version', rec.appVersion],
                ['Sex', rec.sex.replace(/_/g, ' ')],
                ['Age band', rec.ageBand],
                ['Height', `${rec.heightCm} cm`],
                ['Weight', `${rec.weightKg} kg`],
                ['Chart', rec.chart],
                ['Phone', rec.phoneModel],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-ink-faint">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {rec.lastEditedAt && <p className="note-warn">Edited after saving on {new Date(rec.lastEditedAt).toLocaleString()}. See Activity for details.</p>}

            <section className="panel overflow-hidden">
              <table className="num w-full text-sm">
                <thead className="border-b border-grid text-left text-ink-soft">
                  <tr><th className="px-3 py-2 font-medium">cm</th><th className="px-2 py-2 font-medium">Tape readings</th><th className="px-2 py-2 text-right font-medium">Tape</th><th className="px-2 py-2 text-right font-medium">Scan</th><th className="px-3 py-2 text-right font-medium">Cal.</th></tr>
                </thead>
                <tbody>
                  {MEASURE_KEYS.map((k) => (
                    <tr key={k} className="border-t border-grid first:border-t-0">
                      <td className="px-3 py-2 font-medium capitalize">{k}</td>
                      <td className="px-2 py-2 text-ink-soft">{rec.tape[k].join(', ')}</td>
                      <td className="px-2 py-2 text-right font-semibold">{f1(rec.tapeMean[k])}</td>
                      <td className="px-2 py-2 text-right">{f1(rec.scan?.[k])}</td>
                      <td className="px-3 py-2 text-right">{f1(rec.calibrated?.[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="sheet grid grid-cols-4 text-center">
              {[['They buy', rec.sizes.self], ['Tape', rec.sizes.tape?.size], ['Scan', rec.sizes.scanRaw?.size], ['Calibrated', rec.sizes.scanCal?.size]].map(([k, v]) => (
                <div key={k}><div className="num text-2xl font-extrabold">{v ?? '–'}</div><div className="text-xs text-ink-soft">{k}</div></div>
              ))}
            </section>

            {rec.scan && (
              <p className="text-sm text-ink-soft">
                Scan: {rec.scan.processingMs} ms, {rec.scan.retakes} retakes, width from {rec.scan.detail?.widthMethod}, depth from {rec.scan.detail?.depthMethod}, {rec.scan.landmarks?.front?.length ?? 0} + {rec.scan.landmarks?.side?.length ?? 0} landmarks stored.
              </p>
            )}

            {rec.sus && (
              <section className="sheet">
                <h3 className="font-bold">Usability score {rec.sus.score.toFixed(1)}</h3>
                <ol className="mt-2 space-y-1 text-sm">
                  {SUS_ITEMS.map((q, i) => (
                    <li key={i} className="flex gap-3"><span className="num w-4 shrink-0 text-right font-bold">{rec.sus!.items[i]}</span><span className="text-ink-soft">{q}</span></li>
                  ))}
                </ol>
              </section>
            )}

            {canEdit && !editing && <button className="btn-ghost w-full" onClick={() => setEditing(true)}>Correct participant details</button>}
            {editing && <EditForm rec={rec} onDone={(r) => { setEditing(false); if (r) { setRec(r); onChanged(); } }} />}
          </div>
        )}
      </div>
    </aside>
  );
}

export function Records({ canEdit }: { canEdit: boolean }) {
  const [records, setRecords] = useState<FitRecord[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState('');

  const load = () => listRecords().then(setRecords, (e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => (records ?? []).filter((r) => !q || r.id.toLowerCase().includes(q.toLowerCase()) || r.phoneModel.toLowerCase().includes(q.toLowerCase())), [records, q]);

  async function exp(kind: 'records' | 'landmarks') {
    setExporting(kind);
    try {
      await downloadExport(kind);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting('');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ fontStretch: '118%' }}>Records</h1>
          <p className="text-ink-soft">{records ? `${records.length} saved. Select a row for the full record.` : 'Loading…'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary btn-sm" disabled={!records?.length || !!exporting} onClick={() => exp('records')}>{exporting === 'records' ? 'Preparing…' : 'Download CSV'}</button>
          <button className="btn-ghost btn-sm" disabled={!records?.length || !!exporting} onClick={() => exp('landmarks')}>{exporting === 'landmarks' ? 'Preparing…' : 'Landmarks CSV'}</button>
        </div>
      </div>
      <input className="input max-w-xs" placeholder="Find an ID, e.g. P012" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search records" />
      {error && <p className="note-err">{error}</p>}

      <div className="panel overflow-x-auto">
        <table className="num w-full whitespace-nowrap text-sm">
          <thead className="border-b border-grid text-left text-ink-soft">
            <tr>
              {['ID', 'Date', 'Sex', 'Age', 'Height', 'Waist tape', 'Waist scan', 'They buy', 'Tape size', 'Scan size', 'SUS'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records && shown.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center text-ink-faint">{records.length ? 'No records match that search.' : 'No records yet. They appear here as soon as a session is saved.'}</td></tr>}
            {shown.map((r) => {
              const agree = r.sizes.tape?.size && r.sizes.tape.size === r.sizes.scanRaw?.size;
              return (
                <tr key={r.id} tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)} className="cursor-pointer border-t border-grid hover:bg-tape-light/50 focus:bg-tape-light/50">
                  <td className="px-3 py-2.5 font-bold">{r.id}{r.lastEditedAt && <span className="ml-1 text-tape-deep" title="Edited after saving">*</span>}</td>
                  <td className="px-3 py-2.5">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5">{SEX_SHORT[r.sex]}</td>
                  <td className="px-3 py-2.5">{r.ageBand}</td>
                  <td className="px-3 py-2.5">{r.heightCm}</td>
                  <td className="px-3 py-2.5">{f1(r.tapeMean.waist)}</td>
                  <td className="px-3 py-2.5">{f1(r.scan?.waist)}</td>
                  <td className="px-3 py-2.5">{r.sizes.self}</td>
                  <td className="px-3 py-2.5 font-semibold">{r.sizes.tape?.size ?? '–'}</td>
                  <td className={`px-3 py-2.5 font-semibold ${agree ? 'text-sage' : 'text-chalk'}`}>{r.sizes.scanRaw?.size ?? '–'}</td>
                  <td className="px-3 py-2.5">{r.sus?.score ?? '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-faint">Scan size in green matches the tape size; red means it differs. * marks records corrected after saving.</p>
      {open && <Detail id={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
