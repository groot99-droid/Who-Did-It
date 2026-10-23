import { randomBytes } from 'node:crypto';
import { AVATAR_HANDLE_BYTES, Avatar, type AvatarState, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { StatusBit } from './constants';
import { settleDisguise } from './Impersonate';
import { lightBurns } from './mobs/light';
import { type PlayerSim, simOf } from './RoomSim';
import { reconcileNear } from './Visibility';
import { sceneKey } from './World';

// Avatars and handles (GDD 3.17, round-5 `deck-wire.md` 4.1). Every placed seat walks its scene as
// an `Avatar` keyed by an opaque handle that is re-rolled on every scene entry and every death. The handle memory
// (seat <-> handle, the transit tails, the used set, the disguises) lives here in room memory, never in a schema.

/** A disguise (GDD 3.17, `deck-wire.md` 4.5); `Impersonate.ts` owns the rules, the memory lives with the handles. */
export interface Disguise {
  /** The borrowed seat. */
  as: string;
  /** False while the change waits to happen unseen. */
  applied: boolean;
  /** A second Impersonate, the run's end or daybreak asked it to drop. */
  dropRequested: boolean;
  /** A pending disguise not applied by then is cancelled. */
  applyByTick: number;
  /** Set when applied: the run's end. */
  untilTick: number;
}

interface Leaving {
  seat: string;
  scene: string;
  untilTick: number;
}

interface AvatarMemory {
  /** Seat -> its current handle. */
  handleOf: Map<string, string>;
  /** Every handle in a scene's `avatars` (current and leaving) -> its seat. */
  seatOf: Map<string, string>;
  /** Every handle in a scene's `avatars` -> the scene key it lives in. */
  sceneOf: Map<string, string>;
  /** Handle -> the transit tail an avatar keeps in the scene a seat just left. */
  leaving: Map<string, Leaving>;
  /** Every handle of the match. */
  used: Set<string>;
  /** Seat -> impersonation. */
  disguise: Map<string, Disguise>;
}

const memories = new WeakMap<PartyRoom, AvatarMemory>();

/** The room's handle memory; `Impersonate.ts` reads the disguises through it. */
export function avatarMemory(room: PartyRoom): AvatarMemory {
  let memory = memories.get(room);
  if (!memory) {
    memory = {
      handleOf: new Map(),
      seatOf: new Map(),
      sceneOf: new Map(),
      leaving: new Map(),
      used: new Set(),
      disguise: new Map(),
    };
    memories.set(room, memory);
  }
  return memory;
}

/** A handle never used in this match: 6 random bytes in base64url, from `node:crypto`, never a seeded stream. */
export function newHandle(room: PartyRoom): string {
  const memory = avatarMemory(room);
  for (;;) {
    const handle = randomBytes(AVATAR_HANDLE_BYTES).toString('base64url');
    if (memory.used.has(handle) || room.state.players.has(handle)) continue;
    memory.used.add(handle);
    return handle;
  }
}

/** The avatar a handle names, in the scene it lives in. */
export function avatarOf(room: PartyRoom, handle: string): AvatarState | undefined {
  const scene = avatarMemory(room).sceneOf.get(handle);
  return scene === undefined ? undefined : room.state.scenes.get(scene)?.avatars.get(handle);
}

/** Drops one handle from its scene and from every map. */
function removeHandle(room: PartyRoom, handle: string): void {
  const memory = avatarMemory(room);
  const scene = memory.sceneOf.get(handle);
  if (scene !== undefined) room.state.scenes.get(scene)?.avatars.delete(handle);
  const seat = memory.seatOf.get(handle);
  if (seat !== undefined && memory.handleOf.get(seat) === handle) memory.handleOf.delete(seat);
  memory.seatOf.delete(handle);
  memory.sceneOf.delete(handle);
  memory.leaving.delete(handle);
}

/**
 * Copies the seat's own presence onto its avatar: position, animation, status bits (the ghost bit for a dead seat),
 * the height it is drawn at, the face it shows and, for ghosts only, its true seat. Blood goes to `nearBits`, which
 * only a view in range receives (round 8, 8L; `reconcileAvatars`). Unchanged values cost no bytes.
 */
function writeAvatar(
  avatar: AvatarState,
  seat: string,
  player: PlayerState,
  p: PlayerSim,
  lookOf: string,
): void {
  const presence = player.presence;
  avatar.lookOf = lookOf;
  avatar.height = player.traits.height;
  avatar.x = presence.x;
  avatar.y = presence.y;
  avatar.z = presence.z;
  avatar.yaw = presence.yaw;
  avatar.animId = presence.animId;
  avatar.statusBits = (presence.statusBits & ~NEAR_BITS) | (p.dead ? StatusBit.ghost : 0);
  avatar.nearBits = presence.statusBits & NEAR_BITS;
  avatar.transitUntilTick = presence.transitUntilTick;
  avatar.seat = seat;
}

/** The status bits an avatar carries in `nearBits` instead of `statusBits`: seen only from close by (GDD 3.4). */
export const NEAR_BITS = StatusBit.bloody;

/** The seat whose face `seat` shows: its own, or the seat it impersonates while the disguise is applied. */
function faceOf(room: PartyRoom, seat: string): string {
  const disguise = avatarMemory(room).disguise.get(seat);
  return disguise?.applied ? disguise.as : seat;
}

/**
 * A new handle for `seat` in its current scene: from `enterScene` (every crossing and placement; `transit` leaves
 * the old avatar at the door until its transit ends) and from `markDead`. The seat's old avatar is deleted, or with
 * `transit` frozen in the old scene with the transit bit until `Presence.transitUntilTick`; a new `Avatar` is created
 * in the scene of `PlayerSim.sceneIdx` and `Private.avatar` follows. `settle` is false for the re-handles that are
 * not a scene entry or a death (a disguise applying or dropping, a repair).
 */
export function rehandle(room: PartyRoom, seat: string, transit: boolean, settle = true): void {
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!player || !p) return;
  const memory = avatarMemory(room);
  // A scene entry settles the disguise first (a pending one applies, one asked to drop drops); a death ends it.
  if (settle) settleDisguise(room, seat);
  const old = memory.handleOf.get(seat);
  if (old !== undefined) {
    const avatar = avatarOf(room, old);
    if (transit && avatar) {
      avatar.statusBits |= StatusBit.transit;
      avatar.transitUntilTick = player.presence.transitUntilTick;
      avatar.animId = 0;
      memory.handleOf.delete(seat);
      memory.leaving.set(old, {
        seat,
        scene: memory.sceneOf.get(old) as string,
        untilTick: player.presence.transitUntilTick,
      });
    } else {
      removeHandle(room, old);
    }
  }
  const scene = sceneKey(p.sceneIdx);
  const sceneState = room.state.scenes.get(scene);
  if (sceneState) {
    const handle = newHandle(room);
    const avatar = new Avatar();
    writeAvatar(avatar, seat, player, p, faceOf(room, seat));
    sceneState.avatars.set(handle, avatar);
    memory.handleOf.set(seat, handle);
    memory.seatOf.set(handle, seat);
    memory.sceneOf.set(handle, scene);
    player.priv.avatar = handle;
  }
  simOf(room).viewsDirty = true;
}

/**
 * After the movement stage every tick (`Step.ts`): copies each placed seat's presence onto its current avatar, with
 * `lookOf`, `height`, the ghost bit and the ghost-only `seat`; ends the transit tails that ran out. A seat whose
 * avatar is missing or stands in another scene than its sim (a test that moves a seat directly) is re-handled.
 */
export function publishAvatars(room: PartyRoom): void {
  const sim = simOf(room);
  const memory = avatarMemory(room);
  const tick = room.state.tick;
  for (const [handle, tail] of memory.leaving) {
    if (tick < tail.untilTick) continue;
    removeHandle(room, handle);
    sim.viewsDirty = true;
  }
  for (const [seat, p] of sim.players) {
    const player = room.state.players.get(seat);
    if (!player || !p.placed) continue;
    const handle = memory.handleOf.get(seat);
    const avatar = handle === undefined ? undefined : avatarOf(room, handle);
    if (!avatar || memory.sceneOf.get(handle as string) !== sceneKey(p.sceneIdx)) {
      rehandle(room, seat, false, false);
      continue;
    }
    // A strike or a death in transit leaves the door frozen; a plain tick copies the presence.
    writeAvatar(avatar, seat, player, p, faceOf(room, seat));
    if (lightBurns(room, seat)) avatar.statusBits |= StatusBit.lantern; // round 6, 6G: a lit light in hand
  }
  reconcileNear(room); // round 8, 8L: Blood reaches only the views in range, every tick
}

/**
 * The seat behind a handle a `target: 'player'` act names (Kill, Bandage): a current handle whose avatar is in the
 * actor's scene, or a transit tail there (the kill validator then refuses it as in transit); null for anything else:
 * an unknown or stale handle, a handle in another scene, the actor's own, or a value that is not a string.
 */
export function resolveHandle(room: PartyRoom, actorSeat: string, handle: unknown): string | null {
  if (typeof handle !== 'string') return null;
  const memory = avatarMemory(room);
  const seat = memory.seatOf.get(handle);
  const actor = simOf(room).players.get(actorSeat);
  if (!actor) return null;
  if (seat === undefined) return null;
  if (seat === actorSeat) return null;
  return memory.sceneOf.get(handle) === sceneKey(actor.sceneIdx) ? seat : null;
}

/** `resetToLobby` (through `resetCoversForLobby`): every avatar, handle and disguise goes. */
export function resetAvatarsForLobby(room: PartyRoom): void {
  const memory = avatarMemory(room);
  for (const handle of [...memory.sceneOf.keys()]) removeHandle(room, handle);
  memory.handleOf.clear();
  memory.used.clear();
  memory.disguise.clear();
}
