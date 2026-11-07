/** On-screen alignment guides (A-pose front, profile side). Head top and feet line up with guide bars. */
export function Silhouette({ view }: { view: 'front' | 'side' }) {
  return (
    <svg viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full">
      <line x1="10" y1="12" x2="90" y2="12" stroke="#facc15" strokeWidth="0.6" strokeDasharray="2 2" />
      <line x1="10" y1="190" x2="90" y2="190" stroke="#facc15" strokeWidth="0.6" strokeDasharray="2 2" />
      <g fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.85)" strokeWidth="0.8" strokeDasharray="3 2">
        {view === 'front' ? (
          <>
            <ellipse cx="50" cy="21" rx="8" ry="9.5" />
            <path d="M40 34 Q50 31 60 34 L66 39 L80 92 L75 94 L63 52 L63 82 Q66 96 64 104 L60 189 L53 189 L51 116 L49 116 L47 189 L40 189 L36 104 Q34 96 37 82 L37 52 L25 94 L20 92 L34 39 Z" />
          </>
        ) : (
          <>
            <ellipse cx="51" cy="21" rx="8" ry="9.5" />
            <path d="M46 31 L54 31 L58 38 Q61 50 58 62 Q60 74 56 84 Q62 96 58 108 L57 150 L58 186 L64 189 L46 189 L47 150 L43 108 Q38 92 42 80 Q40 60 43 40 Z" />
          </>
        )}
      </g>
    </svg>
  );
}
