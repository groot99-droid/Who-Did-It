import { type SceneId, abilities, balance, scenes } from '@wdi/content';
import { NoteKind, NotebookEntry, NotebookStatus, Snare, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { StateView } from '@colyseus/schema';
import type { PartyRoom } from '../rooms/PartyRoom';
import { avatarMemory, avatarOf } from './Avatars';
import { effectDef, applyEffect } from './body/effects';
import { bodyOf } from './body/state';
import { type Verb, seatInReach } from './body/verbs';
import { livingActor } from './Actions';
import { count, take } from './Inventory';
import { simOf } from './RoomSim';
import { townsfolkMemory } from './townsfolk/figures';
import { isOnLine } from './Train';
import { isWorldPhase, reject, sceneIndex, sceneKey, tileCentre } from './World';

// Snares and Rope (round 10, K6; GDD 3.5, scope.md 2.5, seams.md 3 row 31). Anyone holding a Snare sets it on the
// tile it stands on; the next seat or figure to walk onto the tile is held for `snare.params.holdS`, then Slowed, and
// the layer's Notebook names the look it saw drawn. A Rope frees a held seat in reach. A set snare is a scene prop
// sent only to its layer and to seats within `balance.snare.seeTiles`; nothing on the wire names its layer.

interface SetSnare {
  sceneIdx: number;
  tx: number;
  ty: number;
  layer: string;
  /** Walkers on the tile when it was set (the layer first); each is safe until it steps off. */
  clear: Set<string>;
}

interface SnareMemory {
  match: unknown;
  seq: number;
  snares: Map<string, SetSnare>;
  /** A held seat or figure id -> the tick its hold ends. */
  held: Map<string, number>;
  /** Per client: the scene its view holds and the snares added to it. */
  views: Map<string, { view: StateView; scene: string | null; ids: Set<string> }>;
}

const memories = new WeakMap<PartyRoom, SnareMemory>();
function memoryOf(room: PartyRoom): SnareMemory {
  let mem = memories.get(room);
  if (!mem) {
    mem = { match: room.seeds, seq: 0, snares: new Map(), held: new Map(), views: new Map() };
    memories.set(room, mem);
  }
  return mem;
}

const tileOf = (px: number): number => Math.floor(px / TILE_PX);
const holdTicks = (): number => Math.round((abilities.abilities.snare?.params?.holdS ?? 0) * TICK_RATE);

/** Whether a snare holds this seat or figure now (`body/run.ts` stops a held seat's feet; a Rope frees it). */
export const heldBySnare = (room: PartyRoom, id: string): boolean =>
  (memories.get(room)?.held.get(id) ?? 0) > room.state.tick;

/**
 * The checks of a snare or Rope verb: the row, a living, placed actor in a verb phase that may act, a body, and the
 * item in the pack. The card is never asked: the Townsfolk's Rope and the Ranger's Snare are what their cards show,
 * and anyone holding the item may use it (GDD 3.14), so neither verb tells a card. Null with the refusal sent.
 */
function openItemVerb(room: PartyRoom, sessionId: string, id: 'snare' | 'rope'): Verb | null {
  const def = abilities.abilities[id];
  const player = room.state.players.get(sessionId);
  if (!def || !player) return null;
  const actor = livingActor(room, sessionId);
  if (!actor) return null;
  const body = bodyOf(room, sessionId);
  if (!body) {
    reject(room, sessionId, 'DOWN_OR_STUNNED');
    return null;
  }
  if (count(player, id) < 1) {
    reject(room, sessionId, 'NEED_ITEM', { need: id });
    return null;
  }
  return { def, player, actor, body, tick: room.state.tick };
}

/** `act.ability {abilityId: 'snare' | 'rope'}` from the dispatch in `Actions.ts`. */
export function handleSnareAbility(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  if (payload.abilityId === 'rope') return freeWithRope(room, sessionId, payload.targetId);
  setSnare(room, sessionId);
}

/** Sets one Snare from the pack on the actor's tile: never on a portal, never on a tile that holds one already. */
function setSnare(room: PartyRoom, sessionId: string): void {
  const v = openItemVerb(room, sessionId, 'snare');
  if (!v) return;
  const mem = memoryOf(room);
  const sceneId = sceneKey(v.actor.sceneIdx);
  const tx = tileOf(v.actor.x);
  const ty = tileOf(v.actor.y);
  if (scenes[sceneId].portals.some((portal) => portal.x === tx && portal.y === ty)) {
    reject(room, sessionId, 'NO_WAY');
    return;
  }
  for (const s of mem.snares.values()) {
    if (s.sceneIdx === v.actor.sceneIdx && s.tx === tx && s.ty === ty) {
      reject(room, sessionId, 'ALREADY_DONE');
      return;
    }
  }
  const scene = room.state.scenes.get(sceneId);
  if (!scene || !take(v.player, 'snare', 1)) return;
  const id = `snare_${++mem.seq}`;
  const prop = new Snare();
  prop.id = id;
  prop.x = Math.round(tileCentre(tx, TILE_PX));
  prop.y = Math.round(tileCentre(ty, TILE_PX));
  scene.snares.set(id, prop);
  const clear = new Set(walkersOn(room, v.actor.sceneIdx, tx, ty));
  clear.add(sessionId);
  mem.snares.set(id, { sceneIdx: v.actor.sceneIdx, tx, ty, layer: sessionId, clear });
  simOf(room).viewsDirty = true;
}

/** Frees a held seat in reach with a Rope, which is kept. The actor's own figure is no target (`seatInReach`). */
function freeWithRope(room: PartyRoom, sessionId: string, handle: unknown): void {
  const v = openItemVerb(room, sessionId, 'rope');
  if (!v) return;
  const target = seatInReach(room, sessionId, v, handle);
  if (target === null) return;
  if (!heldBySnare(room, target)) {
    reject(room, sessionId, 'NOTHING_TO_CURE');
    return;
  }
  memoryOf(room).held.delete(target);
}

/** The living seats and figures standing on a tile of a scene: seat ids and figure ids. */
function walkersOn(room: PartyRoom, sceneIdx: number, tx: number, ty: number): string[] {
  const out: string[] = [];
  for (const [id, p] of simOf(room).players) {
    if (p.dead || !p.placed || p.sceneIdx !== sceneIdx || isOnLine(room, id)) continue;
    if (tileOf(p.x) === tx && tileOf(p.y) === ty) out.push(id);
  }
  for (const f of townsfolkMemory(room).figures.values()) {
    if (f.dead || f.handle === null || f.sceneIdx !== sceneIdx) continue;
    if (tileOf(f.x) === tx && tileOf(f.y) === ty) out.push(f.id);
  }
  return out;
}

/** The look a walker is drawn in: a seat's figure (its impersonation's face included), or a figure's own look. */
function drawnLook(room: PartyRoom, id: string): string {
  const figure = townsfolkMemory(room).figures.get(id);
  if (figure) return figure.look;
  const handle = avatarMemory(room).handleOf.get(id);
  const lookOf = handle === undefined ? id : (avatarOf(room, handle)?.lookOf ?? id);
  return room.state.players.get(lookOf)?.look ?? '';
}

/** The layer's own reading (row 31): the look it saw drawn and the snare's scene, never a seat. */
function logCatch(room: PartyRoom, layer: string, sceneIdx: number, look: string): void {
  const player = room.state.players.get(layer);
  const p = simOf(room).players.get(layer);
  if (!player?.priv || !p) return;
  const entry = new NotebookEntry();
  entry.id = `entry_${++p.entrySeq}`;
  entry.sceneId = sceneIdx;
  entry.tick = room.state.tick;
  entry.status = NotebookStatus.verified;
  entry.note = NoteKind.snared;
  entry.of = look;
  player.priv.notebook.push(entry);
}

/** A walker steps on a set snare: held, then Slowed (a seat), logged for the layer; the snare is spent. */
function spring(room: PartyRoom, mem: SnareMemory, id: string, snare: SetSnare, victim: string): void {
  const tick = room.state.tick;
  const until = tick + holdTicks();
  mem.held.set(victim, until);
  const figure = townsfolkMemory(room).figures.get(victim);
  if (figure) {
    figure.busyUntilTick = Math.max(figure.busyUntilTick, until);
    figure.moving = false;
  } else {
    const body = bodyOf(room, victim);
    // Slowed runs its full row after the hold (GDD 3.22); the hold's limp is its sign.
    if (body)
      applyEffect(
        room,
        victim,
        body,
        'slowed',
        holdTicks() + Math.round(effectDef('slowed').durationS * TICK_RATE),
      );
    const p = simOf(room).players.get(victim);
    if (p) p.vx = p.vy = 0;
  }
  logCatch(room, snare.layer, snare.sceneIdx, drawnLook(room, victim));
  room.state.scenes.get(sceneKey(snare.sceneIdx))?.snares.delete(id);
  mem.snares.delete(id);
  simOf(room).viewsDirty = true;
}

/**
 * Step stage after the views' reconcile (`sim/Step.ts`): a new match clears every snare; in a world phase each snare
 * springs on the first walker on its tile that was not there when it was set; then each view holds exactly the snares
 * row 31 sends it, in the same tick the scene's view changed, so no patch carries one it may not see.
 */
export function runSnares(room: PartyRoom): void {
  const mem = memoryOf(room);
  if (mem.match !== room.seeds) {
    mem.match = room.seeds;
    mem.snares.clear();
    mem.held.clear();
    room.state.scenes.forEach((scene) => scene.snares.clear());
  }
  const tick = room.state.tick;
  for (const [id, until] of mem.held) if (until <= tick) mem.held.delete(id);
  if (isWorldPhase(room.state.phase)) {
    for (const [id, snare] of [...mem.snares]) {
      const on = walkersOn(room, snare.sceneIdx, snare.tx, snare.ty);
      for (const w of [...snare.clear]) if (!on.includes(w)) snare.clear.delete(w);
      const victim = on.find((w) => !snare.clear.has(w));
      if (victim !== undefined) spring(room, mem, id, snare, victim);
    }
  }
  for (const client of room.clients)
    if (client.view) reconcileSnareView(room, mem, client.sessionId, client.view);
}

const seePx = (): number => balance.snare.seeTiles * TILE_PX;

function reconcileSnareView(room: PartyRoom, mem: SnareMemory, sessionId: string, view: StateView): void {
  const sim = simOf(room);
  const scene = sim.views.get(sessionId)?.scene ?? null;
  let held = mem.views.get(sessionId);
  if (!held) mem.views.set(sessionId, (held = { view, scene: null, ids: new Set() }));
  const state = scene === null ? undefined : room.state.scenes.get(scene);
  if (held.scene !== scene || held.view !== view) {
    // `view.add(scene)` (Visibility.ts, or a fresh view at a join) carried the scene's snares in with it: count them
    // held, so this same pass takes back every one the viewer may not see.
    held.view = view;
    held.scene = scene;
    held.ids = new Set(state ? [...state.snares.keys()] : []);
  }
  if (!state) return;
  const viewer = sim.players.get(sessionId);
  const idx = scene === null ? -1 : sceneIndex(scene as SceneId);
  const wanted = new Set<string>();
  for (const [id, s] of mem.snares) {
    if (s.sceneIdx !== idx || !viewer?.placed) continue;
    const prop = state.snares.get(id);
    if (!prop) continue;
    if (s.layer === sessionId || Math.hypot(prop.x - viewer.x, prop.y - viewer.y) <= seePx()) wanted.add(id);
  }
  for (const id of [...held.ids]) {
    if (wanted.has(id)) continue;
    const prop = state.snares.get(id);
    if (prop) view.remove(prop);
    held.ids.delete(id);
  }
  for (const id of wanted) {
    if (held.ids.has(id)) continue;
    const prop = state.snares.get(id);
    if (prop) view.add(prop);
    held.ids.add(id);
  }
}
