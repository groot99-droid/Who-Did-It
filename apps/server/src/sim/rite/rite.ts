import { balance, scenes } from '@wdi/content';
import { Avatar, Phase, S2C, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { avatarMemory, avatarOf, newHandle } from '../Avatars';
import { AnimId } from '../constants';
import { onSim } from '../events/bus';
import { mapScenesOf } from '../MapSites';
import { refusal, sendRefusal, type Refusal } from '../refusal';
import { simOf } from '../RoomSim';
import { isWorldPhase, sceneIndex, tileCentre } from '../World';
import { isShade, shadeOf } from './shade';

/**
 * The Medium and its rite (story R3, GDD 3.20, DECISIONS A602; `docs/story/rite.md`). The Medium is an NPC gate,
 * not a card and not a seat: one figure standing at `balance.rite.site` from the first world phase of a match on a
 * map that holds the site's scene. It has no seat, no deal, no stream and no body, so nothing can strike or kill it.
 * Its avatar is a figure's (`villager` look, no seat, no status bit), shown by the dark rule like any figure
 * (`Visibility.ts`). The rite is a hold at the Medium: the match's shade (`shade.ts`) within `rite.reachTiles` of it
 * sends `act.hold { action: 'rite', targetId: <the Medium's handle> }`; the rite then runs `rite.holdS` and cannot
 * be interrupted (the shade stands still, a release changes nothing, nothing reaches a shade). It costs nothing. Its
 * messages go to the shade alone: `rite { stage: 'open', medium }` once it is a shade, `begun` and `done`.
 * Room memory only; R4 reads `riteDone` for the return.
 */
const MEDIUM_LOOK = 'villager';
export const RITE_HOLD = 'rite';

interface RiteMemory {
  /** The Medium's avatar handle, or null outside a match or on a map without the site. */
  handle: string | null;
  /** The shade the `open` message went to. */
  told: string | null;
  /** The rite under way: its seat and the tick it is done on. */
  running: { seat: string; endTick: number } | null;
  /** The seat whose rite is done this match. */
  done: string | null;
}

const memories = new WeakMap<PartyRoom, RiteMemory>();

function memoryOf(room: PartyRoom): RiteMemory {
  let memory = memories.get(room);
  if (memory) return memory;
  memories.set(room, (memory = { handle: null, told: null, running: null, done: null }));
  const m = memory;
  onSim(room, 'start', () => {
    m.told = null;
    m.running = null;
    m.done = null;
  });
  return memory;
}

/** Whether `seat`'s rite is done this match (R4's return reads it). */
export const riteDone = (room: PartyRoom, seat: string): boolean => memories.get(room)?.done === seat;

/** The Medium's avatar handle, or null (`Visibility.ts` shows it like a figure). */
export const mediumHandle = (room: PartyRoom): string | null => memories.get(room)?.handle ?? null;

/** Where the Medium stands: the site's scene index and pixel point, or null when the site is not a spawn. */
function siteOf(): { sceneIdx: number; x: number; y: number } | null {
  const { scene, spawn } = balance.rite.site;
  const sp = scenes[scene as keyof typeof scenes]?.spawns.find((s) => s.id === spawn);
  if (!sp) return null;
  return { sceneIdx: sceneIndex(scene), x: tileCentre(sp.x, TILE_PX), y: tileCentre(sp.y, TILE_PX) };
}

/** The Medium as a `Sighted` for the dark rule, or null when it does not stand in this match. */
export function mediumSighted(room: PartyRoom): { sceneIdx: number; x: number; y: number } | null {
  return mediumHandle(room) === null ? null : siteOf();
}

function dropMedium(room: PartyRoom, memory: RiteMemory): void {
  const handle = memory.handle;
  if (handle === null) return;
  const scene = avatarMemory(room).sceneOf.get(handle);
  if (scene !== undefined) room.state.scenes.get(scene)?.avatars.delete(handle);
  avatarMemory(room).sceneOf.delete(handle);
  memory.handle = null;
  simOf(room).viewsDirty = true;
}

/** Puts the Medium's avatar at the site, once (and again if the lobby's sweep took it). */
function standMedium(room: PartyRoom, memory: RiteMemory): void {
  if (memory.handle !== null && avatarOf(room, memory.handle)) return;
  const site = siteOf();
  const scene = balance.rite.site.scene;
  if (!site || !mapScenesOf(room).includes(scene as never)) return;
  const sceneState = room.state.scenes.get(scene);
  if (!sceneState) return;
  const handle = newHandle(room);
  const avatar = new Avatar();
  avatar.lookOf = MEDIUM_LOOK;
  avatar.height = balance.townsfolk.height;
  avatar.x = Math.round(site.x);
  avatar.y = Math.round(site.y);
  avatar.animId = AnimId.idle;
  sceneState.avatars.set(handle, avatar);
  avatarMemory(room).sceneOf.set(handle, scene);
  memory.handle = handle;
  simOf(room).viewsDirty = true;
}

/** Every tick (from `runMemorial`): the Medium stands in a match, the shade is told, a running rite ends. */
export function runRite(room: PartyRoom): void {
  const memory = memoryOf(room);
  if (room.state.phase === Phase.lobby) return dropMedium(room, memory);
  if (isWorldPhase(room.state.phase)) standMedium(room, memory);
  const shade = shadeOf(room);
  if (shade !== null && memory.told !== shade && memory.handle !== null) {
    memory.told = shade;
    room.clients.getById(shade)?.send(S2C.rite, { stage: 'open', medium: memory.handle });
  }
  const running = memory.running;
  if (running && room.state.tick >= running.endTick) {
    memory.running = null;
    memory.done = running.seat;
    room.clients.getById(running.seat)?.send(S2C.rite, { stage: 'done' });
  }
}

/** Why `seat` may not begin the rite at `handle` now, or null. */
function riteProblem(room: PartyRoom, seat: string, handle: string, memory: RiteMemory): Refusal | null {
  const p = simOf(room).players.get(seat);
  if (!p || !isShade(room, seat)) return refusal('NOT_IN_PLAY');
  if (memory.running !== null || memory.done === seat) return refusal('ALREADY_DONE');
  const site = siteOf();
  if (memory.handle === null || handle !== memory.handle || !site) return refusal('NOTHING_THERE');
  if (p.sceneIdx !== site.sceneIdx) return refusal('NOTHING_THERE');
  if (Math.hypot(p.x - site.x, p.y - site.y) > balance.rite.reachTiles * TILE_PX)
    return refusal('TOO_FAR', { of: 'person' });
  return null;
}

/** `act.hold { action: 'rite', targetId }` (`Hold.ts`, inside the step): the shade begins the rite at the Medium. */
export function handleRiteHold(room: PartyRoom, seat: string, handle: string): void {
  const memory = memoryOf(room);
  const problem = riteProblem(room, seat, handle, memory);
  if (problem) return sendRefusal(room, seat, problem);
  const p = simOf(room).players.get(seat)!;
  const endTick = room.state.tick + Math.round(balance.rite.holdS * TICK_RATE);
  memory.running = { seat, endTick };
  p.busyUntilTick = Math.max(p.busyUntilTick, endTick); // it stands still until the rite is done
  p.input = null;
  p.hold = null;
  room.clients.getById(seat)?.send(S2C.rite, { stage: 'begun', endsTick: endTick });
}
