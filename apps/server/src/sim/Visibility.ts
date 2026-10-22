import { StateView } from '@colyseus/schema';
import { VIEW_TAG } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { avatarMemory, avatarOf } from './Avatars';
import { isAiming } from './NightPowers';
import { type PlayerSim, simOf } from './RoomSim';
import { isAdminClient, reconcileAdminView } from './auto/AdminView';
import { canSee } from './Sight';
import { SCENE_KEYS, isLoft, isWorldPhase, sceneKey } from './World';

export { SCENE_KEYS, sceneKey };

/** The avatars one client's view holds (round 5): `plain` with the default tag, `ghost` also with the ghost tag. */
interface HeldAvatars {
  plain: Set<string>;
  ghost: Set<string>;
}
const heldAvatars = new WeakMap<PartyRoom, Map<string, HeldAvatars>>();
function heldOf(room: PartyRoom, sessionId: string): HeldAvatars {
  let all = heldAvatars.get(room);
  if (!all) heldAvatars.set(room, (all = new Map()));
  let held = all.get(sessionId);
  if (!held) all.set(sessionId, (held = { plain: new Set(), ghost: new Set() }));
  return held;
}

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
  for (const client of room.clients) {
    // Round 6, 6C (locked): the admin room's seatless client takes the god view and nothing below.
    if (isAdminClient(room, client.sessionId)) {
      reconcileAdminView(room, client);
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

    const want = isLoft(viewerSim.sceneIdx) ? null : sceneKey(viewerSim.sceneIdx);
    if (held.scene !== want) {
      const old = held.scene === null ? undefined : room.state.scenes.get(held.scene);
      if (old) view.remove(old);
      const next = want === null ? undefined : room.state.scenes.get(want);
      if (next) view.add(next);
      held.scene = want;
    }

    reconcileAvatars(room, client.sessionId, view, viewerSim, world);
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
  if (world && !isAiming(room, sessionId) && !isLoft(viewerSim.sceneIdx)) {
    const scene = room.state.scenes.get(sceneKey(viewerSim.sceneIdx));
    scene?.avatars.forEach((_avatar, handle) => {
      const seat = memory.seatOf.get(handle);
      const p = seat === undefined ? undefined : sim.players.get(seat);
      if (!p?.placed || isLoft(p.sceneIdx)) return;
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
    if (avatar) view.remove(avatar, VIEW_TAG.ghost);
    held.ghost.delete(handle);
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
}
