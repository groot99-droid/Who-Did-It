import { balance, scenes, tasks, type SceneId } from '@wdi/content';
import { TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { mapScenesOf } from '../MapSites';
import { recomputeTaskBar } from '../Minigames';
import { type PlayerSim, simOf } from '../RoomSim';
import { isVerbPhase, profileOpen, sceneKey, tileCentre } from '../World';
import { activeBody, emitStep, progressOf } from './progress';

/**
 * Sabotage, the Activist against the company (GDD 3.20): still seconds within verb reach of a task's target prop
 * tamper with it; enough targets wreck the works, which undoes finished real tasks (the bar falls) and readies the
 * Knife. Session 7H.
 */

export interface Target {
  scene: SceneId;
  prop: string;
  x: number;
  y: number;
}

/** Every task target prop of the match's map present at its profile, each once, in `tasks.json` order. */
export function sabotageTargets(room: PartyRoom): Target[] {
  const map = new Set<string>(mapScenesOf(room));
  const profile = simOf(room).profile;
  const out: Target[] = [];
  for (const task of Object.values(tasks.tasks)) {
    for (const t of task.targets ?? []) {
      const scene = scenes[t.scene as SceneId];
      const prop = scene?.props.find((q) => q.id === t.prop);
      if (!scene || !prop || !map.has(t.scene) || out.some((o) => o.prop === prop.id)) continue;
      if (!profileOpen(scene.profile, profile) || (prop.profiles && !prop.profiles.includes(profile)))
        continue;
      out.push({ scene: t.scene as SceneId, prop: prop.id, x: prop.x, y: prop.y });
    }
  }
  return out;
}

const within = (p: PlayerSim, t: Target): boolean =>
  Math.hypot(p.x - tileCentre(t.x, TILE_PX), p.y - tileCentre(t.y, TILE_PX)) <=
  balance.doors.reachTiles * TILE_PX;

/** Step stage (`runVendettas`): the hold at a target, the tampering and the wreck. */
export function runSabotage(room: PartyRoom, seat: string): void {
  const prog = progressOf(room, seat);
  if (prog.over) return;
  const me = activeBody(room, seat);
  const last = prog.last;
  prog.last = me ? { scene: me.sceneIdx, x: me.x, y: me.y } : null;
  const still = me && last && last.scene === me.sceneIdx && last.x === me.x && last.y === me.y;
  const at =
    me && still && isVerbPhase(room.state.phase)
      ? sabotageTargets(room).find(
          (t) => sceneKey(me.sceneIdx) === t.scene && !prog.tampered.includes(t.prop) && within(me, t),
        )
      : undefined;
  if (!at) {
    prog.holding = null;
    return;
  }
  prog.holding =
    prog.holding?.prop === at.prop
      ? { prop: at.prop, ticks: prog.holding.ticks + 1 }
      : { prop: at.prop, ticks: 1 };
  if (prog.holding.ticks < balance.vendettas.sabotage.tamperS * TICK_RATE) return;
  prog.holding = null;
  prog.tampered.push(at.prop);
  emitStep(room, seat, 'vendetta.sabotage.tampered', at.scene);
  if (prog.tampered.length >= balance.vendettas.sabotage.stations) wreck(room, seat);
}

/** The consequence: `undoTasks` finished real tasks undone (from the holder's stream), the bar, the Knife ready. */
function wreck(room: PartyRoom, seat: string): void {
  const done = [...room.state.players.values()].flatMap((p) =>
    [...(p.priv?.tasks ?? [])].filter((t) => !t.fake && t.done),
  );
  const rng = room.seeds.get('vendetta', seat);
  for (let n = 0; n < balance.vendettas.sabotage.undoTasks && done.length > 0; n++) {
    const [task] = done.splice(Math.min(done.length - 1, Math.floor(rng() * done.length)), 1);
    if (task) task.done = false;
  }
  recomputeTaskBar(room);
  room.state.players.get(seat)?.priv?.cooldownEndTick.set('kill', room.state.tick);
  emitStep(room, seat, 'vendetta.sabotage.wrecked');
}
