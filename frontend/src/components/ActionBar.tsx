/** Sticky bottom bar for the main step action, within thumb reach on a phone. */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 bg-paper px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <div className="flex gap-3">{children}</div>
    </div>
  );
}
