import { useEffect, useState } from 'react';
import { addTeamMember, listTeam, makeTempPassword, updateTeamMember, type Me, type TeamMember } from '../../lib/api';

const ROLE_HELP = {
  researcher: 'Runs sessions, corrects records and downloads data.',
  viewer: 'Sees the dashboard and records and downloads data. Cannot change anything.',
};

function TempPasswordNote({ username, password, onDone }: { username: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `FitScan sign-in\nAddress: ${location.origin}\nUsername: ${username}\nTemporary password: ${password}\nYou will choose your own password after signing in.`;
  return (
    <div className="rounded-xl bg-sage-light p-4" role="status">
      <p className="font-semibold text-sage">Give these details to {username}</p>
      <dl className="num mt-2 grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
        <dt className="text-ink-soft">Username</dt><dd className="font-semibold">{username}</dd>
        <dt className="text-ink-soft">Temporary password</dt><dd className="font-semibold">{password}</dd>
      </dl>
      <p className="mt-2 text-sm text-ink-soft">They'll be asked to choose their own password the first time they sign in. This password is not shown again.</p>
      <div className="mt-3 flex gap-2">
        <button
          className="btn-primary btn-sm"
          onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined)}
        >
          {copied ? 'Copied' : 'Copy sign-in details'}
        </button>
        <button className="btn-ghost btn-sm" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

function AddPerson({ onAdded }: { onAdded: (m: TeamMember, password: string) => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(makeTempPassword);
  const [role, setRole] = useState<'researcher' | 'viewer'>('researcher');
  const [isAdmin, setIsAdmin] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const m = await addTeamMember({ username: username.trim(), name: name.trim(), password, role, isAdmin });
      onAdded(m, password);
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sheet space-y-4">
      <h2 className="text-xl font-bold">Add a person</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="t-name">Name (shown in the app)</label>
          <input id="t-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mary Wanjiru" />
        </div>
        <div>
          <label className="label" htmlFor="t-user">Username (for signing in)</label>
          <input id="t-user" className="input" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} placeholder="mary" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="t-pw">Temporary password</label>
        <div className="flex gap-2">
          <input id="t-pw" className="input num" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="button" className="btn-ghost shrink-0" onClick={() => setPassword(makeTempPassword())}>New one</button>
        </div>
      </div>
      <fieldset>
        <legend className="label">What can they do?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['researcher', 'viewer'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)} className={`seg h-auto px-4 py-3 text-left ${role === r ? 'seg-on' : 'seg-off'}`}>
              <span className="block font-semibold">{r === 'researcher' ? 'Researcher' : 'Viewer'}</span>
              <span className={`block text-xs ${role === r ? 'text-white/80' : 'text-ink-soft'}`}>{ROLE_HELP[r]}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#1B2A41]" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        <span><span className="font-semibold">Can manage the team</span><br /><span className="text-ink-soft">Can add people, reset passwords and switch accounts off, like you.</span></span>
      </label>
      {err && <p className="note-err">{err}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy || !username.trim()}>{busy ? 'Adding…' : 'Add person'}</button>
    </form>
  );
}

function MemberRow({ m, isSelf, onChanged, onReset }: { m: TeamMember; isSelf: boolean; onChanged: (m: TeamMember) => void; onReset: (username: string, password: string) => void }) {
  const [err, setErr] = useState('');
  const change = async (c: Parameters<typeof updateTeamMember>[1]) => {
    setErr('');
    try {
      onChanged(await updateTeamMember(m.username, c));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  async function reset() {
    if (!confirm(`Give ${m.username} a new temporary password? Their current password stops working.`)) return;
    const pw = makeTempPassword();
    try {
      onChanged(await updateTeamMember(m.username, { password: pw }));
      onReset(m.username, pw);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <li className={`px-4 py-4 ${m.isActive ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[10rem] flex-1">
          <p className="font-semibold">{m.name || m.username}{isSelf && <span className="ml-2 text-sm font-normal text-ink-faint">(you)</span>}</p>
          <p className="text-sm text-ink-soft">
            {m.username}
            {!m.isActive && ' · switched off'}
            {m.isActive && m.mustChangePassword && ' · hasn’t set their own password yet'}
            {m.isActive && !m.mustChangePassword && (m.lastLogin ? ` · last signed in ${new Date(m.lastLogin).toLocaleDateString()}` : ' · never signed in')}
          </p>
        </div>
        <select
          className="input w-auto py-2 text-sm"
          aria-label={`Role for ${m.username}`}
          value={m.role === 'none' ? '' : m.role}
          onChange={(e) => change({ role: e.target.value as 'researcher' | 'viewer' })}
        >
          {m.role === 'none' && <option value="">No access</option>}
          <option value="researcher">Researcher</option>
          <option value="viewer">Viewer</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#1B2A41]" checked={m.isAdmin} disabled={isSelf} onChange={(e) => change({ isAdmin: e.target.checked })} />
          Manages team
        </label>
        {!isSelf && (
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={reset} disabled={!m.isActive}>Reset password</button>
            <button className="btn-ghost btn-sm" onClick={() => change({ isActive: !m.isActive })}>{m.isActive ? 'Switch off' : 'Switch on'}</button>
          </div>
        )}
      </div>
      {err && <p className="note-err mt-2">{err}</p>}
    </li>
  );
}

export function Team({ me }: { me: Me }) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<{ username: string; password: string } | null>(null);

  useEffect(() => {
    listTeam().then(setTeam, (e) => setError(e.message));
  }, []);

  const replace = (m: TeamMember) => setTeam((t) => t?.map((x) => (x.username === m.username ? m : x)) ?? null);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Team</h1>
          <p className="mt-1 text-ink-soft">People who can sign in. Participants never get accounts; they stay anonymous as P001, P002…</p>
        </div>
        {!adding && <button className="btn-primary" onClick={() => { setAdding(true); setNote(null); }}>Add a person</button>}
      </div>
      {error && <p className="note-err">{error}</p>}
      {note && <TempPasswordNote username={note.username} password={note.password} onDone={() => setNote(null)} />}
      {adding && (
        <AddPerson
          onAdded={(m, pw) => {
            setTeam((t) => [...(t ?? []), m]);
            setAdding(false);
            setNote({ username: m.username, password: pw });
          }}
        />
      )}
      <ul className="panel divide-y divide-grid">
        {!team && !error && <li className="p-4 text-ink-faint">Loading…</li>}
        {team?.map((m) => (
          <MemberRow key={m.username} m={m} isSelf={m.username === me.username} onChanged={replace} onReset={(username, password) => setNote({ username, password })} />
        ))}
      </ul>
      <p className="text-sm text-ink-faint">Switched-off accounts can't sign in, but everything they collected stays in the records and activity log.</p>
    </div>
  );
}
