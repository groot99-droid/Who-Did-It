import type { ColyseusTestServer } from '@colyseus/testing';
import { type SceneId, balance, mobs, scenes } from '@wdi/content';
import { ItemStack, Phase, TICK_RATE, TILE_PX, segmentBlocked } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { bodyOf } from '../src/sim/body';
import { mobBodies } from '../src/sim/Mobs';
import { MobState, newMind, think } from '../src/sim/mobs/ai';
import { hpOf } from '../src/sim/mobs/hurt';
import { fleeCreature } from '../src/sim/mobs/flee';
import { lightBurns, setLight } from '../src/sim/mobs/light';
import { Brain } from '../src/sim/npc/memory';
import { simOf } from '../src/sim/RoomSim';
import type { FixedSeeds } from '../src/sim/seeds';
import { navGrid } from '../src/sim/World';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  standardParty,
  start,
  toWorld,
} from './npcHelpers';
import { fixSeeds } from './seedHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const CHASE = Math.round(balance.mobs.chaseS * TICK_RATE);
const noSenses = { light: false, prey: null, atGoal: false };

describe('the creature FSM (pure)', () => {
  it('idles for its pause, then roams; at its goal it idles for a fresh pause', () => {
    const mind = newMind();
    mind.idleUntilTick = 10;
    think(mind, noSenses, 9, CHASE, () => 5);
    expect(mind.state).toBe(MobState.idle);
    think(mind, noSenses, 10, CHASE, () => 5);
    expect(mind.state).toBe(MobState.roam);
    think(mind, { ...noSenses, atGoal: true }, 20, CHASE, () => 7);
    expect(mind).toMatchObject({ state: MobState.idle, idleUntilTick: 27 });
  });

  it('chases a sensed seat for at most chaseS, then heads home and rests as long before the next chase', () => {
    const mind = newMind();
    think(mind, { ...noSenses, prey: 'a' }, 100, CHASE, () => 1);
    expect(mind).toMatchObject({ state: MobState.chase, prey: 'a', chaseUntilTick: 100 + CHASE });
    think(mind, { ...noSenses, prey: 'a' }, 100 + CHASE - 1, CHASE, () => 1);
    expect(mind.state).toBe(MobState.chase);
    think(mind, { ...noSenses, prey: 'a' }, 100 + CHASE, CHASE, () => 1);
    expect(mind).toMatchObject({ state: MobState.roam, prey: null, homing: true });
    think(mind, { ...noSenses, prey: 'a' }, 100 + CHASE + 1, CHASE, () => 1);
    expect(mind.state).toBe(MobState.roam); // resting
    think(mind, { ...noSenses, prey: 'a' }, 100 + 2 * CHASE, CHASE, () => 1);
    expect(mind.state).toBe(MobState.chase);
  });

  it('drops a chase the moment the seat is lost', () => {
    const mind = newMind();
    think(mind, { ...noSenses, prey: 'a' }, 0, CHASE, () => 1);
    think(mind, noSenses, 1, CHASE, () => 1);
    expect(mind).toMatchObject({ state: MobState.roam, homing: true, restUntilTick: 1 + CHASE });
  });

  it('flees a flame from any state, and roams home once it is out of reach', () => {
    for (const from of [MobState.idle, MobState.roam, MobState.chase]) {
      const mind = { ...newMind(), state: from };
      think(mind, { light: true, prey: 'a', atGoal: false }, 5, CHASE, () => 1);
      expect(mind).toMatchObject({ state: MobState.flee, prey: null });
      think(mind, noSenses, 6, CHASE, () => 1);
      expect(mind).toMatchObject({ state: MobState.roam, homing: true });
    }
  });

  it('a creature that is not in the world never wakes on its own', () => {
    const mind = { ...newMind(), state: MobState.dead };
    think(mind, { light: true, prey: 'a', atGoal: true }, 5, CHASE, () => 1);
    expect(mind.state).toBe(MobState.dead);
  });
});

/** A floor tile of `scene` within `maxD` tiles of (x, y) with a clear line to it, at least `minD` away. */
function floorNear(room: PartyRoom, scene: SceneId, x: number, y: number, minD: number, maxD: number) {
  const grid = navGrid(scene, simOf(room).profile);
  const cx = (x + 0.5) * TILE_PX;
  const cy = (y + 0.5) * TILE_PX;
  for (let ty = 0; ty < grid.h; ty++)
    for (let tx = 0; tx < grid.w; tx++) {
      const d = Math.hypot(tx - x, ty - y);
      if (d < minD || d > maxD || grid.solidAt(tx, ty)) continue;
      if (segmentBlocked(grid, cx, cy, (tx + 0.5) * TILE_PX, (ty + 0.5) * TILE_PX)) continue;
      return { x: tx, y: ty };
    }
  throw new Error(`no floor near ${scene} ${x},${y}`);
}

/** One human and three NPC seats, every one a Townsfolk, in the world on the test's own steps; `seeds` pins streams. */
async function party4(seeds?: FixedSeeds): Promise<Party> {
  const party = await lobbyOf(colyseus, 1);
  for (let i = 0; i < 3; i++) await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  if (seeds) fixSeeds(party.room, seeds);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  return party;
}

/** Pinned `mobs` words for the bat kill test (its creature roam; `seedHelpers.fixSeeds`). */
const BAT_WORDS = [1, 2, 3, 4] as const;

const forestWolf = scenes.forest.spawners!.find((s) => s.mob === 'wolf')!;
const human = (party: Party) => party.humans[0]!.id;

describe('creatures in a match', () => {
  it('wakes in its spawner parts of the day only, and is on the wire as a Mob with no seat', async () => {
    const party = await party4();
    holdPhase(party, Phase.day, 600);
    advance(party, 2);
    const forest = party.room.state.scenes.get('forest')!;
    expect(forest.mobs.size).toBe(0);
    expect(party.room.state.scenes.get('cave_entry')!.mobs.size).toBe(1); // bats are always awake
    holdPhase(party, Phase.night, 600);
    advance(party, 2);
    expect(forest.mobs.size).toBe(3);
    forest.mobs.forEach((mob, id) => {
      expect(mob.kind).toBe('wolf');
      expect(mob.id).toBe(id);
      expect(Object.keys(mob.toJSON()).sort()).toEqual(['animId', 'id', 'kind', 'state', 'x', 'y', 'yaw']);
    });
    holdPhase(party, Phase.dawn, 600);
    advance(party, 1);
    expect(forest.mobs.size).toBe(3); // dusk and dawn
    holdPhase(party, Phase.meetingDiscussion, 600);
    const before = JSON.stringify(forest.mobs.toJSON());
    advance(party, TICK_RATE);
    expect(JSON.stringify(forest.mobs.toJSON())).toBe(before); // a meeting freezes them
    holdPhase(party, Phase.day, 600);
    advance(party, 1);
    expect(forest.mobs.size).toBe(0);
  });

  it('a wolf never leaves its leash, chasing a seat just beyond it', async () => {
    const party = await party4();
    holdPhase(party, Phase.night, 600);
    const at = floorNear(party.room, 'forest', forestWolf.x, forestWolf.y, forestWolf.leashTiles + 1, 9);
    placeSeat(party, human(party), 'forest', at.x, at.y);
    let worst = 0;
    advance(party, 120 * TICK_RATE, () => {
      for (const body of mobBodies(party.room).values()) {
        worst = Math.max(worst, Math.hypot(body.x - body.homeX, body.y - body.homeY) - body.leashPx);
      }
    });
    expect(worst).toBeLessThanOrEqual(1e-6);
  });

  it('a wolf that reaches an unlit seat bites it to death: a wolf death, a body and no killer', async () => {
    const party = await party4();
    holdPhase(party, Phase.night, 600);
    const at = floorNear(party.room, 'forest', forestWolf.x, forestWolf.y, 1, 2);
    const id = human(party);
    placeSeat(party, id, 'forest', at.x, at.y);
    const sim = simOf(party.room);
    let bitten = -1;
    for (let i = 0; i < 20 * TICK_RATE && !sim.players.get(id)!.dead; i++) {
      advance(party, 1);
      if (bitten < 0 && hpOf(party.room, id) < balance.body.maxHp) bitten = party.room.state.tick;
    }
    expect(bitten).toBeGreaterThan(0);
    expect(sim.players.get(id)!.dead).toBe(true);
    const death = sim.deaths.find((d) => d.playerId === id) ?? null;
    // The phase stage may have drained the death already; the body is the lasting sign.
    if (death) expect(death).toMatchObject({ cause: 'wolf' });
    expect(death?.killerId).toBeUndefined();
    expect(party.room.state.scenes.get('forest')!.bodies.has(`body_${id}`)).toBe(true);
    expect(party.room.state.tick - bitten).toBeGreaterThanOrEqual(
      Math.round(mobs.mobs.wolf!.attackS * TICK_RATE),
    );
  });

  it('a lit lantern makes a wolf flee and never bite; a light in the kit is out until lit', async () => {
    const party = await party4();
    holdPhase(party, Phase.night, 600);
    const id = human(party);
    const priv = party.room.state.players.get(id)!.priv;
    priv.inventory.slots.clear();
    expect(setLight(party.room, id, true)).toBe(false); // nothing to light
    const lantern = new ItemStack();
    lantern.defId = 'lantern';
    lantern.qty = 1;
    priv.inventory.slots.push(lantern);
    expect(lightBurns(party.room, id)).toBe(false);
    expect(setLight(party.room, id, true)).toBe(true);
    const at = floorNear(party.room, 'forest', forestWolf.x, forestWolf.y, 1, 2);
    placeSeat(party, id, 'forest', at.x, at.y);
    const states = new Set<number>();
    advance(party, 10 * TICK_RATE, () => {
      const wolf = mobBodies(party.room).get(forestWolf.id);
      if (wolf) states.add(wolf.mind.state);
    });
    expect(states.has(MobState.flee)).toBe(true);
    expect(states.has(MobState.chase)).toBe(false);
    expect(hpOf(party.room, id)).toBe(balance.body.maxHp);
    expect(simOf(party.room).players.get(id)!.dead).toBe(false);
  });

  it('a seat a creature chases is steered out of the scene by the NPC flee; one it does not chase is left alone', async () => {
    const party = await party4();
    holdPhase(party, Phase.night, 600);
    const id = human(party);
    const at = floorNear(party.room, 'forest', forestWolf.x, forestWolf.y, 2, 4);
    placeSeat(party, id, 'forest', at.x, at.y);
    const p = simOf(party.room).players.get(id)!;
    const brain = new Brain();
    expect(fleeCreature(party.room, id, brain, p)).toBe(false);
    for (let i = 0; i < 2 * TICK_RATE && mobBodies(party.room).get(forestWolf.id)?.mind.prey !== id; i++) {
      advance(party, 1);
    }
    expect(mobBodies(party.room).get(forestWolf.id)?.mind.prey).toBe(id);
    expect(fleeCreature(party.room, id, brain, p)).toBe(true);
    expect(p.input).not.toBeNull();
    const npc = [...simOf(party.room).players.entries()].find(([seat]) => seat !== id)!;
    expect(fleeCreature(party.room, npc[0], new Brain(), npc[1])).toBe(false);
  });

  it('a bat bites a seat down and, given time, kills it: a creature death (round 8, GDD 3.22)', async () => {
    // The bat's roam is pinned. Some crypto words send it at a goal diagonally across a wall corner, and `walk`
    // (sim/Mobs.ts) cuts that corner into the wall tile and paces between it and the path's last tile for good: from
    // inside the wall it senses no seat and `floorNear` finds no floor in sight, so no bite lands in the 270 s and the
    // seat lives (about 1 run in 30; CI saw `no floor near cave_entry 15,8`). These words roam clear of it.
    const party = await party4({ mobs: BAT_WORDS });
    holdPhase(party, Phase.day, 600);
    const bat = scenes.cave_entry.spawners![0]!;
    const at = floorNear(party.room, 'cave_entry', bat.x, bat.y, 1, 2);
    const id = human(party);
    placeSeat(party, id, 'cave_entry', at.x, at.y);
    // The lowest health across the window, not its last reading: regeneration can refill an early bite by then.
    let lowest = balance.body.maxHp;
    advance(party, 30 * TICK_RATE, () => (lowest = Math.min(lowest, hpOf(party.room, id))));
    expect(lowest).toBeLessThan(balance.body.maxHp);
    expect(simOf(party.room).players.get(id)!.dead).toBe(false);
    // Its bites come between chase cycles and regeneration refills most of them (a standing seat lasts minutes,
    // or longer when the roam takes the bat out of its senses), so the kill is proved at the edge: the seat is
    // held at 1 health until the next bite lands.
    const body = bodyOf(party.room, id)!;
    for (let i = 0; i < 270 * TICK_RATE && !simOf(party.room).players.get(id)!.dead; i++) {
      body.hp = Math.min(body.hp, 1);
      if (i % TICK_RATE === 0) {
        // Stay on the bat: its roam draws from the `mobs` stream and can take it out of its senses for minutes.
        const b = mobBodies(party.room).get(bat.id);
        if (b) {
          const tx = Math.floor(b.x / TILE_PX);
          const ty = Math.floor(b.y / TILE_PX);
          // A bat flies where no seat stands (a crevice, over the water): with no floor near it this second, the
          // seat stays where it is and the bat comes back to it (CI saw `no floor near cave_entry 15,8`).
          try {
            const near = floorNear(party.room, 'cave_entry', tx, ty, 1, 2);
            placeSeat(party, id, 'cave_entry', near.x, near.y);
          } catch {
            /* no floor near the bat */
          }
        }
      }
      advance(party, 1);
    }
    expect(simOf(party.room).players.get(id)!.dead).toBe(true);
    const death = simOf(party.room).deaths.find((d) => d.playerId === id) ?? null;
    if (death) expect(death).toMatchObject({ cause: 'creature' });
    expect(party.room.state.scenes.get('cave_entry')!.bodies.has(`body_${id}`)).toBe(true);
  });

  it('a roaming bat never closes on its goal through a wall corner (it once paced inside a wall for good)', async () => {
    // These `mobs` words once sent the bat at a goal diagonally across the corner of solid tile (15,8): it stepped into
    // the wall and paced between it and its path's last tile for the rest of the day (sim/Mobs.ts `walk`).
    const party = await party4({ mobs: [2382158811, 228878859, 3604910573, 2327810908] });
    holdPhase(party, Phase.day, 600);
    const bat = scenes.cave_entry.spawners![0]!;
    const grid = navGrid('cave_entry', simOf(party.room).profile);
    const tiles = new Set<string>();
    for (let i = 0; i < 120 * TICK_RATE; i++) {
      advance(party, 1);
      const b = mobBodies(party.room).get(bat.id);
      if (!b) continue;
      const tx = Math.floor(b.x / TILE_PX);
      const ty = Math.floor(b.y / TILE_PX);
      expect(grid.solidAt(tx, ty), `the bat stands in a wall at ${tx},${ty}`).toBe(false);
      tiles.add(`${tx}:${ty}`);
    }
    // It keeps roaming rather than standing at one corner.
    expect(tiles.size).toBeGreaterThan(2);
  });

  it('keeps the tick p95 under 15 ms with 10 seats and the wolves awake', async () => {
    const party = await standardParty(colyseus, 'S1');
    pauseClock(party.room);
    holdPhase(party, Phase.night, 600);
    const ids = [...party.room.state.players.keys()];
    const forests: SceneId[] = ['forest', 'forest_deep'];
    ids.forEach((id, i) => {
      const scene = forests[i % 2]!;
      const s = scenes[scene].spawners![i % 2]!;
      const at = floorNear(party.room, scene, s.x, s.y, 2, 6);
      placeSeat(party, id, scene, at.x, at.y);
    });
    advance(party, 2);
    const wolves = [...mobBodies(party.room).values()].filter((b) => b.def.id === 'wolf');
    expect(wolves.length).toBeGreaterThanOrEqual(3);
    const seen: number[] = [];
    let t0 = performance.now();
    advance(party, 30 * TICK_RATE, () => {
      const t1 = performance.now();
      seen.push(t1 - t0);
      t0 = t1;
    });
    seen.sort((a, b) => a - b);
    const p95 = seen[Math.ceil(seen.length * 0.95) - 1] ?? 0;
    expect(p95).toBeLessThan(15);
  }, 60_000);
});
