import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, deckFor } from '@wdi/content';
import {
  C2S,
  ClueKind,
  ErrorCode,
  NotebookEntry,
  NotebookStatus,
  Phase,
  TICK_RATE,
  TribunalStep,
  Winner,
} from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bootFlowServer,
  clock,
  events,
  idOf,
  request,
  seat,
  skipPhase,
  startParty,
  until,
} from './flowHelpers';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { flowOf } from '../src/sim/Flow';
import { endTrialOpen, handleFile } from '../src/sim/law/EndTrial';
import { simOf } from '../src/sim/RoomSim';
import { opts, sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

describe('the phase loop (GDD 3.3)', () => {
  it('debug.play starts grace with its clock, the match start tick and round 0', async () => {
    const m = await startParty(colyseus, 4);
    const s = m.room.state;
    expect(s.phase).toBe(Phase.grace);
    expect(s.startTick).toBeGreaterThan(0);
    expect(s.round).toBe(0);
    expect(s.phaseEndsTick - s.startTick).toBe(balance.phases.graceS * TICK_RATE);
  });

  it('runs grace -> day -> dusk -> night -> day with round + 1 on every entry into day', async () => {
    const m = await startParty(colyseus, 4);
    const seen: number[] = [];
    const rounds: number[] = [];
    for (let i = 0; i < 5; i++) {
      await skipPhase(m);
      seen.push(m.room.state.phase);
      rounds.push(m.room.state.round);
    }
    expect(seen).toEqual([Phase.day, Phase.dusk, Phase.night, Phase.day, Phase.dusk]);
    expect(rounds).toEqual([1, 1, 1, 2, 2]);
    // Every change was broadcast with the new clock.
    const changes = events(m.bots[1]!, 'phaseChange').map((e) => e.phase);
    expect(changes).toEqual([Phase.grace, ...seen]);
  });

  it('every length comes from balance.phases', async () => {
    const m = await startParty(colyseus, 4);
    const s = m.room.state;
    const lengths: Array<[number, number]> = [];
    for (let i = 0; i < 3; i++) {
      await skipPhase(m);
      lengths.push([s.phase, s.phaseEndsTick - s.tick]);
    }
    const near = (ticks: number, seconds: number) => Math.abs(ticks - seconds * TICK_RATE) <= 4;
    expect(near(lengths[0]![1], balance.phases.dayS)).toBe(true);
    expect(near(lengths[1]![1], balance.phases.duskS)).toBe(true);
    expect(near(lengths[2]![1], balance.phases.nightS)).toBe(true);
  });

  it('starts the Knife cooldown of every role with the kill ability when grace ends, and only then', async () => {
    const m = await startParty(colyseus, 5);
    expect(seat(m, 0).priv!.cooldownEndTick.has('kill')).toBe(false);
    await skipPhase(m);
    const tick = m.room.state.tick;
    const until_ = seat(m, 0).priv!.cooldownEndTick.get('kill')!;
    expect(Math.abs(until_ - (tick + balance.byCount['5'].killCooldownS * TICK_RATE))).toBeLessThanOrEqual(4);
    for (const i of [1, 2, 3, 4]) expect(seat(m, i).priv!.cooldownEndTick.has('kill')).toBe(false);
    // Later days do not restart it: the kill resets it, nothing else does.
    seat(m, 0).priv!.cooldownEndTick.set('kill', 1);
    await skipPhase(m);
    await skipPhase(m);
    await skipPhase(m);
    expect(seat(m, 0).priv!.cooldownEndTick.get('kill')).toBe(1);
  });
});

describe('debug.clock and debug.deal (WDI_DEBUG only)', () => {
  it('jumps to a named phase with a fresh clock and unchanged round', async () => {
    const m = await startParty(colyseus, 4);
    await clock(m, { phase: 'night' });
    const s = m.room.state;
    expect(s.phase).toBe(Phase.night);
    expect(s.round).toBe(0);
    expect(s.phaseEndsTick - s.tick).toBeGreaterThan(balance.phases.nightS * TICK_RATE - 10);
    await clock(m, { phase: 'immunity' });
    expect(s.phase).toBe(Phase.immunity);
  });

  it('refuses an unknown phase name with 422 and leaves the phase alone', async () => {
    const m = await startParty(colyseus, 4);
    await clock(m, { phase: 'meetingVote' });
    expect(m.room.state.phase).toBe(Phase.grace);
    expect(events(m.bots[0]!, 'error').at(-1)).toMatchObject({ code: ErrorCode.cannot });
  });

  it('clearCooldowns zeroes every cooldown entry and every bandage', async () => {
    const m = await startParty(colyseus, 4);
    await clock(m, { phase: 'day' });
    seat(m, 0).priv!.cooldownEndTick.set('kill', 99999);
    simOf(m.room).players.get(idOf(m, 2))!.bandagedUntilTick = 99999;
    await clock(m, { clearCooldowns: true });
    expect(seat(m, 0).priv!.cooldownEndTick.get('kill')).toBe(0);
    expect(simOf(m.room).players.get(idOf(m, 2))!.bandagedUntilTick).toBe(0);
    expect(m.room.state.phase).toBe(Phase.day);
  });

  it('debug.deal fixes seats for the next deal and the deck counts hold', async () => {
    const leader = await colyseus.sdk.create('party', opts('Bot0'));
    const rooms = [leader];
    for (let i = 1; i < 5; i++) rooms.push(await colyseus.sdk.joinById(leader.roomId, opts(`Bot${i}`)));
    const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
    const ids = rooms.map((r) => r.sessionId);
    leader.send('debug.deal', { roles: { [ids[3]!]: 'killer', [ids[4]!]: 'doctor' } });
    await sleep(150);
    leader.send(C2S.lobbyStart, {});
    await until(() => room.state.phase === Phase.roleReveal);
    const dealt = ids.map((id) => room.state.players.get(id)!.priv!.role.roleId);
    expect(dealt[3]).toBe('killer');
    expect(dealt[4]).toBe('doctor');
    const flow = flowOf(room);
    expect(flow.deck).toEqual(deckFor(5).cards);
    expect(flow.undealt).toHaveLength(2);
    expect([...dealt, ...flow.undealt].sort()).toEqual([...deckFor(5).cards].sort());
  });

  it('debug.deal refuses a card the deck does not hold, or holds fewer times', async () => {
    const leader = await colyseus.sdk.create('party', opts('Bot0'));
    const rooms = [leader];
    for (let i = 1; i < 5; i++) rooms.push(await colyseus.sdk.joinById(leader.roomId, opts(`Bot${i}`)));
    const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
    const ids = rooms.map((r) => r.sessionId);
    leader.send('debug.deal', { roles: { [ids[0]!]: 'townsfolk' } }); // the class row is in no deck
    leader.send('debug.deal', { roles: { [ids[0]!]: 'killer', [ids[1]!]: 'killer' } }); // one Killer at 5
    await sleep(150);
    expect(flowOf(room).fixedDeal).toBeNull();
  });
});

describe('the Final Night (GDD 3.3, 3.8)', () => {
  /** Grace ends into the Final Night: the day that would start round 5 (`finalNight.afterCycle` 4). */
  async function toFinalNight(n = 5) {
    const m = await startParty(colyseus, n);
    m.room.state.round = balance.finalNight.afterCycle;
    await skipPhase(m);
    return m;
  }

  it('replaces the day of round 5 with a hunt of finalNight.huntS', async () => {
    const m = await toFinalNight();
    const s = m.room.state;
    expect(s.phase).toBe(Phase.finalNight);
    expect(s.round).toBe(balance.finalNight.afterCycle + 1);
    expect(Math.abs(s.phaseEndsTick - s.tick - balance.finalNight.huntS * TICK_RATE)).toBeLessThanOrEqual(4);
  });

  it('comes after the night or the immunity of round 4, never after round 3', async () => {
    const m = await startParty(colyseus, 5);
    m.room.state.round = balance.finalNight.afterCycle - 1;
    await skipPhase(m); // grace -> day of round 4
    expect(m.room.state.phase).toBe(Phase.day);
    await skipPhase(m);
    await skipPhase(m);
    await skipPhase(m); // night -> the Final Night
    expect(m.room.state.phase).toBe(Phase.finalNight);
  });

  it('cuts every Knife cooldown to finalNight.killCooldownS and leaves a shorter one alone', async () => {
    const m = await startParty(colyseus, 5);
    m.room.state.round = balance.finalNight.afterCycle;
    seat(m, 0).priv!.cooldownEndTick.set('kill', m.room.state.tick + 5000);
    await skipPhase(m);
    const left = seat(m, 0).priv!.cooldownEndTick.get('kill')! - m.room.state.tick;
    expect(left).toBeLessThanOrEqual(balance.finalNight.killCooldownS * TICK_RATE);
    expect(left).toBeGreaterThan(0);
    m.room.state.round = 0;
  });

  // Round 10, B6d (6Z's grant): the end trial replaced the forced meeting and its vote (GDD 3.8, seams.md 3 row 35).
  /** The end trial's next step at once (its own clock, not the phase's). */
  const skipStep = async (m: Awaited<ReturnType<typeof toFinalNight>>) => {
    m.room.state.tribunal.untilTick = m.room.state.tick;
    await sleep(150);
  };
  /** Steps the end trial until the match is over. */
  const runOut = async (m: Awaited<ReturnType<typeof toFinalNight>>) => {
    for (let i = 0; i < 20 && m.room.state.phase !== Phase.gameOver; i++) await skipStep(m);
  };
  const killerIdx = (m: Awaited<ReturnType<typeof toFinalNight>>) =>
    [0, 1, 2, 3, 4].find((i) => seat(m, i).priv!.role.roleId === 'killer')!;
  /**
   * Two filers' murder cases against `of`, each with one Verified entry fitting its public traits
   * (`meeting.presentPerPlayer` is 1): two matches, `trial.murderAt`.
   */
  const fileAgainst = (m: Awaited<ReturnType<typeof toFinalNight>>, filers: number[], of: number): void => {
    const t = seat(m, of).traits;
    const fit: [number, number][] = [
      [ClueKind.footprints, t.height],
      [ClueKind.thread, t.scarf],
    ];
    filers.forEach((by, i) => {
      const notebook = seat(m, by).priv!.notebook;
      const e = new NotebookEntry();
      e.id = `entry_f${notebook.length + 1}`;
      [e.clueKind, e.value] = fit[i]!;
      e.sceneId = 1;
      e.status = NotebookStatus.verified;
      notebook.push(e);
      handleFile(m.room, idOf(m, by), { accused: idOf(m, of), charge: 'murder', entries: [e.id] });
    });
  };

  it('opens the end trial, its gathering first, when the hunt runs out', async () => {
    const m = await toFinalNight();
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.tribunal);
    expect(m.room.state.tribunal.step).toBe(TribunalStep.gathering);
    expect(endTrialOpen(m.room)).toBe(true);
  });

  it('ends the hunt at once on a body report (finalNight.reportEndsHunt)', async () => {
    const m = await toFinalNight();
    request(m, 1, 2);
    expect(await until(() => m.room.state.phase === Phase.tribunal)).toBe(true);
    expect(m.room.state.tribunal.step).toBe(TribunalStep.gathering);
  });

  it('refuses a filing outside the filing window, and nothing is voted', async () => {
    const m = await toFinalNight();
    await skipPhase(m); // the gathering
    handleFile(m.room, idOf(m, 1), { accused: idOf(m, 2), charge: 'murder', entries: [] });
    await sleep(150);
    expect(events(m.bots[1]!, 'error').at(-1)).toMatchObject({ reason: 'PHASE_CLOSED' });
    expect(seat(m, 1).hasVoted).toBe(false);
  });

  it('ends the match for the Cabal, the Killer Unseen, when no case is filed', async () => {
    const m = await toFinalNight();
    await skipPhase(m);
    await runOut(m);
    expect(m.room.state.phase).toBe(Phase.gameOver);
    expect(m.room.state.winner).toBe(Winner.cabal);
    expect(events(m.bots[0]!, 'gameOver').at(-1)).toMatchObject({ unseen: true });
  });

  it('ends the match for the Village when the end trial convicts the Killer of murder', async () => {
    const m = await toFinalNight();
    const k = killerIdx(m);
    await skipPhase(m);
    await skipStep(m); // the gathering -> the filing
    fileAgainst(m, [0, 1, 2, 3, 4].filter((i) => i !== k).slice(0, 2), k);
    await runOut(m);
    expect(m.room.state.winner).toBe(Winner.village);
    expect(events(m.bots[0]!, 'gameOver').at(-1)).not.toHaveProperty('unseen');
  });

  it('ends the match for the Cabal when the end trial hangs a villager', async () => {
    const m = await toFinalNight();
    const k = killerIdx(m);
    const [v, ...rest] = [0, 1, 2, 3, 4].filter((i) => i !== k);
    await skipPhase(m);
    await skipStep(m);
    fileAgainst(m, rest.slice(0, 2), v!);
    await runOut(m);
    expect(simOf(m.room).players.get(idOf(m, v!))!.dead).toBe(true);
    expect(m.room.state.winner).toBe(Winner.cabal);
  });
});
