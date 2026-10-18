import { StateView } from '@colyseus/schema';
import { VIEW_TAG } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { isAiming } from './NightPowers';
import { simOf } from './RoomSim';
import { SCENE_KEYS, isLoft, isWorldPhase, sceneKey } from './World';

export { SCENE_KEYS, sceneKey };

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
  const scene = room.state.scenes.get(sceneKey(player.sceneId));
  if (scene) {
    view.add(scene);
    simOf(room).views.set(sessionId, { scene: sceneKey(player.sceneId), presences: new Set() });
  }
  return view;
}

/**
 * V1 scene-scoped reconcile, run every 4th tick (5 Hz) and right after a portal crossing. Each client's
 * view holds the SceneState of its own scene and the presence of the other placed players who share it.
 * A player mid-crossing is also encoded to the scene they just left until the transit ends, so the
 * sprite is seen stepping through the door from both sides (GDD 3.7).
 */
export function reconcileViews(room: PartyRoom): void {
  const sim = simOf(room);
  const tick = room.state.tick;
  const world = isWorldPhase(room.state.phase);
  for (const client of room.clients) {
    const view = client.view;
    const viewer = room.state.players.get(client.sessionId);
    const viewerSim = sim.players.get(client.sessionId);
    if (!view || !viewer || !viewerSim) continue;
    let held = sim.views.get(client.sessionId);
    if (!held) {
      held = { scene: null, presences: new Set() };
      sim.views.set(client.sessionId, held);
    }

    // The sim's scene, never the public one: a ghost's public scene is frozen until its death is public.
    const want = isLoft(viewerSim.sceneIdx) ? null : sceneKey(viewerSim.sceneIdx);
    if (held.scene !== want) {
      const old = held.scene === null ? undefined : room.state.scenes.get(held.scene);
      if (old) view.remove(old);
      const next = want === null ? undefined : room.state.scenes.get(want);
      if (next) view.add(next);
      held.scene = want;
    }

    const wanted = new Set<string>();
    // A Gamekeeper aiming its Last Shot sees nobody until the aim closes (GDD 3.2; 5G's `isAiming`).
    if (world && !isAiming(room, client.sessionId)) {
      for (const [id, other] of room.state.players) {
        if (id === client.sessionId) continue;
        const p = sim.players.get(id);
        if (!p?.placed) continue;
        // A sleeper in the loft is encoded to nobody, and sees nobody (A39).
        if (isLoft(p.sceneIdx) || isLoft(viewerSim.sceneIdx)) continue;
        // A living viewer never receives a ghost; a ghost sees everyone in its scene (A30).
        if (p.dead && !viewerSim.dead) continue;
        const sameScene = p.sceneIdx === viewerSim.sceneIdx;
        const justLeft = p.transitFrom === viewerSim.sceneIdx && tick < other.presence.transitUntilTick;
        if (sameScene || justLeft) wanted.add(id);
      }
    }
    for (const id of held.presences) {
      if (wanted.has(id)) continue;
      const other = room.state.players.get(id);
      if (other) view.remove(other, PRESENCE_TAG);
      held.presences.delete(id);
    }
    for (const id of wanted) {
      if (held.presences.has(id)) continue;
      const other = room.state.players.get(id);
      if (other) view.add(other, PRESENCE_TAG);
      held.presences.add(id);
    }
  }
}
