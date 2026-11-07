export function Saved({ id, susScore, onNext }: { id: string; susScore: number; onNext: () => void }) {
  return (
    <div className="sheet text-center">
      <svg viewBox="0 0 64 64" className="mx-auto h-16 w-16" aria-hidden>
        <circle cx="32" cy="32" r="30" fill="#DCEDE3" />
        <path d="M19 33l9 9 17-19" fill="none" stroke="#2F6F4E" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h3 className="mt-4 text-2xl font-bold">Thank you</h3>
      <p className="mt-2 text-ink-soft">Please hand the phone back to the researcher.</p>
      <p className="num mt-6 text-sm text-ink-soft">
        {id} saved. Usability score {susScore.toFixed(1)} / 100.
      </p>
      <button className="btn-primary mt-6 w-full" onClick={onNext}>Start next participant</button>
    </div>
  );
}
