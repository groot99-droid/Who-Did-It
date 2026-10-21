import type { AvatarState } from '@wdi/shared';
import type { SceneId } from '@wdi/content';
import { rehandle } from '../src/sim/Avatars';
import { type Bot, type Match, stateOf } from './simHelpers';

// Round 5 (5F): tests name Kill and Bandage targets by avatar handle, as clients do (GDD 3.17).

/** The seat's current avatar handle, read from room memory's `Private.avatar` at the time of the call. */
export const handleOf = (m: Match, bot: Bot): string => m.room.state.players.get(bot.id)?.priv.avatar ?? '';

/** Every avatar a bot's client holds, by scene and handle (the decoded `SceneState.avatars` of its view). */
export function avatarsHeld(bot: Bot): Array<{ scene: string; handle: string; avatar: AvatarState }> {
  const out: Array<{ scene: string; handle: string; avatar: AvatarState }> = [];
  stateOf(bot).scenes.forEach((scene, sceneId) => {
    scene.avatars?.forEach((avatar, handle) => out.push({ scene: sceneId as SceneId, handle, avatar }));
  });
  return out;
}

/** The handles a bot's client holds, sorted. */
export const handlesHeld = (bot: Bot): string[] =>
  avatarsHeld(bot)
    .map((a) => a.handle)
    .sort();

/**
 * White-box: gives seats that a test moved directly (`teleport`) the avatar of their new scene at once, instead of
 * on the next step, so a handle read right after the move is a current one.
 */
export function settle(m: Match, ...bots: Bot[]): void {
  for (const bot of bots) rehandle(m.room, bot.id, false);
}
