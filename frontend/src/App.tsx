import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { APP_VERSION, getCalibration, hasToken, logout, me, reserveParticipantId, saveRecord, setUnauthorizedHandler, type Me } from './lib/api';
import { parseCalibration, type CalibrationFile } from './lib/calibrate';
import { phoneModelFromUA } from './lib/phone';
import { buildRecord } from './lib/record';
import { emptyDraft, type Draft } from './state/draft';
import type { FitRecord } from './types';
import { TapeProgress } from './components/TapeProgress';
import { Footer } from './components/Footer';
import { Logo } from './components/Logo';
import { Login } from './screens/Login';
import { Account } from './screens/Account';
import { NewSession } from './screens/NewSession';
import { Participant } from './screens/Participant';
import { Tape } from './screens/Tape';
import { Results } from './screens/Results';
import { Sus } from './screens/Sus';
import { Saved } from './screens/Saved';

// Camera/MediaPipe and the dashboard load on demand, so sign-in is fast on a phone.
const Scan = lazy(() => import('./screens/Scan').then((m) => ({ default: m.Scan })));
const Overview = lazy(() => import('./screens/data/Overview').then((m) => ({ default: m.Overview })));
const Records = lazy(() => import('./screens/data/Records').then((m) => ({ default: m.Records })));
const Activity = lazy(() => import('./screens/data/Activity').then((m) => ({ default: m.Activity })));
const Team = lazy(() => import('./screens/data/Team').then((m) => ({ default: m.Team })));
const CalibrationScreen = lazy(() => import('./screens/data/Calibration').then((m) => ({ default: m.Calibration })));

type Tab = 'collect' | 'overview' | 'records' | 'activity' | 'calibration' | 'team' | 'account';
// Session steps: 0 Session · 1 Details · 2 Tape · 3 Scan · 4 Results · 5 Survey · 6 Saved
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

async function detectPhoneModel(): Promise<string> {
  const base = phoneModelFromUA(navigator.userAgent);
  const uad = (navigator as unknown as { userAgentData?: { getHighEntropyValues: (h: string[]) => Promise<{ model?: string }> } }).userAgentData;
  try {
    const hv = await uad?.getHighEntropyValues(['model']);
    if (hv?.model) return hv.model;
  } catch {
    /* not supported */
  }
  return base;
}

const ROLE_LABEL: Record<string, string> = { researcher: 'Researcher', viewer: 'Viewer (read-only)', none: 'No access' };

const NAV: { tab: Tab; label: string; researcherOnly?: boolean; adminOnly?: boolean }[] = [
  { tab: 'collect', label: 'Collect', researcherOnly: true },
  { tab: 'overview', label: 'Overview' },
  { tab: 'records', label: 'Records' },
  { tab: 'activity', label: 'Activity' },
  { tab: 'calibration', label: 'Calibration' },
  { tab: 'team', label: 'Team', adminOnly: true },
  { tab: 'account', label: 'Account' },
];

export default function App() {
  const [user, setUser] = useState<Me | null | undefined>(hasToken() ? undefined : null);
  const [tab, setTab] = useState<Tab>('collect');
  const [step, setStep] = useState<Step>(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [record, setRecord] = useState<FitRecord | null>(null);
  const [calNote, setCalNote] = useState('');
  const [cal, setCal] = useState<CalibrationFile | null>(null);
  const [startError, setStartError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const starting = useRef(false);

  const isResearcher = user?.role === 'researcher';

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (hasToken()) me().then(setUser, () => setUser(null));
  }, []);

  useEffect(() => {
    if (user) setTab((t) => (user.role === 'researcher' ? t : t === 'collect' ? 'overview' : t));
  }, [user]);

  const refreshCalibration = useCallback(() => {
    getCalibration().then((r) => setCal(parseCalibration(r.calibration)), () => setCal(null));
  }, []);
  useEffect(() => {
    if (user && user.role !== 'none') refreshCalibration();
  }, [user, refreshCalibration]);

  // A participant number is only taken when the researcher presses "Start a new participant",
  // so opening or browsing the app never uses up numbers.
  const [startingNow, setStartingNow] = useState(false);
  const startSession = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    setStartingNow(true);
    setStartError('');
    try {
      const [{ id }, phone] = await Promise.all([reserveParticipantId(), detectPhoneModel()]);
      setDraft(emptyDraft(id, phone));
      setRecord(null);
      setStep(0);
    } catch (e) {
      setStartError((e as Error).message);
    } finally {
      starting.current = false;
      setStartingNow(false);
    }
  }, []);


  useEffect(() => {
    if (!(draft && step > 0 && step < 6)) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [draft, step]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step, tab]);

  async function signOutNow() {
    await logout();
    setDraft(null);
    setUser(null);
  }

  if (user === undefined) return <div className="grid min-h-[100svh] place-items-center text-ink-faint">Loading…</div>;
  if (user === null) return <Login onSignedIn={setUser} />;
  if (user.mustChangePassword)
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Logo className="mb-6" />
        <p className="note-warn mb-6">Welcome, {user.name}. Before you start, replace the temporary password you were given with one only you know.</p>
        <Account user={user} firstTime onPasswordChanged={() => setUser({ ...user, mustChangePassword: false })} onSignOut={signOutNow} />
      </div>
    );

  async function signOut() {
    if (draft && step > 0 && step < 6 && !confirm(`Sign out and abandon ${draft.id}?`)) return;
    await logout();
    setDraft(null);
    setUser(null);
  }

  function computeResults(d: Draft) {
    const { record: r, calibrationNote } = buildRecord(d, APP_VERSION, cal);
    setRecord(r);
    setCalNote(calibrationNote);
  }

  async function finish() {
    if (!draft) return;
    setSaving(true);
    setSaveError('');
    try {
      const { record: r } = buildRecord(draft, APP_VERSION, cal);
      setRecord(await saveRecord(r));
      setStep(6);
    } catch (e) {
      setSaveError(`Not saved yet: ${(e as Error).message} Your answers are kept; tap Finish to try again.`);
    } finally {
      setSaving(false);
    }
  }

  function abandon() {
    if (!confirm(`Abandon ${draft?.id}? Nothing about this participant will be saved.`)) return;
    setDraft(null);
  }

  // While the participant holds the phone (survey and thank-you), hide all navigation.
  const participantMode = tab === 'collect' && (step === 5 || step === 6);
  const nav = NAV.filter((n) => (!n.researcherOnly || isResearcher) && (!n.adminOnly || user.isSuperuser));
  const wide = tab !== 'collect' && tab !== 'account';

  return (
    <div className="min-h-[100svh] lg:flex">
      {!participantMode && (
        <>
          {/* Desktop side rail */}
          <nav className="sticky top-0 hidden h-[100svh] w-56 shrink-0 flex-col bg-paper-raised px-4 py-6 lg:flex" aria-label="Main">
            <Logo className="mb-8 px-2" />
            <ul className="space-y-1">
              {nav.map((n) => (
                <li key={n.tab}>
                  <button
                    onClick={() => setTab(n.tab)}
                    aria-current={tab === n.tab ? 'page' : undefined}
                    className={`relative w-full rounded-lg px-3 py-2.5 text-left font-medium transition-colors ${tab === n.tab ? 'bg-ink text-white' : 'text-ink-soft hover:bg-paper hover:text-ink'}`}
                  >
                    {n.label}
                    {n.tab === 'collect' && draft && step > 0 && step < 6 && <span className="num ml-2 rounded bg-tape px-1.5 text-xs font-bold text-ink">{draft.id}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-auto rounded-lg bg-paper px-3 py-2.5 text-sm">
              <p className="text-ink-faint">Signed in as</p>
              <p className="font-semibold">{user.name}</p>
              <p className="text-ink-soft">{ROLE_LABEL[user.role]}{user.isSuperuser && ', manages team'}</p>
            </div>
          </nav>
          {/* Phone top bar */}
          <header className="sticky top-0 z-30 bg-paper-raised lg:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex items-center justify-between px-4 py-2.5">
              <Logo />
              <span className="text-right text-xs leading-tight text-ink-faint">
                Signed in as <span className="font-semibold text-ink">{user.name}</span>
                <br />
                {ROLE_LABEL[user.role]}
              </span>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Main">
              {nav.map((n) => (
                <button
                  key={n.tab}
                  onClick={() => setTab(n.tab)}
                  aria-current={tab === n.tab ? 'page' : undefined}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === n.tab ? 'bg-ink text-white' : 'text-ink-soft'}`}
                >
                  {n.label}
                </button>
              ))}
            </nav>
          </header>
        </>
      )}

      <main className={`mx-auto w-full px-4 pt-6 lg:px-10 lg:pt-10 ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>
        <Suspense fallback={<p className="text-ink-faint">Loading…</p>}>
          {user.role === 'none' && tab !== 'account' ? (
            <div className="sheet">
              <h1 className="text-2xl font-bold">No study access yet</h1>
              <p className="mt-2 text-ink-soft">Your account exists but isn't in the Researcher or Viewer group. Ask the study admin to add you.</p>
            </div>
          ) : tab === 'overview' ? (
            <Overview />
          ) : tab === 'records' ? (
            <Records canEdit={isResearcher} />
          ) : tab === 'activity' ? (
            <Activity />
          ) : tab === 'calibration' ? (
            <CalibrationScreen calibration={cal} canEdit={isResearcher} onChanged={refreshCalibration} />
          ) : tab === 'team' && user.isSuperuser ? (
            <Team me={user} />
          ) : tab === 'account' ? (
            <Account user={user} onSignOut={signOut} />
          ) : !draft ? (
            <div className="sheet">
              <h1 className="text-2xl font-bold">Ready for the next participant?</h1>
              <p className="mt-2 text-ink-soft">The app gives them the next number (P001, P002…) when you start. Have the paper consent form ready.</p>
              {startError && <p className="note-err mt-4">{startError}</p>}
              <button className="btn-primary mt-5 w-full" disabled={startingNow} onClick={startSession}>
                {startingNow ? 'Starting…' : 'Start a new participant'}
              </button>
            </div>
          ) : (
            <>
              <TapeProgress step={step} id={draft.id} />
              {step === 0 && <NewSession draft={draft} setDraft={setDraft} onNext={() => setStep(1)} />}
              {step === 1 && <Participant draft={draft} setDraft={setDraft} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
              {step === 2 && <Tape draft={draft} setDraft={setDraft} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
              {step === 3 && (
                <Scan
                  heightCm={draft.heightCm!}
                  onBack={() => setStep(2)}
                  onDone={(scan) => {
                    const d = { ...draft, scan };
                    setDraft(d);
                    computeResults(d);
                    setStep(4);
                  }}
                />
              )}
              {step === 4 && record && <Results record={record} calibrationNote={calNote} onRescan={() => setStep(3)} onNext={() => setStep(5)} />}
              {step === 5 && <Sus values={draft.sus} onChange={(sus) => setDraft({ ...draft, sus })} onSubmit={finish} saving={saving} error={saveError} />}
              {step === 6 && record?.sus && <Saved id={record.id} susScore={record.sus.score} onNext={startSession} />}
              {step > 0 && step < 5 && (
                <button className="mt-8 w-full text-center text-sm text-ink-faint underline" onClick={abandon}>
                  Abandon this session
                </button>
              )}
            </>
          )}
        </Suspense>
        <Footer />
      </main>
    </div>
  );
}
