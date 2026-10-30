import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { C2S, ManhuntState, Phase, S2C, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory, avatarOf } from '../src/sim/Avatars';
import { emitSim } from '../src/sim/events/bus';
import { onMeetingOpenDisguise, settleDisguise } from '../src/sim/Impersonate';
import { CELL, isJailed, isPinned } from '../src/sim/law/Jail';
import { cuffSeat } from '../src/sim/law/Manhunt';
import { handleKill } from '../src/sim/Kill';
import { handlePetitionOpen, handlePetitionSign } from '../src/sim/law/Petition';
import { hubOf, stationOf } from '../src/sim/MapSites';
import { enterImmunity, openMeeting } from '../src/sim/Meeting';
import { simOf } from '../src/sim/RoomSim';
import { figuresOf } from '../src/sim/townsfolk/figures';
import { sceneIndex } from '../src/sim/World';
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
  setRole,
  start,
  stateOf,
  toWorld,
} from './npcHelpers';

/**
 * The county jail (round 10, B5b; GDD 3.27; seams.md 3 row 19; A349): a cuffed seat walks `jail.walkS` into the cell,
 * which it leaves on the next morning train; an impersonation worn at the cuff is pinned until then, so the cell and
 * the manifest show the face it was cuffed in; `jailUntilTick` reaches its own view only. A meeting leaves the
 * prisoner in the cell; on a map with no station (BlackPine) the next dawn lets it out at the meeting spawns.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Four humans by day at the square's notice board, an NPC seat, and the Constables off. */
async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 4);
  await send(party.humans[0]!, C2S.lobbyAddNpc);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  party.humans.forEach((h, i) => placeSeat(party, h.id, 'overworld', 34 + i, 21));
  for (const f of figuresOf(party.room).values()) if (f.kind === 'constable') f.dead = true;
  advance(party, 1);
  return party;
}

const ids = (party: Party) => party.humans.map((h) => h.id) as [string, string, string, string];
const lookOf = (party: Party, seat: string) =>
  avatarOf(party.room, avatarMemory(party.room).handleOf.get(seat)!)?.lookOf;
const manifest = (h: Human): string[] =>
  h.log
    .filter(
      (m) => m.type === S2C.chatMsg && (m.payload as { text: string }).text.endsWith('steps off the train.'),
    )
    .map((m) => (m.payload as { text: string }).text);

/** Seat 0 opens against `accused` and two others sign: the manhunt hunts it from the next tick. */
function hunt(party: Party, accused: string): void {
  const [a, ...rest] = ids(party);
  handlePetitionOpen(party.room, a, { accused, charge: 'robbery', entries: [] });
  for (const id of rest.filter((x) => x !== accused).slice(0, 2))
    handlePetitionSign(party.room, id, { id: party.room.state.petition.id });
  advance(party, 1);
}

/** Borrows `as`'s face for `seat` (an applied impersonation, GDD 3.17), long run out. */
function disguise(party: Party, seat: string, as: string, applied = true): void {
  avatarMemory(party.room).disguise.set(seat, {
    as,
    applied,
    dropRequested: false,
    applyByTick: party.room.state.tick + S(10),
    untilTick: party.room.state.tick,
  });
  simOf(party.room).viewsDirty = true;
  advance(party, 1);
}

/** The next morning train: a `train.arrive` of a later round, as `Train.ts` announces it. */
function train(party: Party): void {
  const round = party.room.state.round + 1;
  emitSim(party.room, { tick: party.room.state.tick, kind: 'train.arrive', data: { round } });
  advance(party, 1);
}

const inCell = (party: Party, seat: string) =>
  simOf(party.room).players.get(seat)!.sceneIdx === sceneIndex(CELL);

describe('the county jail (GDD 3.27)', () => {
  it("refuses a jailed Killer's Knife with IN_JAIL", async () => {
    const party = await world();
    const [, b, c] = ids(party);
    hunt(party, b);
    setRole(party.room, b, 'killer');
    cuffSeat(party.room, b);
    advance(party, S(balance.jail.walkS) + 1);
    holdPhase(party, Phase.night, 300);
    handleKill(party.room, b, { targetId: avatarMemory(party.room).handleOf.get(c) });
    await sleep(150);
    const reasons = party.humans[1]!.log.map((m) => (m.payload as { reason?: string }).reason);
    expect(reasons).toContain('IN_JAIL');
  });

  it('walks the cuffed seat into the cell, holds it there, and lets the morning train set it down', async () => {
    const party = await world();
    const [, , c, d] = ids(party);
    hunt(party, d);
    cuffSeat(party.room, d);
    expect(isJailed(party.room, d)).toBe(true);
    expect(inCell(party, d)).toBe(false); // the walk
    advance(party, S(balance.jail.walkS) + 1);
    expect(inCell(party, d)).toBe(true);
    expect(party.room.state.manhunt.state).toBe(ManhuntState.cuffed);
    const until = party.room.state.players.get(d)!.priv.jailUntilTick;
    expect(until).toBeGreaterThan(party.room.state.tick);
    // A jailed seat cannot open a petition: IN_JAIL with the seconds to the train.
    handlePetitionOpen(party.room, d, { accused: c, charge: 'theft', entries: [] });
    await sleep(150);
    const err = party.humans[3]!.log.find((m) => (m.payload as { reason?: string }).reason === 'IN_JAIL');
    expect((err?.payload as { args?: { untilDawn?: number } }).args?.untilDawn).toBeGreaterThan(0);
    // A train of the same round does not release it; the next one does.
    emitSim(party.room, {
      tick: party.room.state.tick,
      kind: 'train.arrive',
      data: { round: party.room.state.round },
    });
    advance(party, 1);
    expect(inCell(party, d)).toBe(true);
    train(party);
    const station = stationOf(party.room)!;
    expect(simOf(party.room).players.get(d)!.sceneIdx).toBe(sceneIndex(station.sceneId));
    expect(party.room.state.players.get(d)!.priv.jailUntilTick).toBe(0);
    advance(party, 1);
    expect(party.room.state.manhunt.state).toBe(ManhuntState.none);
    await sleep(150);
    const name = party.room.state.players.get(d)!.name;
    for (const h of party.humans) expect(manifest(h)).toEqual([`${name} steps off the train.`]);
  });

  it("A170: jailUntilTick reaches only the jailed seat's own view", async () => {
    const party = await world();
    const [, , , d] = ids(party);
    hunt(party, d);
    cuffSeat(party.room, d);
    advance(party, S(balance.jail.walkS) + 1);
    await sleep(150);
    for (const h of party.humans) {
      const views = stateOf(h).players;
      for (const [id, p] of views) {
        const own = (p as { priv?: { jailUntilTick?: number } }).priv?.jailUntilTick ?? 0;
        if (id === d && h.id === d) expect(own).toBeGreaterThan(0);
        else expect(own).toBe(0);
      }
    }
  });

  it('pins an impersonation worn at the cuff: the walk, an alone tick, a meeting and a door keep the face', async () => {
    const party = await world();
    const [, b, , d] = ids(party);
    hunt(party, d);
    placeSeat(party, d, 'bakery', 4, 4); // the true accused is elsewhere
    disguise(party, b, d);
    expect(lookOf(party, b)).toBe(d);
    cuffSeat(party.room, b);
    expect(isPinned(party.room, b)).toBe(true);
    advance(party, S(balance.jail.walkS) + 1); // the forced walk and the cell door
    expect(inCell(party, b)).toBe(true);
    advance(party, S(2)); // alone in the cell, by day, the 15 s long run out
    expect(lookOf(party, b)).toBe(d);
    onMeetingOpenDisguise(party.room);
    settleDisguise(party.room, b);
    expect(lookOf(party, b)).toBe(d);
    // Set down at the station still in the face; the usual rule applies after.
    train(party);
    expect(simOf(party.room).players.get(b)!.sceneIdx).toBe(sceneIndex(stationOf(party.room)!.sceneId));
    expect(lookOf(party, b)).toBe(d); // the figure off the train is the face the manifest names
    expect(isPinned(party.room, b)).toBe(false);
    expect(avatarMemory(party.room).disguise.get(b)?.as).toBe(d);
  });

  it('A170: the manifest names the cuffed face, the same whether the accused or an impersonator was held', async () => {
    const lines: string[][] = [];
    for (const impersonated of [false, true]) {
      const party = await world();
      const [, b, , d] = ids(party);
      hunt(party, d);
      if (impersonated) {
        placeSeat(party, d, 'bakery', 4, 4);
        disguise(party, b, d);
      }
      cuffSeat(party.room, impersonated ? b : d);
      advance(party, S(balance.jail.walkS) + 1);
      for (const h of party.humans) h.log.length = 0;
      train(party);
      await sleep(150);
      lines.push(party.humans.map((h) => manifest(h).join('|')));
    }
    expect(lines[1]).toEqual(lines[0]);
  });

  it('cancels a disguise still pending at the cuff, and frees a seat that dies in jail', async () => {
    const party = await world();
    const [, b, c] = ids(party);
    hunt(party, b);
    disguise(party, b, c, false);
    cuffSeat(party.room, b);
    expect(avatarMemory(party.room).disguise.has(b)).toBe(false);
    advance(party, S(balance.jail.walkS) + 1);
    // The cell door is a scene entry, where a pending face would apply: none does.
    expect(inCell(party, b)).toBe(true);
    expect(lookOf(party, b)).toBe(b);
    simOf(party.room).players.get(b)!.dead = true;
    advance(party, 1);
    expect(isJailed(party.room, b)).toBe(false);
    advance(party, 1);
    expect(party.room.state.manhunt.state).toBe(ManhuntState.none);
  });
  it('keeps the prisoner in the cell through a meeting and its immunity placement', async () => {
    const party = await world();
    const [a, , , d] = ids(party);
    hunt(party, d);
    cuffSeat(party.room, d);
    advance(party, S(balance.jail.walkS) + 1);
    expect(inCell(party, d)).toBe(true);
    openMeeting(party.room, { reason: 'bell', callerId: a });
    advance(party, 1);
    expect(inCell(party, d)).toBe(true);
    expect(simOf(party.room).players.get(a)!.sceneIdx).toBe(sceneIndex(hubOf(party.room)));
    enterImmunity(party.room);
    advance(party, 1);
    expect(inCell(party, d)).toBe(true);
    holdPhase(party, Phase.day, 3600); // the next day, before its train
    advance(party, 1);
    expect(inCell(party, d)).toBe(true);
    expect(isJailed(party.room, d)).toBe(true);
  });

  it('on a map with no station, lets the prisoner out at the next dawn on the meeting spawns, with no line', async () => {
    const party = await world();
    const [, , , d] = ids(party);
    party.room.state.settings.map = 'blackpine';
    expect(stationOf(party.room)).toBeUndefined();
    hunt(party, d);
    cuffSeat(party.room, d);
    advance(party, S(balance.jail.walkS) + 1);
    expect(inCell(party, d)).toBe(true);
    // The release tick is the next dawn, the day's end plus dusk and night.
    const p = balance.phases;
    expect(party.room.state.players.get(d)!.priv.jailUntilTick).toBe(
      party.room.state.phaseEndsTick + S(p.duskS + p.nightS),
    );
    holdPhase(party, Phase.night, 300);
    advance(party, 1);
    expect(inCell(party, d)).toBe(true); // the night of the same round
    for (const h of party.humans) h.log.length = 0;
    party.room.state.round += 1; // the dawn of a later round
    holdPhase(party, Phase.day, 3600);
    advance(party, 1);
    expect(isJailed(party.room, d)).toBe(false);
    expect(simOf(party.room).players.get(d)!.sceneIdx).toBe(sceneIndex('bp_camp'));
    expect(party.room.state.players.get(d)!.priv.jailUntilTick).toBe(0);
    await sleep(150);
    for (const h of party.humans) expect(manifest(h)).toEqual([]);
  });
});
