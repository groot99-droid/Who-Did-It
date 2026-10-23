import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { spawnBody } from '../src/sim/Bodies';
import { emitSim, onSim, type SimEvent } from '../src/sim/events/bus';
import { npcMemory } from '../src/sim/npc/memory';
import { MOOD_ANIM, moodIdleOf, moodOf, moodWeights, needsOf } from '../src/sim/npc/needs';
import { simOf } from '../src/sim/RoomSim';
import { openRun } from './killHelpers';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  npcSeats,
  placeSeat,
  start,
  toWorld,
} from './npcHelpers';

/**
 * Needs and moods (round 8, GDD 3.24, docs/round8/townsfolk.md 1 and 4; Session 8E): the needs rise and fall with
 * their events, the mood picks the routine variant and the idle, and nothing of it reaches a client.
 */

const RUN = openRun('overworld', 8);
/** The cellar is dark (GDD 3.12) and has no creature spawner, so nothing chases the seat; the overworld has lamps. */
const DARK = openRun('cellar', 6);
const m = balance.moods;
const ticksOf = (s: number) => Math.round(s * TICK_RATE);

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** 1 human + 3 NPCs in the first world phase, all Townsfolk, by day, with one NPC `a` alone on the overworld run. */
async function world(): Promise<{ party: Party; a: string; others: string[] }> {
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  const [a, ...others] = npcSeats(party.room).map((p) => p.id) as [string, ...string[]];
  // Everyone but `a` and the human is a ghost, so `a` has no company unless a test gives it some.
  for (const [id, p] of simOf(party.room).players) p.dead = id !== a && id !== party.humans[0]!.id;
  holdPhase(party, Phase.day, 3600);
  placeSeat(party, a, 'overworld', RUN.x, RUN.y);
  placeSeat(party, party.humans[0]!.id, 'overworld', RUN.x + 7, RUN.y);
  advance(party, 2);
  return { party, a, others };
}

const needsFor = (party: Party, id: string) => needsOf(npcMemory(party.room).brain(id));

/** Emits an event and runs the tick that delivers it. */
function fire(party: Party, event: Omit<SimEvent, 'tick'>): void {
  emitSim(party.room, { tick: party.room.state.tick, ...event });
  advance(party, 1);
}

describe('needs', () => {
  it('hunger rises with time and falls at home', async () => {
    const { party, a } = await world();
    const n = needsFor(party, a);
    const before = n.hunger;
    advance(party, ticksOf(m.hunger.riseS / 10));
    expect(n.hunger).toBeGreaterThan(before);
    expect(n.hunger).toBeCloseTo(before + 0.1, 1);
    // At home, the meal: hunger falls faster than it rises.
    const brain = npcMemory(party.room).brain(a);
    const home = brain.persona?.home;
    expect(home).toBeTruthy();
    const sim = simOf(party.room);
    const p = sim.players.get(a)!;
    const { sceneIndex } = await import('../src/sim/World');
    p.sceneIdx = sceneIndex(home!);
    const atHome = n.hunger;
    advance(party, ticksOf(5));
    expect(n.hunger).toBeLessThan(atHome);
  });

  it('a body seen frightens; daylight calms', async () => {
    const { party, a, others } = await world();
    const n = needsFor(party, a);
    expect(n.fear).toBe(0);
    spawnBody(party.room, 'overworld', others[0]!, RUN.x + 1, RUN.y);
    advance(party, 3);
    expect(n.fear).toBeCloseTo(m.fear.body, 2);
    const frightened = n.fear;
    // Falls at most by the day rate (a seat busy at a station does not tick its needs that tick).
    advance(party, ticksOf(10));
    expect(n.fear).toBeLessThan(frightened);
    expect(n.fear).toBeGreaterThanOrEqual(frightened - 10 / m.fear.fallS - 1e-9);
  });

  it('the dark outdoors at night without a light frightens, and company calms', async () => {
    const { party, a } = await world();
    const n = needsFor(party, a);
    holdPhase(party, Phase.night, 3600);
    // Alone in the dark: the human stays on the overworld.
    placeSeat(party, a, 'cellar', DARK.x, DARK.y);
    advance(party, ticksOf(9));
    expect(n.fear).toBeGreaterThan(0);
    expect(n.fear).toBeCloseTo(9 / m.fear.darkRiseS, 2);
    const alone = n.fear;
    // Company within sight (the human walks with the seat): the rise stops and the fall begins.
    const human = party.humans[0]!.id;
    placeSeat(party, human, 'cellar', DARK.x + 1, DARK.y);
    const sim = simOf(party.room);
    advance(party, ticksOf(3), () => {
      const pa = sim.players.get(a)!;
      const ph = sim.players.get(human)!;
      ph.sceneIdx = pa.sceneIdx;
      ph.x = pa.x;
      ph.y = pa.y;
    });
    expect(n.fear).toBeLessThan(alone);
  });

  it('a blow angers at the one who struck, and anger cools', async () => {
    const { party, a } = await world();
    const human = party.humans[0]!.id;
    const n = needsFor(party, a);
    fire(party, { kind: 'body.hit', data: { target: a, by: human, source: 'strike', dmg: 1, effects: [] } });
    expect(n.anger).toBeCloseTo(m.anger.struck, 2);
    expect(n.fear).toBeCloseTo(m.fear.struck, 2);
    expect(n.angryAt).toBe(human);
    const hot = n.anger;
    advance(party, ticksOf(10));
    expect(n.anger).toBeLessThan(hot);
    // A robbery and a tax anger too; a wage relieves Want.
    fire(party, { kind: 'rob', data: { by: human, target: a, amount: 3 } });
    expect(n.anger).toBeGreaterThan(hot);
    const robbed = n.anger;
    fire(party, { kind: 'rent.paid', seat: a });
    expect(n.anger).toBeGreaterThan(robbed);
    n.want = 1;
    fire(party, { kind: 'purse', seat: a, data: { delta: 5, reason: 'wage' } });
    expect(n.want).toBeCloseTo(1 - m.want.wage, 5);
    const fed = n.anger;
    fire(party, { kind: 'eat', seat: a });
    expect(n.hunger).toBe(0);
    expect(n.anger).toBeCloseTo(fed - m.anger.mealRelief, 2);
  });

  it('an ejection frightens every living NPC and relieves the one that suspected the ejected seat', async () => {
    const { party, a, others } = await world();
    const n = needsFor(party, a);
    npcMemory(party.room).brain(a).suspicion.set(others[0]!, 3);
    n.anger = 1;
    fire(party, { kind: 'eject', seat: others[0]!, data: { role: 'townsfolk' } });
    expect(n.fear).toBeCloseTo(m.fear.ejection, 2);
    expect(n.anger).toBeCloseTo(1 - m.anger.ejectionRelief, 2);
  });
});

describe('moods', () => {
  it('is the strongest need over the threshold, Desperate with two, and holds moodHoldS', async () => {
    const { party, a } = await world();
    const n = needsFor(party, a);
    expect(n.mood).toBe('calm');
    n.fear = m.threshold + 0.1;
    advance(party, 1);
    expect(n.mood).toBe('scared');
    expect(moodOf(party.room, a)).toBe('scared');
    // A second need over the threshold does not take the mood before the hold has run.
    n.anger = 1;
    advance(party, 1);
    expect(n.mood).toBe('scared');
    advance(party, ticksOf(m.moodHoldS));
    expect(n.mood).toBe('desperate');
    // One need left over the threshold: the strongest one names the mood, after its own hold.
    n.fear = 0;
    n.anger = 1;
    advance(party, 1);
    expect(n.mood).toBe('desperate');
    advance(party, ticksOf(m.moodHoldS));
    expect(n.mood).toBe('angry');
  });

  it('emits a server-only mood event on every change, naming the figure', async () => {
    const { party, a } = await world();
    const n = needsFor(party, a);
    const heard: SimEvent[] = [];
    onSim(party.room, 'mood', (e) => heard.push(e));
    n.hunger = 1;
    advance(party, 2);
    expect(heard).toEqual([expect.objectContaining({ kind: 'mood', data: { figure: a, mood: 'hungry' } })]);
  });

  it('shifts the routine weights by mood and keeps them a distribution', () => {
    const base = balance.npc.routine.weights.day;
    const brain = npcMemory({ state: { players: new Map() } } as never).brain('x');
    expect(moodWeights(brain, base)).toBe(base);
    const n = needsOf(brain);
    n.mood = 'scared';
    const scared = moodWeights(brain, base);
    expect(scared.idle).toBeGreaterThan(base.idle);
    expect(scared.work + scared.stroll + scared.idle).toBeCloseTo(1, 9);
    n.mood = 'hungry';
    expect(moodWeights(brain, base).work).toBeGreaterThan(base.work);
    n.mood = 'angry';
    expect(moodWeights(brain, base).stroll).toBeGreaterThan(base.stroll);
  });

  it('shows the mood idle while the seat stands still, and the plain idle when Calm', async () => {
    const { party, a } = await world();
    const n = needsFor(party, a);
    const presence = party.room.state.players.get(a)!.presence;
    const stillTicks = (): number[] => {
      const seen: number[] = [];
      advance(party, ticksOf(4), () => {
        const p = simOf(party.room).players.get(a)!;
        if (p.vx === 0 && p.vy === 0 && p.hold === null) seen.push(presence.animId);
      });
      return seen;
    };
    n.fear = 1;
    advance(party, 1);
    const scared = stillTicks();
    expect(scared.length).toBeGreaterThan(0);
    expect(new Set(scared)).toEqual(new Set([MOOD_ANIM.cower]));
    n.fear = 0;
    advance(party, ticksOf(m.moodHoldS) + 1);
    expect(n.mood).toBe('calm');
    expect(moodIdleOf(simOf(party.room).players.get(a)!)).toBeUndefined();
    const moodIdles = new Set<number>(Object.values(MOOD_ANIM));
    advance(party, ticksOf(4), () => expect(moodIdles.has(presence.animId)).toBe(false));
  });

  it('never reaches the wire: no need or mood field in the whole state', async () => {
    const { party, a } = await world();
    const n = needsFor(party, a);
    n.hunger = n.fear = n.anger = n.want = 1;
    advance(party, 2);
    expect(n.mood).toBe('desperate');
    const text = JSON.stringify(party.room.state.toJSON());
    for (const word of ['mood', 'hunger', 'fear', 'anger', 'want', 'needs', 'desperate']) {
      expect(text.toLowerCase(), word).not.toContain(`"${word}"`);
    }
  });
});
