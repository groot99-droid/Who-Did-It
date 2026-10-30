import { Phase, TILE_PX } from '@wdi/shared';

/** The bed kinds a seat can lie in (GDD 3.32): its home bed, the chapel cot and the tavern's inn bed. */
export const BED_KINDS = ['bed', 'cot', 'innBed'] as const;
export type BedKind = (typeof BED_KINDS)[number];

export interface BedSpot {
  propId: string;
  kind: BedKind;
  x: number;
  y: number;
}

/** The scene's beds, at the centre of their tile. */
export function bedSpots(
  props: ReadonlyArray<{ id: string; kind: string; x: number; y: number }>,
): BedSpot[] {
  const out: BedSpot[] = [];
  for (const p of props)
    if ((BED_KINDS as readonly string[]).includes(p.kind))
      out.push({ propId: p.id, kind: p.kind as BedKind, x: (p.x + 0.5) * TILE_PX, y: (p.y + 0.5) * TILE_PX });
  return out;
}

/** A seat lies down at dusk or at night only; the server refuses any other phase (`PHASE_CLOSED`). */
export const canLieDown = (phase: number): boolean => phase === Phase.dusk || phase === Phase.night;

/**
 * The sleeper's count of active players in bed, or null when the server wrote none (an awake seat learns nothing,
 * GDD 3.32). Never a name.
 */
export function countParts(inBed: number, inBedOf: number): { n: number; m: number } | null {
  return inBedOf > 0 ? { n: inBed, m: inBedOf } : null;
}

/**
 * True on the frame a sleeper wakes because the night ended: a hit or a move wakes it inside dusk or night, a dawn
 * wakes it outside them. A skip and a natural dawn read the same, and both are true for the sleeper (A8).
 */
export const sleptThrough = (wasAsleep: boolean, asleep: boolean, phase: number): boolean =>
  wasAsleep && !asleep && !canLieDown(phase);
