import type { Rng } from './prng';

// NPC fill rules (GDD 3.12). `pickNpcNames` is pre-seeded by the orchestrator; Session S adds the
// decision helpers it needs beside it (round 4, docs/SESSIONS.md).

/**
 * `count` names from `pool` that no seat holds yet (case-insensitive), in seeded random order. Throws
 * when the pool cannot supply them, so a short pool fails at the deal and never at a later seat.
 */
export function pickNpcNames(
  pool: readonly string[],
  taken: readonly string[],
  count: number,
  rng: Rng,
): string[] {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  const free = pool.filter((n) => !used.has(n.trim().toLowerCase()));
  if (free.length < count) throw new Error(`NPC name pool: ${free.length} free names, ${count} needed`);
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [free[i], free[j]] = [free[j] as string, free[i] as string];
  }
  return free.slice(0, count);
}
