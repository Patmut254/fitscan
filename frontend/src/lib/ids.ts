/** Sequential participant IDs: 1 → P001, 42 → P042, 1000 → P1000. */
export function formatParticipantId(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error('Participant number must be a positive integer');
  return 'P' + String(n).padStart(3, '0');
}

export function parseParticipantId(id: string): number | null {
  const m = /^P(\d{3,})$/.exec(id);
  return m ? Number(m[1]) : null;
}
