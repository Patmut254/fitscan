import { useState } from 'react';
import { changePassword, type Me } from '../lib/api';
import { PasswordInput } from '../components/PasswordInput';

const ROLE_TEXT: Record<string, string> = {
  researcher: 'Researcher: can run sessions, edit records and export data.',
  viewer: 'Viewer: can see the dashboard and records, and export data. Cannot run sessions or edit.',
  none: 'No study access. Ask the admin to add you to the Researcher or Viewer group.',
};

export function Account({ user, onSignOut }: { user: Me; onSignOut: () => void }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const canSubmit = oldPw && newPw.length >= 10 && newPw === confirmPw && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await changePassword(oldPw, newPw);
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      setMsg({ ok: true, text: 'Password changed. You are still signed in here; other devices are signed out.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <section className="sheet">
        <h1 className="text-2xl font-bold">{user.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">Signed in as {user.username}</p>
        <p className="mt-3 text-sm">{ROLE_TEXT[user.role]}</p>
        {user.isSuperuser && (
          <a className="btn-ghost btn-sm mt-4" href={(import.meta.env.VITE_ADMIN_URL as string | undefined) ?? '/admin/'} target="_blank" rel="noreferrer">
            Open admin site (accounts and raw data)
          </a>
        )}
      </section>

      <form onSubmit={submit} className="sheet space-y-4">
        <h2 className="text-xl font-bold">Change password</h2>
        <div>
          <label className="label" htmlFor="old">Current password</label>
          <PasswordInput id="old" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="new">New password</label>
          <PasswordInput id="new" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required aria-describedby="pw-help" />
          <p id="pw-help" className="mt-1.5 text-xs text-ink-faint">At least 10 characters, not all numbers, not a common password.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">Repeat new password</label>
          <PasswordInput id="confirm" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
          {mismatch && <p className="mt-1.5 text-xs text-chalk">The two new passwords don't match.</p>}
        </div>
        {msg && <p className={msg.ok ? 'note-ok' : 'note-err'} role="status">{msg.text}</p>}
        <button className="btn-primary w-full" disabled={!canSubmit}>{busy ? 'Changing…' : 'Change password'}</button>
      </form>

      <button className="btn-ghost w-full" onClick={onSignOut}>Sign out</button>
    </div>
  );
}
