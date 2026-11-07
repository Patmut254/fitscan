import { useState } from 'react';
import { uploadCalibration } from '../../lib/api';
import type { CalibrationFile } from '../../lib/calibrate';

export function Calibration({ calibration, canEdit, onChanged }: { calibration: CalibrationFile | null; canEdit: boolean; onChanged: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(file: File) {
    setMsg(null);
    try {
      const r = await uploadCalibration(JSON.parse(await file.text()));
      setMsg({ ok: true, text: `Calibration ${r.calibration.version} is now active for new sessions.` });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof SyntaxError ? 'That file is not valid JSON.' : (e as Error).message });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Calibration</h1>
        <p className="mt-1 text-ink-soft">
          A calibration model corrects the raw scan using tape data you have already collected: tape = b0 + b1·scan + b2·sex + b3·height, one model per measurement.
        </p>
      </div>
      <section className="sheet">
        {calibration ? (
          <>
            <h2 className="text-xl font-bold">Active: {calibration.version}</h2>
            <p className="mt-1 text-sm text-ink-soft">Trained on {calibration.trainedOnIds.length} participants. It is never applied to those participants.</p>
            <table className="num mt-4 w-full text-sm">
              <thead className="text-left text-ink-soft"><tr>{['', 'b0', 'b1', 'b2', 'b3', 'n', 'LOO RMSE'].map((h) => <th key={h} className="py-1 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {Object.entries(calibration.models).map(([k, m]) => (
                  <tr key={k} className="border-t border-grid">
                    <td className="py-1.5 font-medium capitalize">{k}</td>
                    {[m!.b0, m!.b1, m!.b2, m!.b3].map((b, i) => <td key={i} className="py-1.5">{b.toFixed(3)}</td>)}
                    <td className="py-1.5">{m!.n ?? '–'}</td>
                    <td className="py-1.5">{m!.looRmse != null ? `${m!.looRmse.toFixed(2)} cm` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold">No model yet</h2>
            <p className="mt-1 text-sm text-ink-soft">Until you upload one, sessions save raw scan values only and the calibrated column stays empty.</p>
          </>
        )}
      </section>
      {canEdit && (
        <section className="sheet space-y-3">
          <h2 className="text-xl font-bold">Upload a new model</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            <li>Download the records CSV from Records.</li>
            <li>Run <code className="rounded bg-paper px-1">python analysis/fit_calibration.py records.csv --out calibration.json</code></li>
            <li>Upload the calibration.json it writes.</li>
          </ol>
          <label className="btn-tape cursor-pointer">
            Choose calibration.json
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
          </label>
          {msg && <p className={msg.ok ? 'note-ok' : 'note-err'}>{msg.text}</p>}
        </section>
      )}
    </div>
  );
}
