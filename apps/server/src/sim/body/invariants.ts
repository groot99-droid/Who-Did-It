import { balance } from '@wdi/content';
import type { InvariantFailure } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { registerInvariant } from '../auto/invariants';
import { simOf } from '../RoomSim';
import { isWorldPhase } from '../World';
import { bodies } from './state';

/**
 * The body invariant (round 8, 8A; GDD 3.22, docs/round8/body.md 8), registered beside round 6's seven checks and
 * round 7's four and read by `pnpm auto`, the soak and the admin room: every body's health and stamina within its
 * bounds, no dead seat with a body in memory or on its wire, and every living seat with a body while the world runs.
 *
 * It registers on a call, not on import: `auto/invariants.ts` reaches every body module through the handlers
 * (`AdminView` → `Auto` → the lobby handler → `Chat` → `run.ts`), so a check that registered while that module
 * loads would find its registry still uninitialised. `runBody` calls it on every tick (a boolean after the first)
 * and `tools/auto/checks` before it counts the registered checks.
 */

const fail = (room: PartyRoom, detail: string): InvariantFailure => ({
  name: '',
  tick: room.state.tick,
  detail,
});

const within = (n: number, max: number): boolean => Number.isFinite(n) && n >= 0 && n <= max;

/** The tick a dead seat was first seen with a body: the next body stage drops it, so one tick is no failure. */
const lingering = new WeakMap<PartyRoom, Map<string, number>>();
const lingeringOf = (room: PartyRoom): Map<string, number> => {
  let m = lingering.get(room);
  if (!m) lingering.set(room, (m = new Map()));
  return m;
};

let registered = false;

export function registerBodyInvariant(): void {
  if (registered) return;
  registered = true;
  registerInvariant('bodyBounds', bodyBounds);
}

function bodyBounds(room: PartyRoom): InvariantFailure | null {
  const sim = simOf(room);
  const b = balance.body;
  for (const [id, body] of bodies(room)) {
    if (!within(body.hp, body.maxHp) || !within(body.stamina, body.maxStamina))
      return fail(room, `${id}: health ${body.hp}/${body.maxHp}, stamina ${body.stamina}/${body.maxStamina}`);
    for (const [effect, on] of body.effects)
      if (on.stacks < 1 || !Number.isFinite(on.untilTick) || on.untilTick < 0)
        return fail(room, `${id}: ${effect} with ${on.stacks} stacks until tick ${on.untilTick}`);
    if (body.figure) continue;
    if (body.maxHp !== b.maxHp || body.maxStamina !== b.maxStamina)
      return fail(room, `${id}: a seat's bounds are ${body.maxHp}/${body.maxStamina}, not the body's`);
    const p = sim.players.get(id);
    if (!p || p.dead) {
      // A death lands anywhere in the step; `publishBodies` drops the body at the next body stage, not before.
      const since = lingeringOf(room).get(id) ?? room.state.tick;
      lingeringOf(room).set(id, since);
      if (room.state.tick > since) return fail(room, `${id}: a body on a ${p ? 'dead' : 'missing'} seat`);
    } else lingeringOf(room).delete(id);
  }
  for (const [id, p] of sim.players) {
    const wire = room.state.players.get(id)?.priv.body;
    const since = lingeringOf(room).get(id) ?? room.state.tick;
    if (p.dead && wire && (wire.hp !== 0 || wire.effects.length !== 0) && room.state.tick > since)
      return fail(
        room,
        `${id}: a dead seat still reads health ${wire.hp} with ${wire.effects.length} effects`,
      );
    if (!p.dead && isWorldPhase(room.state.phase) && bodies(room).size > 0 && !bodies(room).has(id))
      return fail(room, `${id}: a living seat without a body`);
  }
  return null;
}
