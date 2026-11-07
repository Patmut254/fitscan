/** Standard System Usability Scale (Brooke, 1996). 10 items, 1 = Strongly disagree … 5 = Strongly agree. */

export const SUS_ITEMS: string[] = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need the support of a technical person to be able to use this system.',
  'I found the various functions in this system were well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
];

/**
 * SUS score 0-100: odd items contribute (response − 1), even items (5 − response);
 * the sum (0-40) is multiplied by 2.5.
 */
export function susScore(items: number[]): number {
  if (items.length !== 10) throw new Error('SUS requires exactly 10 responses');
  let sum = 0;
  items.forEach((r, i) => {
    if (!Number.isInteger(r) || r < 1 || r > 5) throw new Error(`Item ${i + 1} must be an integer 1-5`);
    sum += i % 2 === 0 ? r - 1 : 5 - r;
  });
  return sum * 2.5;
}
