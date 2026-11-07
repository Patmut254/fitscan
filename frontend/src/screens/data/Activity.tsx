import { useEffect, useState } from 'react';
import { downloadExport, listAudit } from '../../lib/api';
import type { AuditEntry } from '../../types';

const VERB: Record<AuditEntry['action'], string> = {
  create: 'saved',
  edit: 'corrected',
  calibration: 'activated a calibration model',
  export: 'downloaded',
  password: 'changed their password',
};

export function Activity() {
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    listAudit().then(setAudit, (e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Activity</h1>
          <p className="text-ink-soft">Every save, correction, export and calibration change. Entries can't be edited or deleted.</p>
        </div>
        <button className="btn-ghost btn-sm" disabled={!audit?.length} onClick={() => downloadExport('audit').catch((e) => setError(e.message))}>Download log CSV</button>
      </div>
      {error && <p className="note-err">{error}</p>}

      <ol className="panel divide-y divide-grid">
        {audit?.length === 0 && <li className="p-4 text-ink-faint">Nothing has happened yet.</li>}
        {audit?.map((a, i) => (
          <li key={i} className="grid grid-cols-[8.5rem_1fr] gap-3 px-4 py-3 text-sm max-sm:grid-cols-1 max-sm:gap-1">
            <time className="num text-ink-faint" dateTime={a.at}>{new Date(a.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
            <div>
              <p>
                <span className="font-semibold">{a.by}</span> {VERB[a.action]}
                {a.recordId && <span className="num font-bold"> {a.recordId}</span>}
                {a.action === 'export' && a.reason && <span> {a.reason}</span>}
                {a.action === 'calibration' && a.reason && <span className="text-ink-soft"> ({a.reason.replace('Activated ', '')})</span>}
              </p>
              {a.action === 'edit' && (
                <div className="mt-1 rounded-md bg-paper px-3 py-2 text-ink-soft">
                  {a.changes && Object.entries(a.changes).map(([k, c]) => (
                    <div key={k} className="num">{k}: {String(c.from)} → <span className="font-semibold text-ink">{String(c.to)}</span></div>
                  ))}
                  <div className="mt-1">Reason: {a.reason}</div>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
