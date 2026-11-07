import { useState } from 'react';
import { login, type Me } from '../lib/api';
import { Logo } from '../components/Logo';
import { PasswordInput } from '../components/PasswordInput';

export function Login({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSignedIn(await login(username.trim(), password));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100svh] max-w-sm flex-col justify-center px-4 py-10">
      <Logo className="mb-10" />
      <h1 className="text-[2rem] font-medium leading-tight">
        Scan, tape, compare.
      </h1>
      <p className="mt-2 text-ink-soft">Sign in with the study account the admin created for you.</p>

      <form onSubmit={submit} className="mt-8 space-y-4 rounded-xl border border-grid bg-paper-raised p-5">
        <div>
          <label className="label" htmlFor="u">Username</label>
          <input id="u" className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="p">Password</label>
          <PasswordInput id="p" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="note-err" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-6 text-sm text-ink-faint">Forgot your password? Ask the study admin to reset it in the admin site.</p>
    </div>
  );
}
