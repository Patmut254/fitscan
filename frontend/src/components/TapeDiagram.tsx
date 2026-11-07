import type { MeasureKey } from '../types';

/** Simple front-view figure with the measurement line highlighted. */
export function TapeDiagram({ which }: { which: MeasureKey }) {
  const hl = 'stroke-[#C99A0E]';
  return (
    <svg viewBox="0 0 120 220" className="h-40 w-auto shrink-0" role="img" aria-label={`Diagram: ${which} measurement`}>
      <g fill="#F4F6F8" stroke="#8693A5" strokeWidth="1.5">
        <circle cx="60" cy="22" r="14" />
        <path d="M44 42 Q60 38 76 42 L86 50 L98 110 L90 112 L78 62 L80 100 Q84 118 82 128 L76 208 L64 208 L61 140 L59 140 L56 208 L44 208 L38 128 Q36 118 40 100 L42 62 L30 112 L22 110 L34 50 Z" />
      </g>
      {which === 'chest' && <ellipse cx="60" cy="66" rx="21" ry="4" fill="none" className={hl} strokeWidth="3" />}
      {which === 'waist' && <ellipse cx="60" cy="92" rx="18" ry="3.5" fill="none" className={hl} strokeWidth="3" />}
      {which === 'hip' && <ellipse cx="60" cy="118" rx="23" ry="4" fill="none" className={hl} strokeWidth="3" />}
      {which === 'inseam' && (
        <g className={hl} strokeWidth="3" fill="none">
          <line x1="57" y1="140" x2="57" y2="212" />
          <line x1="50" y1="212" x2="64" y2="212" />
          <line x1="50" y1="140" x2="64" y2="140" />
        </g>
      )}
    </svg>
  );
}

export const TAPE_PROTOCOL: Record<MeasureKey, { title: string; text: string }> = {
  chest: {
    title: 'Chest / bust',
    text: 'Participant stands upright, arms relaxed at the sides, breathing normally. Pass the tape horizontally around the fullest part of the chest/bust, under the armpits and across the shoulder blades. Keep the tape level and snug without compressing. Read at the end of a normal breath out.',
  },
  waist: {
    title: 'Waist',
    text: 'Find the natural waist: the narrowest part of the torso between the lowest rib and the top of the hip bone. Keep the tape horizontal. Read at the end of a normal breath out; the participant must not hold their breath or pull in the stomach.',
  },
  hip: {
    title: 'Hip',
    text: 'Feet together. Pass the tape horizontally around the fullest part of the buttocks, checking from the side that it is level all the way round. Snug, not compressing.',
  },
  inseam: {
    title: 'Inseam',
    text: 'Shoes off, feet about 20 cm apart, weight even. Measure vertically from the crotch down the inside of the leg to the floor. Use a ruler held level at the crotch if needed for a clean start point.',
  },
};
