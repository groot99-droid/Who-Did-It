import { type DayPart, type Scene, items } from '@wdi/content';
import { ErrorCode, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { simOf } from '../RoomSim';
import { reject } from '../World';

/**
 * Lights for the creatures and for dark sight (GDD 3.15). A seat's light burns while it holds a `use: light` item
 * (Lantern, Torch, Candle) and has lit it; every light starts out, so a start kit says nothing until its holder
 * chooses to light it (DECISIONS A89). The switch is room memory; the only public trace is `StatusBit.lantern`.
 */
const LIGHT_ITEMS: ReadonlySet<string> = new Set(
  Object.values(items.items)
    .filter((item) => item.use === 'light')
    .map((item) => item.id),
);

export function holdsLight(player: PlayerState): boolean {
  for (const slot of player.priv.inventory.slots)
    if (LIGHT_ITEMS.has(slot.defId) && slot.qty > 0) return true;
  return false;
}

const switches = new WeakMap<PartyRoom, Set<string>>();
function litOf(room: PartyRoom): Set<string> {
  let lit = switches.get(room);
  if (!lit) switches.set(room, (lit = new Set()));
  return lit;
}

/** Whether a living seat's light burns now: switched on and still held. */
export function lightBurns(room: PartyRoom, seat: string): boolean {
  if (!litOf(room).has(seat) || simOf(room).players.get(seat)?.dead !== false) return false;
  const player = room.state.players.get(seat);
  return player !== undefined && holdsLight(player);
}

/** Lights or puts out a seat's light; lighting needs a light in hand. Returns whether it burns afterwards. */
export function setLight(room: PartyRoom, seat: string, on: boolean): boolean {
  const player = room.state.players.get(seat);
  if (on && player !== undefined && holdsLight(player)) litOf(room).add(seat);
  else litOf(room).delete(seat);
  return lightBurns(room, seat);
}

/**
 * The handler for the requested `act.light { on: boolean }` (contract request in the 6G PR; nothing routes to it
 * until the orchestrator adds the command): a living, placed seat lights or puts out the light it holds.
 */
export function handleLight(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const p = simOf(room).players.get(sessionId);
  const player = room.state.players.get(sessionId);
  if (!p || !player || p.dead || !p.placed || typeof payload.on !== 'boolean') {
    reject(room, sessionId, ErrorCode.cannot, 'not now');
    return;
  }
  if (payload.on && !holdsLight(player)) {
    reject(room, sessionId, ErrorCode.cannot, 'no light');
    return;
  }
  setLight(room, sessionId, payload.on);
}

/** Every light goes out (the lobby and every Start). */
export function resetLights(room: PartyRoom): void {
  litOf(room).clear();
}

/** The scene light kinds that are flames, which creatures flee (moss, moonlight and daylight shafts are not). */
const FLAMES: ReadonlySet<string> = new Set(['lantern', 'torch', 'lamp', 'fire']);

/** A scene light burning in this part of the day (no `phases`: always). */
const burns = (phases: readonly DayPart[] | undefined, part: DayPart): boolean =>
  phases === undefined || phases.includes(part);

/** The scene's lights burning now, as pixel centres and radii; `flames` keeps only the flame kinds. */
export function burningLights(
  scene: Scene,
  part: DayPart,
  tilePx: number,
  flames: boolean,
): { x: number; y: number; r: number }[] {
  return (scene.lights ?? [])
    .filter((l) => burns(l.phases, part) && (!flames || FLAMES.has(l.kind)))
    .map((l) => ({ x: (l.x + 0.5) * tilePx, y: (l.y + 0.5) * tilePx, r: l.radiusTiles * tilePx }));
}
