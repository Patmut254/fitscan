import { APP_VERSION } from '../lib/api';

export function Footer() {
  return (
    <footer className="mt-12 pb-8 text-center text-xs text-ink-faint">
      FitScan {APP_VERSION}. Photos are analysed on this phone and never leave it.
    </footer>
  );
}
