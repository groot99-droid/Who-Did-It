import type { Client } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import { clues } from '@wdi/content';
import { TILE_PX, VIEW_TAG } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { avatarMemory, avatarOf } from './Avatars';
import { isAiming } from './NightPowers';
import { type PlayerSim, simOf } from './RoomSim';
import { isAdminClient, reconcileAdminView } from './auto/AdminView';
import { canSee } from './Sight';
import { isOnLine } from './Train';
import { SCENE_KEYS, isWorldPhase, sceneKey } from './World';

export { SCENE_KEYS, sceneKey };

/**
 * The avatars one client's view holds (round 5): `plain` with the default tag, `ghost` also with the ghost tag,
 * `near` also with the near tag (round 8, 8L).
 */
interface HeldAvatars {
  plain: Set<string>;
  ghost: Set<string>;
  near: Set<string>;
}
const heldAvatars = new WeakMap<PartyRoom, Map<string, HeldAvatars>>();
function heldOf(room: PartyRoom, sessionId: string): HeldAvatars {
  let all = heldAvatars.get(room);
  if (!all) heldAvatars.set(room, (all = new Map()));
  let held = all.get(sessionId);
  if (!held) all.set(sessionId, (held = { plain: new Set(), ghost: new Set(), near: new Set() }));
  return held;
}

/**
 * Round 10, x14 (A453): the shadow viewers of an auto match run with `pnpm auto -- --views`, one per seat, reconciled
 * below exactly as a client's view is (`sim/auto/shadowViews.ts` encodes and decodes them). Empty in every real room:
 * a shadow is never a client, is never the admin, and nothing it holds reaches the wire.
 */
export interface ShadowViewer {
  sessionId: string;
  view: StateView;
}
const shadowViewers = new WeakMap<PartyRoom, ShadowViewer[]>();
const NO_SHADOWS: readonly ShadowViewer[] = [];
export function addShadowViewer(room: PartyRoom, viewer: ShadowViewer): void {
  let all = shadowViewers.get(room);
  if (!all) shadowViewers.set(room, (all = []));
  all.push(viewer);
}
export function clearShadowViewers(room: PartyRoom): void {
  shadowViewers.delete(room);
}
/** The clients, then the shadow viewers (x14): every view the room reconciles. */
const viewersOf = (room: PartyRoom): readonly (Client | ShadowViewer)[] => [
  ...room.clients,
  ...(shadowViewers.get(room) ?? NO_SHADOWS),
];

/**
 * `Player.presence` and `Player.priv` carry their own view tags so each can be granted alone: adding a
 * Player with the presence tag reveals where it stands and nothing else (not even an empty `priv`).
 */
export const PRESENCE_TAG = VIEW_TAG.presence;
export const PRIV_TAG = VIEW_TAG.priv;

/**
 * First view for a joining client: their own Player (so `priv` and `presence` arrive) and the
 * SceneState of their scene. Nobody else's `priv` or `presence` is ever added here.
 */
export function createPlayerView(room: PartyRoom, sessionId: string): StateView {
  const view = new StateView();
  const player = room.state.players.get(sessionId);
  if (!player) return view;
  view.add(player);
  view.add(player, PRESENCE_TAG);
  view.add(player, PRIV_TAG);
  const scene = room.state.scenes.get(sceneKey(player.priv.sceneId));
  if (scene) {
    view.add(scene);
    simOf(room).views.set(sessionId, { scene: sceneKey(player.priv.sceneId) });
  }
  heldAvatars.get(room)?.delete(sessionId); // a fresh view holds nothing yet
  return view;
}

/**
 * V1 scene-scoped reconcile, run every 4th tick (5 Hz) and right after a portal crossing. Each client's
 * view holds the SceneState of its own scene and the avatars of the placed players who share it (`reconcileAvatars`);
 * no other seat's `presence` or `priv` is ever added. A player mid-crossing stays in the scene it left as a transit
 * tail until the transit ends, so the figure is seen stepping through the door from both sides (GDD 3.7).
 */
export function reconcileViews(room: PartyRoom): void {
  const sim = simOf(room);
  const world = isWorldPhase(room.state.phase);
  for (const client of viewersOf(room)) {
    // Round 6, 6C (locked): the admin room's seatless client takes the god view and nothing below.
    if (isAdminClient(room, client.sessionId)) {
      reconcileAdminView(room, client as Client); // never a shadow (x14): the admin's id is no seat
      continue;
    }
    const view = client.view;
    const viewer = room.state.players.get(client.sessionId);
    const viewerSim = sim.players.get(client.sessionId);
    if (!view || !viewer || !viewerSim) continue;
    let held = sim.views.get(client.sessionId);
    if (!held) {
      held = { scene: null };
      sim.views.set(client.sessionId, held);
    }

    // Round 10 (C1): a seat on the line holds no avatar and no scene until the Train brings it back.
    const onLine = isOnLine(room, client.sessionId);
    const want = onLine ? null : sceneKey(viewerSim.sceneIdx);
    if (held.scene !== want) {
      const old = held.scene === null ? undefined : room.state.scenes.get(held.scene);
      if (old) view.remove(old);
      const next = want === null ? undefined : room.state.scenes.get(want);
      if (next) {
        view.add(next);
        // Round 6, 6G (contract item): `view.add` carries the scene's current avatars in with it; count them as held
        // so `reconcileAvatars` takes back, in this same pass, every one the viewer may not see (a ghost, the dark).
        const avatars = heldOf(room, client.sessionId).plain;
        next.avatars.forEach((_avatar, handle) => avatars.add(handle));
      }
      held.scene = want;
    }

    reconcileAvatars(room, client.sessionId, view, viewerSim, world && !onLine);
  }
}

/**
 * Avatars (GDD 3.17, `deck-wire.md` 4.2): in a world phase a view holds the avatars of the viewer's own scene whose
 * seat is placed, transit tails included; a living viewer skips the avatars of dead seats, a ghost viewer takes all
 * and also receives each one's true `seat`; a seat aiming its Last Shot (5G) and every phase outside the world hold
 * none. Each avatar is added one by one, never with the scene.
 */
function reconcileAvatars(
  room: PartyRoom,
  sessionId: string,
  view: StateView,
  viewerSim: PlayerSim,
  world: boolean,
): void {
  const sim = simOf(room);
  const memory = avatarMemory(room);
  const held = heldOf(room, sessionId);
  const ghostViewer = viewerSim.dead;
  const wanted = new Set<string>();
  if (world && !isAiming(room, sessionId) && viewerSim.blindUntilTick <= room.state.tick) {
    const scene = room.state.scenes.get(sceneKey(viewerSim.sceneIdx));
    scene?.avatars.forEach((_avatar, handle) => {
      const seat = memory.seatOf.get(handle);
      const p = seat === undefined ? undefined : sim.players.get(seat);
      if (!p?.placed) return;
      if (p.dead && !ghostViewer) return;
      // Round 6, 6G (locked): a living viewer in the dark sees only within its sight; this only ever removes.
      if (!ghostViewer && !canSee(room, viewerSim, p)) return;
      wanted.add(handle);
    });
  }
  // A deleted avatar (re-handled, dead, transit over) leaves the view with its map entry; only live ones are removed.
  for (const handle of [...held.ghost]) {
    if (ghostViewer && wanted.has(handle)) continue;
    const avatar = avatarOf(room, handle);
    if (avatar) {
      view.remove(avatar, VIEW_TAG.ghost);
      // Round 10, x4 (A333): in @colyseus/schema 5.0.36 `remove(obj, tag)` also hides the whole object from the
      // view (StateView.ts:752), so an avatar the viewer keeps is added back with the default tag, which re-sends
      // only the untagged fields it already holds.
      if (wanted.has(handle) && held.plain.has(handle)) view.add(avatar);
    }
    held.ghost.delete(handle);
  }
  for (const handle of [...held.near]) {
    if (wanted.has(handle)) continue;
    const avatar = avatarOf(room, handle);
    if (avatar) view.remove(avatar, VIEW_TAG.near);
    held.near.delete(handle);
  }
  for (const handle of [...held.plain]) {
    if (wanted.has(handle)) continue;
    const avatar = avatarOf(room, handle);
    if (avatar) view.remove(avatar);
    held.plain.delete(handle);
  }
  for (const handle of wanted) {
    const avatar = avatarOf(room, handle);
    if (!avatar) continue;
    if (!held.plain.has(handle)) {
      view.add(avatar);
      held.plain.add(handle);
    }
    if (ghostViewer && !held.ghost.has(handle)) {
      view.add(avatar, VIEW_TAG.ghost);
      held.ghost.add(handle);
    }
  }
  syncNear(room, held, view, viewerSim);
}

/** `clues.blood.params.visibleTiles` in px: the range Blood is seen from (GDD 3.4; the client's guard reads it too). */
export const NEAR_PX = (clues.clues.blood?.params?.visibleTiles ?? 0) * TILE_PX;

/**
 * Round 8 (8L, docs/round8/teardown.md 1): every tick, after the avatars are written (`publishAvatars`), each view
 * holds the near tag of exactly the avatars it holds that stand within `NEAR_PX` of the viewer, or all of them for a
 * ghost, so `Avatar.nearBits` (Blood) never reaches a client out of range, not even between two reconciles.
 */
export function reconcileNear(room: PartyRoom): void {
  const sim = simOf(room);
  for (const client of viewersOf(room)) {
    const viewerSim = sim.players.get(client.sessionId);
    if (!client.view || !viewerSim || isAdminClient(room, client.sessionId)) continue;
    syncNear(room, heldOf(room, client.sessionId), client.view, viewerSim);
  }
}

function syncNear(room: PartyRoom, held: HeldAvatars, view: StateView, viewerSim: PlayerSim): void {
  for (const handle of held.plain) {
    const avatar = avatarOf(room, handle);
    if (!avatar) continue;
    const near = viewerSim.dead || Math.hypot(avatar.x - viewerSim.x, avatar.y - viewerSim.y) <= NEAR_PX;
    if (near && !held.near.has(handle)) {
      view.add(avatar, VIEW_TAG.near);
      held.near.add(handle);
    } else if (!near && held.near.has(handle)) {
      view.remove(avatar, VIEW_TAG.near);
      // Round 10, x4 (A333): schema 5.0.36's `remove(obj, tag)` also hides `obj` (StateView.ts:752); without this
      // add-back the viewer's copy froze where it left the ring and never caught up or left (the production bug).
      view.add(avatar);
      held.near.delete(handle);
    }
  }
}
