export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#1B2A41" />
        <rect x="4" y="12" width="24" height="8" fill="#F2C230" />
        <path d="M8 12v4M12 12v3M16 12v4M20 12v3M24 12v4" stroke="#1B2A41" strokeWidth="1.5" />
      </svg>
      <span className="text-lg font-bold">FitScan</span>
    </span>
  );
}
