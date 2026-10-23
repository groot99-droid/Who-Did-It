import balance from '@wdi/content/data/balance.json';

/**
 * Round 8, 8G (motion.md 2): what each portal does while the server says it swings, and where the Daily Train
 * runs. Pure, so the tests read it without Phaser; `TransportView` draws it. The scene graph and the maps come in
 * as arguments: the view loads `@wdi/content` lazily, as the other views do, to keep it out of the first chunk.
 */
export type SceneGraph = Record<
  string,
  {
    portals: Array<{ id: string; elevationDelta: number }>;
    material: string[];
    spawns: Array<{ id: string; x: number; y: number }>;
  }
>;
export type MapList = Record<string, { station?: string | null }>;

export type TransportKind = 'door' | 'hatch' | 'ladder' | 'veil';

/** How a portal moves: a door leaf, a hatch lid, a ladder out of a well or a winze, or a fading veil for the rest. */
export function transportOf(kind: string, id: string, face: string | null): TransportKind {
  if (kind === 'door' && (face === 's' || face === 'e')) return 'door';
  if (kind === 'hatch') return /well|winze/.test(id) ? 'ladder' : 'hatch';
  return 'veil';
}

/** Metres gained crossing a portal, from the scene graph; 0 for an id the graph lacks. */
export function elevationOf(scenes: SceneGraph, sceneId: string, portalId: string): number {
  return scenes[sceneId]?.portals.find((p) => p.id === portalId)?.elevationDelta ?? 0;
}

/** Ease in and out over 0..1. */
const ease = (k: number) => {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
};

/** The share of the swing spent opening, and where the closing starts. */
const OPENING = 0.15;
const CLOSING = 0.7;

/**
 * How open a portal is, 0 shut to 1 open, `leftS` seconds before its swing ends (GDD 3.7: `doors.swingS`). It
 * opens fast, holds, and falls shut over the last part. Reduced motion holds it open for the whole swing.
 */
export function openness(leftS: number, reduced: boolean, swingS: number = balance.doors.swingS): number {
  if (leftS <= 0) return 0;
  if (reduced) return 1;
  const u = 1 - Math.min(1, leftS / swingS);
  if (u < OPENING) return ease(u / OPENING);
  if (u < CLOSING) return 1;
  return 1 - ease((u - CLOSING) / (1 - CLOSING));
}

/**
 * The side a door leaf swings to: away from the one crossing. `side` is the sign of the crosser's offset along
 * the wall's normal (+y for a south face, +x for an east one); with nobody near, it swings inwards (-1).
 */
export function swingSide(
  face: 's' | 'e',
  portal: { x: number; y: number },
  crosser: { x: number; y: number } | null,
) {
  if (!crosser) return -1;
  const d = face === 's' ? crosser.y - portal.y : crosser.x - portal.x;
  return d > 0 ? -1 : 1;
}

/**
 * The climber on a ladder: going down when someone left a portal that drops (`elevation` < 0) or came out of
 * one that rises, going up otherwise. `k` is the climb's progress 0..1; the result is the height above the
 * ground as a share of the ladder, below 0 once under the rim.
 */
export function climbHeight(left: boolean, elevation: number, k: number): number {
  const down = left === elevation < 0;
  const e = ease(k);
  return down ? 0.6 - 1.2 * e : -0.6 + 1.2 * e;
}

/** The Train's rail column and where it stops, in tiles: the `=` run nearest a map's station spawn. */
export interface TrainTrack {
  sceneId: string;
  x: number;
  stopY: number;
  /** Where the Train comes in from and leaves to: past the spur's end nearer the map's edge. */
  fromY: number;
}

/** The track of the map whose station is in `sceneId`, or null: BlackPine and every other scene have no Train. */
export function trainTrack(scenes: SceneGraph, maps: MapList, sceneId: string): TrainTrack | null {
  for (const map of Object.values(maps)) {
    const [sid, spawnId] = (map.station ?? '').split('.');
    if (sid !== sceneId) continue;
    const scene = scenes[sid];
    const spawn = scene?.spawns.find((s) => s.id === spawnId);
    if (!scene || !spawn) return null;
    let best: { x: number; lo: number; hi: number } | null = null;
    for (let x = 0; x < (scene.material[0]?.length ?? 0); x++) {
      if (scene.material[spawn.y]?.[x] !== '=') continue;
      if (best && Math.abs(best.x - spawn.x) <= Math.abs(x - spawn.x)) continue;
      let lo = spawn.y;
      let hi = spawn.y;
      while (scene.material[lo - 1]?.[x] === '=') lo--;
      while (scene.material[hi + 1]?.[x] === '=') hi++;
      best = { x, lo, hi };
    }
    if (!best) return null;
    // The spur leads off the map at its end nearer the edge; the Train backs in and out that way.
    const southOpen = scene.material.length - 1 - best.hi <= best.lo;
    return {
      sceneId: sid,
      x: best.x,
      stopY: spawn.y,
      fromY: southOpen ? best.hi + 6 : best.lo - 6,
    };
  }
  return null;
}

export const TRAIN_ROLL_MS = 2600;
export const TRAIN_DWELL_MS = 2500;

/** What a seat has heard of today's Train: the arrival and the delivery pulses, in client ms. */
export interface TrainHeard {
  arriveAt: number | null;
  brakeAt: number | null;
}

/**
 * Where the Train is at `now`: 0 at the stop, 1 out past the end of the spur, null when gone. It rolls in on
 * the arrival, stands, and backs out a dwell after the delivery; if the delivery is never heard it leaves a
 * dwell after the delivery was due (GDD 3.3 `train.deliveryAfterS`). Reduced motion cuts in and out.
 */
export function trainAt(heard: TrainHeard, now: number, reduced: boolean): number | null {
  const start = heard.arriveAt ?? (heard.brakeAt !== null ? heard.brakeAt - TRAIN_ROLL_MS : null);
  if (start === null || now < start) return null;
  const due = heard.brakeAt ?? start + balance.train.deliveryAfterS * 1000;
  const leave = due + TRAIN_DWELL_MS;
  if (now >= leave + (reduced ? 0 : TRAIN_ROLL_MS)) return null;
  if (now >= leave) return ease((now - leave) / TRAIN_ROLL_MS);
  if (reduced) return 0;
  return 1 - ease((now - start) / TRAIN_ROLL_MS);
}
