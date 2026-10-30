import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy } from '@wdi/content';
import { C2S, ManhuntState, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { hurt } from '../src/sim/body/damage';
import { emitSim } from '../src/sim/events/bus';
import { isJailed } from '../src/sim/law/Jail';
import { cuffedOf, handleCuffHold } from '../src/sim/law/Manhunt';
import { handlePetitionOpen, handlePetitionSign } from '../src/sim/law/Petition';
import { simOf } from '../src/sim/RoomSim';
import { figuresOf } from '../src/sim/townsfolk/figures';
import { sceneKey } from '../src/sim/World';
import {
  type Human,
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  start,
  stateOf,
  toWorld,
} from './npcHelpers';

/**
 * The manhunt (round 10, B4; GDD 3.31; seams.md 3 row 14): a passed petition's warrant hunts its accused for
 * `manhunt.durationS`; a cuff tests the drawn face and lands on the seat behind it; `huntScene` reaches the opener and
 * the signers only; the Constables cuff within their leash; the timeout cuffs where no hunter is left, else the case
 * stays and petitions wait `petition.cooldownS`; the cuffed seat is held until dawn.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Four humans by day on HollowMere at the square's notice board, and one NPC seat; the Constables off unless asked. */
async function world(constables = false, n = 4): Promise<Party> {
  const party = await lobbyOf(colyseus, n);
  if (n >= 4) await send(party.humans[0]!, C2S.lobbyAddNpc);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  party.humans.forEach((h, i) => placeSeat(party, h.id, 'overworld', 34 + i, 21));
  if (!constables) for (const f of figuresOf(party.room).values()) if (f.kind === 'constable') f.dead = true;
  advance(party, 1);
  return party;
}

const ids = (party: Party) => party.humans.map((h) => h.id) as [string, string, string, string];
const row = (party: Party) => party.room.state.manhunt;
const handleOf = (party: Party, seat: string) => avatarMemory(party.room).handleOf.get(seat)!;
const reasons = (h: Human): string[] =>
  h.log.filter((m) => m.type === 'error').map((m) => (m.payload as { reason?: string }).reason ?? '');

/** Seat 0 opens against `accused` and two others sign (2 of 4 humans): the petition passes, the manhunt opens. */
function warrant(party: Party, accused: string): void {
  const [a, ...rest] = ids(party);
  handlePetitionOpen(party.room, a, { accused, charge: 'robbery', entries: [] });
  for (const id of rest.filter((x) => x !== accused).slice(0, 2))
    handlePetitionSign(party.room, id, { id: party.room.state.petition.id });
  advance(party, 1);
}

/** Borrows `as`'s face for `seat` (an applied impersonation, GDD 3.17). */
function disguise(party: Party, seat: string, as: string): void {
  avatarMemory(party.room).disguise.set(seat, {
    as,
    applied: true,
    dropRequested: false,
    applyByTick: 0,
    untilTick: Number.MAX_SAFE_INTEGER,
  });
  simOf(party.room).viewsDirty = true;
  advance(party, 1);
}

const cuffTicks = S(balance.law.cuffHoldS);

describe('the manhunt (GDD 3.31)', () => {
  it('opens on a passed warrant, the same row for every client; a cuff jails the seat until the morning train', async () => {
    const party = await world();
    const [a, , c, d] = ids(party);
    warrant(party, d);
    expect([row(party).accused, row(party).state]).toEqual([d, ManhuntState.hunting]);
    await sleep(150);
    const seen = party.humans.map((h) => JSON.stringify(stateOf(h).manhunt));
    expect(new Set(seen).size).toBe(1);
    expect(JSON.parse(seen[0]!)).toEqual({ accused: d, untilTick: row(party).untilTick, state: 1 });
    placeSeat(party, c, 'overworld', 36, 22);
    placeSeat(party, d, 'overworld', 37, 22);
    advance(party, 1);
    handleCuffHold(party.room, c, handleOf(party, d));
    advance(party, cuffTicks + 1);
    expect(row(party).state).toBe(ManhuntState.cuffed);
    expect(cuffedOf(party.room).map((x) => [x.seat, x.accused])).toEqual([[d, d]]);
    // B5: the cuffed seat walks to the county jail; the morning train of a later round releases it, and the next
    // warrant may run.
    expect(isJailed(party.room, d)).toBe(true);
    advance(party, S(balance.jail.walkS) + 1);
    const round = party.room.state.round + 1;
    emitSim(party.room, { tick: party.room.state.tick, kind: 'train.arrive', data: { round } });
    advance(party, 2);
    expect(isJailed(party.room, d)).toBe(false);
    expect(row(party).state).toBe(ManhuntState.none);
    expect(simOf(party.room).players.get(d)!.busyUntilTick).toBeLessThanOrEqual(party.room.state.tick);
    // A seat killed while held walks free as a ghost.
    warrant(party, c);
    placeSeat(party, a, 'overworld', 36, 22);
    placeSeat(party, c, 'overworld', 37, 22);
    advance(party, 1);
    handleCuffHold(party.room, a, handleOf(party, c));
    advance(party, cuffTicks + 1);
    expect(row(party).state).toBe(ManhuntState.cuffed);
    simOf(party.room).players.get(c)!.dead = true;
    advance(party, 2);
    expect(row(party).state).toBe(ManhuntState.none);
    expect(simOf(party.room).players.get(c)!.busyUntilTick).toBeLessThanOrEqual(party.room.state.tick);
  });

  it('refuses NOT_HUNTED without a hunt, and stops on a move, a strike by the target, or a blow to the cuffer', async () => {
    const party = await world();
    const [, , c, d] = ids(party);
    placeSeat(party, c, 'overworld', 36, 22);
    placeSeat(party, d, 'overworld', 37, 22);
    advance(party, 1);
    handleCuffHold(party.room, c, handleOf(party, d));
    await sleep(150);
    expect(reasons(party.humans[2]!)).toEqual(['NOT_HUNTED']);
    warrant(party, d);
    const stop = [
      () => placeSeat(party, d, 'overworld', 45, 22), // out of reach
      () => hurt(party.room, c, balance.body.damage.strike, { source: 'strike', by: d }), // both at once
    ];
    for (const interrupt of stop) {
      placeSeat(party, d, 'overworld', 37, 22);
      advance(party, 1);
      handleCuffHold(party.room, c, handleOf(party, d));
      advance(party, 2);
      interrupt();
      advance(party, cuffTicks);
      expect(simOf(party.room).players.get(c)!.hold).toBeNull();
      expect(row(party).state).toBe(ManhuntState.hunting);
    }
  });

  it('A170: the cuff tests the drawn face; an impersonator is cuffed exactly as the accused would be', async () => {
    const runs: string[][] = [];
    for (const impersonated of [false, true]) {
      const party = await world();
      const [a, b, c, d] = ids(party);
      warrant(party, d);
      placeSeat(party, a, 'overworld', 36, 22);
      placeSeat(party, b, 'overworld', 37, 22);
      placeSeat(party, d, 'overworld', 37, 22);
      advance(party, 1);
      // The accused drawn as another is refused like any other figure.
      disguise(party, d, c);
      handleCuffHold(party.room, a, handleOf(party, d));
      await sleep(150);
      expect(reasons(party.humans[0]!)).toEqual(['NOT_HUNTED']);
      avatarMemory(party.room).disguise.delete(d);
      if (impersonated) {
        placeSeat(party, d, 'overworld', 10, 10);
        disguise(party, b, d);
      } else advance(party, 1);
      for (const h of party.humans) h.log.length = 0;
      const target = impersonated ? b : d;
      handleCuffHold(party.room, a, handleOf(party, target));
      advance(party, cuffTicks + 1);
      await sleep(150);
      expect(row(party).state).toBe(ManhuntState.cuffed);
      expect(cuffedOf(party.room)[0]!.seat).toBe(target);
      runs.push(
        party.humans.map((h) =>
          JSON.stringify([h.log.map((m) => m.type), { ...stateOf(h).manhunt, accused: '', untilTick: 0 }]),
        ),
      );
    }
    expect(runs[1]).toEqual(runs[0]);
  });

  it('A170: huntScene reaches the opener and the signers only, by the face seen with another figure', async () => {
    const party = await world();
    const [a, b, c, d] = ids(party);
    handlePetitionOpen(party.room, a, { accused: d, charge: 'theft', entries: [] });
    handlePetitionSign(party.room, b, { id: party.room.state.petition.id });
    advance(party, 1); // 4 humans: ceil(1.2) = 2 needed, one signed
    handlePetitionSign(party.room, c, { id: party.room.state.petition.id });
    placeSeat(party, d, 'bakery', 4, 4);
    advance(party, 1);
    const scene = (id: string) => party.room.state.players.get(id)!.priv.huntScene;
    // Alone in the bakery: not seen.
    expect([a, b, c].map(scene)).toEqual(['', '', '']);
    placeSeat(party, a, 'bakery', 5, 4);
    advance(party, S(economy.notices.sampleS) + 1);
    expect([a, b, c].map(scene)).toEqual(['bakery', 'bakery', 'bakery']);
    expect(scene(d)).toBe('');
    await sleep(150);
    for (const h of party.humans) {
      const own = stateOf(h).players.get(h.id)?.priv?.huntScene ?? '';
      expect(own).toBe(h.id === d ? '' : 'bakery');
    }
  });

  it('a Constable cuffs a figure drawn as the accused within its leash', async () => {
    const party = await world(true);
    const [, , , d] = ids(party);
    const constable = [...figuresOf(party.room).values()].find((f) => f.kind === 'constable')!;
    warrant(party, d);
    placeSeat(
      party,
      d,
      sceneKey(constable.sceneIdx) as 'overworld',
      Math.floor(constable.x / TILE_PX),
      Math.floor(constable.y / TILE_PX),
    );
    advance(party, S(balance.law.cuffHoldS / balance.law.speedMult) + S(2));
    expect(row(party).state).toBe(ManhuntState.cuffed);
    expect(cuffedOf(party.room)[0]!.seat).toBe(d);
  });

  it('times out: with no human left free the accused is cuffed in place; else petitions wait cooldownS', async () => {
    for (const nobody of [true, false]) {
      const party = await world();
      const [a, b, c, d] = ids(party);
      warrant(party, d);
      if (nobody) for (const id of [a, b, c]) simOf(party.room).players.get(id)!.dead = true;
      advance(party, S(balance.manhunt.durationS) + 1);
      if (nobody) {
        expect(row(party).state).toBe(ManhuntState.cuffed);
        expect(cuffedOf(party.room)[0]!.seat).toBe(d);
        continue;
      }
      expect(row(party).state).toBe(ManhuntState.none);
      handlePetitionOpen(party.room, c, { accused: b, charge: 'theft', entries: [] });
      await sleep(150);
      expect(reasons(party.humans[2]!)).toContain('PETITION_GRACE');
    }
  });
});
