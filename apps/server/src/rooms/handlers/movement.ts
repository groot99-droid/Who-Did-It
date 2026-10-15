import { Door, Phase } from '@wdi/shared';
import type { PartyRoom } from '../PartyRoom';
import { simOf } from '../../sim/RoomSim';
import { SCENE_KEYS, sceneDef } from '../../sim/World';

/**
 * Called once from `PartyRoom.onCreate`. Seeds the door entries of every SceneState from the scene
 * graph and (only with WDI_DEBUG=1) registers the start helper the bot soak and the tests use. It adds
 * no handlers for game messages: `input.move` and `act.enterPortal` ride the command queue and are
 * consumed inside `step()`.
 */
export function registerMovement(room: PartyRoom): void {
  for (const key of SCENE_KEYS) {
    const state = room.state.scenes.get(key);
    if (!state) continue;
    for (const portal of sceneDef(key).portals) {
      const door = new Door();
      door.id = portal.id;
      state.doors.set(portal.id, door);
    }
  }
  if (process.env.WDI_DEBUG !== '1') return;

  // debug.play: skip the lobby flow. The callback only raises a flag; the step starts the world.
  room.onMessage('debug.play', () => {
    simOf(room).debugPlay = true;
  });
}

/** Consumed by `step()`: moves a lobby straight to the grace phase when `debug.play` asked for it. */
export function runDebugStart(room: PartyRoom): void {
  const sim = simOf(room);
  if (!sim.debugPlay) return;
  sim.debugPlay = false;
  if (room.state.phase < Phase.grace) room.state.phase = Phase.grace;
}
