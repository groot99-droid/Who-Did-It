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

// --- Decision helpers of the NPC brain (M3c, GDD 3.12). Pure: the server feeds them its own state and rng. ---

/** A delay drawn uniformly from `minS..maxS` seconds, in ticks (the walk step, the ready and vote delays). */
export function npcDelayTicks(rng: Rng, minS: number, maxS: number, tickRate: number): number {
  return Math.max(1, Math.round((minS + rng() * Math.max(0, maxS - minS)) * tickRate));
}

/** The per-tick chance that makes `per10s` the chance over ten seconds of opportunity. */
export function chancePerTick(per10s: number, tickRate: number): number {
  if (per10s <= 0) return 0;
  if (per10s >= 1) return 1;
  return 1 - Math.pow(1 - per10s, 1 / (10 * tickRate));
}

/** The eight compass headings as unit vectors, index = `DIRECTIONS` order, x right, y down (screen space). */
export const HEADINGS: readonly { dx: number; dy: number }[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  // `+ 0` turns a -0 into 0.
  return { dx: Math.round(Math.sin(a) * 1000) / 1000 + 0, dy: Math.round(-Math.cos(a) * 1000) / 1000 + 0 };
});

/** The seat with the highest positive score among `candidates` (ties broken by the rng), or null. */
export function pickSuspect(
  scores: ReadonlyMap<string, number>,
  candidates: readonly string[],
  rng: Rng,
): string | null {
  let best = 0;
  let top: string[] = [];
  for (const id of candidates) {
    const s = scores.get(id) ?? 0;
    if (s > best) {
      best = s;
      top = [id];
    } else if (s === best && s > 0) top.push(id);
  }
  return top.length === 0 ? null : (top[Math.floor(rng() * top.length)] as string);
}

/** The most frequent entry of `votes` (ties broken by the rng), or null when there are none. */
export function pluralityOf(votes: readonly string[], rng: Rng): string | null {
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 0;
  let top: string[] = [];
  for (const [v, n] of counts) {
    if (n > best) {
      best = n;
      top = [v];
    } else if (n === best) top.push(v);
  }
  return top.length === 0 ? null : (top[Math.floor(rng() * top.length)] as string);
}

/**
 * Shortest 4-connected path over open tiles from `from` to the first tile `isGoal` accepts, both ends
 * included; null when none is reachable. The start tile is always allowed (a body may stand half in a wall).
 */
export function tilePath(
  w: number,
  h: number,
  solid: (tx: number, ty: number) => boolean,
  from: { x: number; y: number },
  isGoal: (tx: number, ty: number) => boolean,
): { x: number; y: number }[] | null {
  const idx = (x: number, y: number) => y * w + x;
  if (from.x < 0 || from.y < 0 || from.x >= w || from.y >= h) return null;
  const prev = new Int32Array(w * h).fill(-2);
  const queue: number[] = [idx(from.x, from.y)];
  prev[queue[0] as number] = -1;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head] as number;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (isGoal(cx, cy)) {
      const out: { x: number; y: number }[] = [];
      for (let at = cur; at !== -1; at = prev[at] as number) out.push({ x: at % w, y: Math.floor(at / w) });
      return out.reverse();
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || solid(nx, ny)) continue;
      const n = idx(nx, ny);
      if (prev[n] !== -2) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  return null;
}
