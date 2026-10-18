import type { ColyseusTestServer } from '@colyseus/testing';
import { onubBalance } from '@wdi/content';
import { ErrorCode, type GameStateType, type OnubGameOver, Phase, TICK_RATE, Winner } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { matchLog } from '../src/services/MatchLog';
import { bootFlowServer } from './flowHelpers';
import {
  type NightMatch,
  type NightTable,
  TABLE5,
  clock,
  errorsOf,
  msgs,
  startNightMatch,
  until,
} from './onubNightHelpers';
import { type Bot, sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
let logged: Array<Record<string, unknown>> = [];
beforeAll(async () => {
  ({ colyseus, release } = await bootFlowServer());
  matchLog.write = (line) => logged.push(JSON.parse(line) as Record<string, unknown>);
});
afterAll(async () => release());
beforeEach(async () => {
  logged = [];
  await colyseus.cleanup();
});

const publicOf = (bot: Bot) => bot.room.state as unknown as GameStateType;
const ticks = (s: number): number => Math.round(s * TICK_RATE);
const { timers } = onubBalance;

/** Dawn, then the Rush: the whole night skipped, the dawn clock run out. */
async function toRush(m: NightMatch): Promise<void> {
  await clock(m, { phase: 'dawn' });
  m.room.state.phaseEndsTick = m.room.state.tick;
  expect(await until(() => m.room.state.phase === Phase.meetingDiscussion)).toBe(true);
}

/** The Rush clock run out: CRUST opens. */
async function toCrust(m: NightMatch): Promise<void> {
  await toRush(m);
  m.room.state.phaseEndsTick = m.room.state.tick;
  expect(await until(() => m.room.state.phase === Phase.meetingVote)).toBe(true);
}

const vote = (m: NightMatch, from: number, targetId: string): void =>
  (m.bots[from] as Bot).room.send('meeting.vote', { targetId });
const id = (m: NightMatch, i: number): string => (m.bots[i] as Bot).id;

/** Everyone in `from` votes `target` (a seat index or 'pantry'), then waits until the server has all of them. */
async function voteFor(m: NightMatch, from: number[], target: number | 'pantry'): Promise<void> {
  const targetId = target === 'pantry' ? 'pantry' : id(m, target);
  for (const i of from) vote(m, i, targetId);
  await until(() => from.every((i) => m.room.state.players.get(id(m, i))?.hasVoted === true));
}

/** CRUST open, the countdown played (white-box), then run to the end of the reveal's vote. */
async function endCrust(m: NightMatch): Promise<void> {
  m.room.state.phaseEndsTick = m.room.state.tick;
  expect(await until(() => m.room.state.phase === Phase.reveal)).toBe(true);
}

/** The first `voteResult` the bot received (waits for the message to cross the wire). */
async function resultOf(bot: Bot): Promise<Record<string, unknown>> {
  await until(() => msgs(bot, 'voteResult').length > 0);
  return msgs(bot, 'voteResult')[0] as Record<string, unknown>;
}

async function gameOverOf(bot: Bot) {
  await until(() => msgs(bot, 'gameOver').length > 0);
  return msgs(bot, 'gameOver').at(-1) as {
    winner: number;
    roles: Record<string, string>;
    summary: string;
    onub: OnubGameOver;
  };
}

describe('dawn and the Morning Rush', () => {
  it('opens the Rush after the dawn clock with a dawn meeting, empty claims and nobody voted', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await clock(m, { phase: 'dawn' });
    expect(m.room.state.phase).toBe(Phase.dawn);
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeLessThanOrEqual(ticks(timers.dawnS));
    m.room.state.players.forEach((p) => {
      p.hasVoted = true; // stale values must be reset
    });
    m.room.state.phaseEndsTick = m.room.state.tick;
    await until(() => m.room.state.phase === Phase.meetingDiscussion);
    await until(() => msgs(m.bots[2]!, 'meetingStart').length > 0);
    const start = msgs(m.bots[2]!, 'meetingStart')[0];
    expect(start).toEqual({ reason: 'dawn', callerId: '', missing: [] });
    expect(m.room.state.meeting.claims.length).toBe(0);
    m.room.state.players.forEach((p) => expect(p.hasVoted).toBe(false));
    const left = m.room.state.phaseEndsTick - m.room.state.tick;
    expect(left).toBeLessThanOrEqual(ticks(timers.rushS));
    expect(left).toBeGreaterThan(ticks(timers.rushS) - 20);
    expect(m.room.state.meeting.phase).toBe(Phase.meetingDiscussion);
  });

  it('never ends the Rush early, even when every seat has voted', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toRush(m);
    await voteFor(m, [0, 1, 2, 3, 4], 1);
    await voteFor(m, [1], 0);
    await sleep(300);
    expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
    m.room.state.phaseEndsTick = m.room.state.tick;
    await until(() => m.room.state.phase === Phase.meetingVote);
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeLessThanOrEqual(ticks(timers.voteS));
  });

  it('keeps CRUST open for its countdown even when everyone has voted, then ends it early', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toRush(m);
    for (let i = 0; i < 5; i++) vote(m, i, id(m, (i + 1) % 5));
    await until(() => [...m.room.state.players.values()].every((p) => p.hasVoted));
    m.room.state.phaseEndsTick = m.room.state.tick;
    await until(() => m.room.state.phase === Phase.meetingVote);
    await sleep(500); // inside the 3 s countdown
    expect(m.room.state.phase).toBe(Phase.meetingVote);
    // Shift the clock so only half a second of the countdown remains, then it may end at once.
    m.room.state.phaseEndsTick = m.room.state.tick + ticks(timers.voteS) - ticks(timers.crustCountdownS) + 5;
    await until(() => m.room.state.phase === Phase.reveal, 3000);
    expect(m.room.state.phase).toBe(Phase.reveal);
  });

  it('waits out the full CRUST clock while a seat in play has not voted', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toCrust(m);
    await voteFor(m, [0, 1, 2, 3], 4);
    m.room.state.phaseEndsTick = m.room.state.tick + ticks(timers.voteS) - ticks(timers.crustCountdownS) + 5;
    await sleep(500);
    expect(m.room.state.phase).toBe(Phase.meetingVote);
    await vote(m, 4, id(m, 0));
    await until(() => m.room.state.phase === Phase.reveal, 3000);
    expect(m.room.state.phase).toBe(Phase.reveal);
  });
});

describe('claims', () => {
  const claim = (m: NightMatch, i: number, payload: Record<string, unknown>) =>
    (m.bots[i] as Bot).room.send('meeting.claim', payload);

  it('stores one structured claim per seat and replaces it with the next', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toRush(m);
    claim(m, 1, {
      roleId: 'chef',
      stationId: 'oven',
      cardId: 'oakFirewood',
      saw: [
        { targetId: id(m, 2), roleId: 'sousChef' },
        { targetId: 'pantry', stationId: 'mixer' },
      ],
    });
    await until(() => m.room.state.meeting.claims.length === 1);
    const c = m.room.state.meeting.claims[0]!;
    expect([c.from, c.roleId, c.stationId, c.cardId]).toEqual([id(m, 1), 'chef', 'oven', 'oakFirewood']);
    expect(c.saw.map((s) => [s.targetId, s.roleId, s.stationId])).toEqual([
      [id(m, 2), 'sousChef', ''],
      ['pantry', '', 'mixer'],
    ]);
    claim(m, 3, { roleId: 'aboyeur' });
    claim(m, 1, { roleId: 'inspecteur' });
    await until(() => m.room.state.meeting.claims[0]?.roleId === 'inspecteur');
    expect(m.room.state.meeting.claims.length).toBe(2);
    expect(m.room.state.meeting.claims[0]!.stationId).toBe('');
    expect(m.room.state.meeting.claims[0]!.saw.length).toBe(0);
    // Public: another seat's client reads it.
    await until(() => publicOf(m.bots[4]!).meeting.claims.length === 2);
    expect(publicOf(m.bots[4]!).meeting.claims.map((x) => x.roleId)).toEqual(['inspecteur', 'aboyeur']);
  });

  it('also takes claims during CRUST', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toCrust(m);
    claim(m, 2, { roleId: 'sousChef' });
    await until(() => m.room.state.meeting.claims.length === 1);
    expect(m.room.state.meeting.claims.length).toBe(1);
  });

  it('refuses 422 for a role outside the deck, unknown ids, a card of another station, too many sightings and a bad target', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toRush(m);
    const bad: Record<string, unknown>[] = [
      { roleId: 'boulanger' }, // not in this deck
      { roleId: 'nonsense' },
      {},
      { roleId: 'chef', stationId: 'garage' },
      { roleId: 'chef', stationId: 'oven', cardId: 'pureDairy' },
      { roleId: 'chef', cardId: 'nonsense' },
      { roleId: 'chef', saw: [{ targetId: id(m, 1) }, { targetId: id(m, 2) }, { targetId: id(m, 3) }] },
      { roleId: 'chef', saw: [{ targetId: 'nobody', roleId: 'chef' }] },
      { roleId: 'chef', saw: [{ targetId: id(m, 2), roleId: 'nonsense' }] },
      { roleId: 'chef', saw: [{ targetId: id(m, 2), stationId: 'nonsense' }] },
      { roleId: 'chef', saw: 'many' },
    ];
    for (const p of bad) claim(m, 1, p);
    await until(() => errorsOf(m.bots[1]!).length >= bad.length);
    expect(errorsOf(m.bots[1]!)).toEqual(bad.map(() => ErrorCode.cannot));
    expect(m.room.state.meeting.claims.length).toBe(0);
  });

  it('refuses 425 outside the Rush and CRUST, and 422 for a seat that left', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    claim(m, 1, { roleId: 'chef' });
    await until(() => errorsOf(m.bots[1]!).length > 0);
    expect(errorsOf(m.bots[1]!)).toEqual([ErrorCode.wrongPhase]);
    await toRush(m);
    m.room.state.players.get(id(m, 3))!.connected = false;
    claim(m, 3, { roleId: 'croissant' });
    await until(() => errorsOf(m.bots[3]!).length > 0);
    expect(errorsOf(m.bots[3]!)).toEqual([ErrorCode.cannot]);
    await endCrustFromRush(m);
    claim(m, 1, { roleId: 'chef' });
    await until(() => errorsOf(m.bots[1]!).length > 1);
    expect(errorsOf(m.bots[1]!).at(-1)).toBe(ErrorCode.wrongPhase);
  });
});

async function endCrustFromRush(m: NightMatch): Promise<void> {
  m.room.state.phaseEndsTick = m.room.state.tick;
  await until(() => m.room.state.phase === Phase.meetingVote);
  await endCrust(m);
}

describe('the vote', () => {
  it('accepts a seat or the Pantry, changes, and shows only who has voted', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toRush(m);
    vote(m, 1, id(m, 2));
    await until(() => m.room.state.players.get(id(m, 1))?.priv?.myVote === id(m, 2));
    vote(m, 1, 'pantry');
    await until(() => m.room.state.players.get(id(m, 1))?.priv?.myVote === 'pantry');
    expect(m.room.state.players.get(id(m, 1))!.hasVoted).toBe(true);
    expect(errorsOf(m.bots[1]!)).toEqual([]);
    await until(() => publicOf(m.bots[3]!).players.get(id(m, 1))?.hasVoted === true);
    // Another seat sees that seat 1 voted, never for whom (no private view of it at all).
    expect(publicOf(m.bots[3]!).players.get(id(m, 1))?.priv).toBeUndefined();
  });

  it('refuses 422 for Skip, a self vote, an unknown target and a seat that left', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toRush(m);
    m.room.state.players.get(id(m, 4))!.connected = false;
    for (const target of ['skip', id(m, 1), 'nobody', id(m, 4)]) vote(m, 1, target);
    await until(() => errorsOf(m.bots[1]!).length >= 4);
    expect(errorsOf(m.bots[1]!)).toEqual([
      ErrorCode.cannot,
      ErrorCode.cannot,
      ErrorCode.cannot,
      ErrorCode.cannot,
    ]);
    expect(m.room.state.players.get(id(m, 1))!.hasVoted).toBe(false);
  });

  it('refuses 425 before the Rush', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    vote(m, 1, id(m, 2));
    await until(() => errorsOf(m.bots[1]!).length > 0);
    expect(errorsOf(m.bots[1]!)).toEqual([ErrorCode.wrongPhase]);
  });
});

describe('the reveal', () => {
  it('turns out the top vote, names the abstainers and the roles of those in the oven only', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toCrust(m);
    await voteFor(m, [1, 2, 3], 0);
    await voteFor(m, [0], 1);
    await endCrust(m); // seat 4 abstains
    const result = await resultOf(m.bots[2]!);
    expect(result).toEqual({
      tally: { [id(m, 0)]: 3, [id(m, 1)]: 1 },
      outs: [id(m, 0)],
      hop: '',
      pantryOut: false,
      roles: { [id(m, 0)]: 'champignon' },
      abstained: [id(m, 4)],
    });
    expect(m.room.state.players.get(id(m, 0))!.alive).toBe(false);
    expect(m.room.state.players.get(id(m, 1))!.alive).toBe(true);
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeLessThanOrEqual(ticks(timers.revealS));
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeGreaterThan(ticks(timers.revealS) - 20);
    // Nothing else about the final cards is public yet.
    await sleep(100);
    for (const b of m.bots) expect(JSON.stringify(msgs(b, 'voteResult'))).not.toContain('sousChef');
  });

  it('turns out every tie, and the Pantry at the top removes nobody', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toCrust(m);
    await voteFor(m, [2, 3], 0);
    await voteFor(m, [0, 4], 1);
    vote(m, 1, 'pantry');
    await until(() => m.room.state.players.get(id(m, 1))?.priv?.myVote === 'pantry');
    await endCrust(m);
    const r = (await resultOf(m.bots[0]!)) as { outs: string[]; pantryOut: boolean };
    expect(r.outs).toEqual([id(m, 0), id(m, 1)]);
    expect(r.pantryOut).toBe(false);
    const p = await startNightMatch(colyseus, TABLE5);
    await toCrust(p);
    await voteFor(p, [0, 1, 2], 'pantry');
    await endCrust(p);
    const r2 = (await resultOf(p.bots[0]!)) as {
      outs: string[];
      pantryOut: boolean;
      tally: Record<string, number>;
    };
    expect(r2.outs).toEqual([]);
    expect(r2.pantryOut).toBe(true);
    expect(r2.tally.pantry).toBe(3);
  });

  it('turns out nobody under the minimum number of votes', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toCrust(m);
    vote(m, 1, id(m, 0));
    vote(m, 2, id(m, 3));
    await until(() => m.room.state.players.get(id(m, 2))?.hasVoted === true);
    await endCrust(m);
    expect(((await resultOf(m.bots[0]!)) as { outs: string[] }).outs).toEqual([]);
  });

  it('drags in the vote of a final Critique, judged on the final cards', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    m.o.cards.roles.set('seat.4.role', 'chef');
    m.o.cards.roles.set('seat.1.role', 'critique'); // the night moved the Critique to seat 1
    await toCrust(m);
    await voteFor(m, [0, 2, 3], 1);
    await voteFor(m, [1], 2);
    await endCrust(m);
    const r = (await resultOf(m.bots[0]!)) as {
      outs: string[];
      hop: string;
      roles: Record<string, string>;
    };
    expect(r.outs).toEqual([id(m, 1), id(m, 2)]);
    expect(r.hop).toBe(id(m, 2));
    expect(r.roles).toEqual({ [id(m, 1)]: 'critique', [id(m, 2)]: 'sousChef' });
  });

  it('lets the turned-out talk on the ghost channel', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await toCrust(m);
    await voteFor(m, [1, 2, 3], 0);
    await endCrust(m);
    (m.bots[0] as Bot).room.send('chat.say', { text: 'boo' });
    (m.bots[1] as Bot).room.send('chat.say', { text: 'hello' });
    await until(() => msgs(m.bots[1]!, 'chat.msg').length >= 2);
    expect(msgs(m.bots[0]!, 'chat.msg').map((c) => c.channel)).toEqual(['ghost', 'meeting']);
    expect(msgs(m.bots[3]!, 'chat.msg').map((c) => c.text)).toEqual(['hello']);
  });
});

describe('game over', () => {
  async function playOut(m: NightMatch, votes: Array<[number[], number | 'pantry']>): Promise<void> {
    await toCrust(m);
    for (const [from, to] of votes) await voteFor(m, from, to);
    await endCrust(m);
    m.room.state.phaseEndsTick = m.room.state.tick;
    expect(await until(() => m.room.state.phase === Phase.gameOver)).toBe(true);
    await sleep(100);
  }

  it('judges the Spore in the oven: the Bakers win, with every card, pile and act of the night', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    m.o.commits.set(id(m, 0), { station: 'fridge', card: 'spoiledMilk' });
    m.o.commits.set(id(m, 1), { station: 'mixer', card: 't55Flour' });
    m.o.prepAuto.add(id(m, 1));
    m.o.prep = {
      piles: { fridge: { cards: ['spoiledMilk'], lost: [], net: 1, underMixed: false } },
      ruinWeight: 1,
      ruined: false,
      perk: null,
    };
    await clock(m, { phase: 'night' });
    await clock(m, { window: 'sousChef' });
    (m.bots[2] as Bot).room.send('act.ability', { abilityId: 'onub.rob', targets: ['seat.0.role'] });
    await until(() => m.o.actLog.length === 1);
    await clock(m, { phase: 'dawn' });
    m.room.state.phaseEndsTick = m.room.state.tick;
    await until(() => m.room.state.phase === Phase.meetingDiscussion);
    await playOutFrom(m, [
      [[1, 3, 4], 2],
      [[2], 0],
    ]);
    const over = await gameOverOf(m.bots[3]!);
    // The Sous-Chef took the Spore's card and was baked holding it: the Bakers win.
    expect(over.onub.final[id(m, 2)]).toBe('champignon');
    expect(over.onub.final[id(m, 0)]).toBe('sousChef');
    expect(over.onub.rowId).toBe('sporeOut');
    expect(over.winner).toBe(Winner.village);
    expect(over.onub.winnerIds).toEqual([id(m, 0), id(m, 1), id(m, 4)]);
    expect(over.summary).toBe(onubBalance.winners.find((w) => w.id === 'sporeOut')!.text);
    expect(over.roles).toEqual(over.onub.final);
    expect(over.onub.dealt[id(m, 2)]).toBe('sousChef');
    expect(over.onub.dealtLoc).toMatchObject({ [id(m, 0)]: 'fridge', [id(m, 1)]: 'mixer' });
    expect(over.onub.prepCards[id(m, 0)]).toBe('spoiledMilk');
    expect(over.onub.prepAuto).toEqual([id(m, 1)]);
    expect(over.onub.pantryRolesDealt).toEqual(TABLE5.pantryRoles);
    expect(over.onub.piles.fridge!.net).toBe(1);
    expect(over.onub.actLog).toHaveLength(1);
    expect(over.onub.votes[id(m, 1)]).toBe(id(m, 2));
    expect(over.onub.outs).toEqual([id(m, 2)]);
    expect(over.onub.seats).toEqual(m.o.seats);
    expect(m.room.state.winner).toBe(Winner.village);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ winner: 'village', mode: 'onub', onub: { rowId: 'sporeOut' } });
  });

  async function playOutFrom(m: NightMatch, votes: Array<[number[], number | 'pantry']>): Promise<void> {
    m.room.state.phaseEndsTick = m.room.state.tick;
    await until(() => m.room.state.phase === Phase.meetingVote);
    for (const [from, to] of votes) await voteFor(m, from, to);
    await endCrust(m);
    m.room.state.phaseEndsTick = m.room.state.tick;
    expect(await until(() => m.room.state.phase === Phase.gameOver)).toBe(true);
    await sleep(100);
  }

  it('lets the Croissant win alone when baked', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await playOut(m, [[[0, 1, 2, 4], 3]]);
    const over = await gameOverOf(m.bots[0]!);
    expect(over.onub.rowId).toBe('croissant');
    expect(over.onub.winnerIds).toEqual([id(m, 3)]);
    expect(m.room.state.winner).toBe(Winner.croissant);
  });

  it('gives Team Mold the win when no Spore is baked, and nobody wins a wrong oven with no Mold card', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await playOut(m, [[[0, 2, 3, 4], 1]]);
    expect((await gameOverOf(m.bots[0]!)).onub.rowId).toBe('sporesHide');
    expect(m.room.state.winner).toBe(Winner.cabal);
    const t: NightTable = {
      ...TABLE5,
      roles: ['chef', 'aboyeur', 'sousChef', 'plongeur', 'critique'],
      pantryRoles: ['champignon', 'inspecteur', 'croissant'],
    };
    const w = await startNightMatch(colyseus, t);
    await playOut(w, [[[1, 2, 3, 4], 0]]);
    const over = await gameOverOf(w.bots[0]!);
    expect(over.onub.rowId).toBe('wrongOven');
    expect(over.onub.winnerIds).toEqual([]);
    expect(w.room.state.winner).toBe(Winner.nobody);
  });

  it('lets a ruined dough decide for Team Mold', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    m.o.prep = { piles: {}, ruinWeight: 4, ruined: true, perk: null };
    await playOut(m, [[[1, 2, 3, 4], 0]]);
    const over = await gameOverOf(m.bots[0]!);
    expect(over.onub.rowId).toBe('ruined');
    expect(over.onub.ruined).toBe(true);
    expect(over.onub.winnerIds).toEqual([id(m, 0)]);
  });

  it('keeps the cards of a seat that left, which still win or lose', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    m.room.state.players.get(id(m, 0))!.connected = false; // the Spore left
    await playOut(m, [[[1, 2, 3, 4], 3]]);
    const over = await gameOverOf(m.bots[1]!);
    expect(over.onub.rowId).toBe('croissant');
    expect(over.onub.final[id(m, 0)]).toBe('champignon');
  });

  it('returns to the lobby with the same code, mode and deck, everything per-match cleared', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await playOut(m, [[[0, 1, 2, 4], 3]]);
    m.room.state.phaseEndsTick = m.room.state.tick;
    expect(await until(() => m.room.state.phase === Phase.lobby)).toBe(true);
    expect(m.room.state.meeting.claims.length).toBe(0);
    expect(m.room.state.onub.window).toBe('');
    expect(m.room.state.onub.cloche).toBe('');
    expect(m.room.state.winner).toBe(Winner.none);
    expect(m.room.state.settings.mode).toBe(1);
    m.room.state.players.forEach((p) => {
      expect(p.hasVoted).toBe(false);
      expect(p.priv?.myVote).toBe('');
      expect(p.priv?.nightReveal.length).toBe(0);
    });
    expect(m.room.state.onub.seats.length).toBe(0);
  });
});
