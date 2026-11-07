/**
 * The session progress bar, drawn as a measuring tape: one numbered mark per step,
 * cm-style ticks between them, and the tape pulled out to the current step.
 */
export const STEPS = ['Session', 'Details', 'Tape', 'Scan', 'Results', 'Survey', 'Saved'];

export function TapeProgress({ step, id }: { step: number; id?: string }) {
  const n = STEPS.length;
  const pct = (step / (n - 1)) * 100;
  const ticks = (n - 1) * 5;
  return (
    <div className="mb-6" role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${n}: ${STEPS[step]}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{STEPS[step]}</h2>
        {id && <span className="num text-sm font-semibold text-ink-soft">{id}</span>}
      </div>
      <div className="relative h-9 overflow-hidden rounded-md border border-grid bg-paper-raised">
        <div className="absolute inset-y-0 left-0 bg-tape transition-[width] duration-500 ease-out" style={{ width: `calc(${pct}% + ${step === n - 1 ? 0 : 6}px)` }} />
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${ticks} 36`} aria-hidden>
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const major = i % 5 === 0;
            return <line key={i} x1={i} x2={i} y1={0} y2={major ? 14 : 7} stroke="#1B2A41" strokeOpacity={major ? 0.85 : 0.35} strokeWidth={major ? 0.12 : 0.07} vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-0.5 flex justify-between px-1">
          {STEPS.map((s, i) => (
            <span key={s} className={`num w-4 text-center text-[11px] font-bold ${i <= step ? 'text-ink' : 'text-ink-faint'}`} title={s}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
