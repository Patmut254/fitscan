/**
 * Best-effort phone model from the user-agent string. Always editable by the researcher.
 * Note: modern Chrome on Android "reduces" the UA to "Android 10; K"; App.tsx additionally tries
 * navigator.userAgentData.getHighEntropyValues(['model']) where supported.
 */
export function phoneModelFromUA(ua: string): string {
  if (!ua) return '';
  if (/iPhone/.test(ua)) {
    const os = /OS (\d+)[_.](\d+)/.exec(ua);
    return os ? `iPhone (iOS ${os[1]}.${os[2]})` : 'iPhone';
  }
  if (/iPad/.test(ua)) return 'iPad';
  const android = /Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/.exec(ua);
  if (android) {
    const model = android[1].trim();
    const ver = /Android ([\d.]+)/.exec(ua)?.[1];
    if (model === 'K' || model === 'wv') return ver ? `Android ${ver} (model hidden)` : 'Android (model hidden)';
    return model;
  }
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac (desktop)';
  if (/Windows/.test(ua)) return 'Windows (desktop)';
  if (/Linux/.test(ua)) return 'Linux (desktop)';
  return 'Unknown';
}
