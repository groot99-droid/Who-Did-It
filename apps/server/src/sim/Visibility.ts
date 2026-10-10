import { StateView } from '@colyseus/schema';
import type { PartyRoom } from '../rooms/PartyRoom';

/** Scene keys by `Player.sceneId` index. The content session owns the real graph; M1 has one scene. */
export const SCENE_KEYS = ['overworld'] as const;

export const sceneKey = (sceneId: number): string => SCENE_KEYS[sceneId] ?? SCENE_KEYS[0];

/**
 * First view for a joining client: their own Player (so `priv` and `presence` arrive) and the
 * SceneState of their scene. Nobody else's `priv` or `presence` is ever added.
 */
export function createPlayerView(room: PartyRoom, sessionId: string): StateView {
  const view = new StateView();
  const player = room.state.players.get(sessionId);
  if (!player) return view;
  view.add(player);
  const scene = room.state.scenes.get(sceneKey(player.sceneId));
  if (scene) view.add(scene);
  return view;
}

/** V1 scene-scoped reconcile at 5 Hz; scene moves arrive with portals in M2. */
export function reconcileViews(_room: PartyRoom): void {}
