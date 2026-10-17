import type { ColyseusTestServer } from '@colyseus/testing';
import { onubBalance, onubFor, onubRoles } from '@wdi/content';
import { GameMode, Phase, Winner } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type MatchRecord, matchLog } from '../src/services/MatchLog';
import { bootFlowServer } from './flowHelpers';
import {
  castVotes,
  codes,
  events,
  leader,
  onub,
  scenesSeen,
  startOnub,
  toMeeting,
  until,
} from './onubHelpers';
import { type Match, sleep, stateOf } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
const lines: string[] = [];
const write = matchLog.write;
beforeAll(async () => {
  ({ colyseus, release } = await bootFlowServer());
  matchLog.write = (line) => void lines.push(line);
});
afterAll(async () => {
  matchLog.write = write;
  await release();
});
beforeEach(async () => {
  lines.length = 0;
  await colyseus.cleanup();
});

/** Two Poisoners, the Hireling, the Debtor, the Cutpurse and the Sin-Eater; the dead hold Busybody and two Mourners. */
const RIG6 = {
  Bot0: 'poisoner',
  Bot1: 'poisoner',
  Bot2: 'hireling',
  Bot3: 'debtor',
  Bot4: 'cutpurse',
  Bot5: 'sinEater',
};
/** No Poisoner at the table: both of them lie with the dead. */
const CLEAN6 = {
  Bot0: 'hireling',
  Bot1: 'debtor',
  Bot2: 'cutpurse',
  Bot3: 'sinEater',
  Bot4: 'busybody',
  Bot5: 'mourner',
};

const ids = (m: Match, ...idx: number[]) => idx.map((i) => m.bots[i]!.id);

async function toReveal(m: Match): Promise<void> {
  expect(await until(() => m.room.state.phase === Phase.reveal)).toBe(true);
  expect(await until(() => m.bots.every((b) => events(b, 'voteResult').length > 0))).toBe(true);
}

async function toGameOver(m: Match): Promise<void> {
  await toReveal(m);
  m.room.state.phaseEndsTick = m.room.state.tick;
  expect(await until(() => m.room.state.phase === Phase.gameOver)).toBe(true);
  expect(await until(() => m.bots.every((b) => events(b, 'gameOver').length > 0))).toBe(true);
}

describe('the dawn meeting (GDD 3.11)', () => {
  it('opens with reason dawn, the traces of every window, and moves nobody', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    const enters = m.bots.map((b) => events(b, 'sceneEnter').length);
    await toMeeting(m);
    for (const [i, b] of m.bots.entries()) {
      expect(events(b, 'meetingStart')).toEqual([{ reason: 'dawn', callerId: '', missing: [] }]);
      expect(events(b, 'sceneEnter')).toHaveLength(enters[i]!);
      expect(scenesSeen(b)).toEqual([]);
    }
    expect([...m.room.state.meeting.traces]).toEqual(
      onub(m)
        .script.map((w) => onubBalance.windows.find((d) => d.role === w.role)?.traceText ?? '')
        .filter(Boolean),
    );
    expect(m.room.state.meeting.traces.length).toBe(onub(m).script.length);
    expect(m.room.state.meeting.reason).toBe('dawn');
    const wait = m.room.state.phaseEndsTick - m.room.state.tick;
    expect(wait).toBeLessThanOrEqual(onubFor(6).discussionS * 20);
    expect(wait).toBeGreaterThan(onubFor(6).discussionS * 20 - 60);
    m.room.state.players.forEach((p) => expect(p.sceneId).toBe(255));
  }, 30_000);

  it('refuses Skip and a self-vote 422, accepts a living other seat, and changes a vote', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    await toMeeting(m);
    const a = m.bots[0]!;
    a.room.send('meeting.vote', { targetId: 'skip' });
    a.room.send('meeting.vote', { targetId: a.id });
    a.room.send('meeting.vote', { targetId: 'nobody' });
    await sleep(250);
    expect(codes(a)).toEqual([422, 422, 422]);
    expect(m.room.state.players.get(a.id)?.hasVoted).toBe(false);
    a.room.send('meeting.vote', { targetId: m.bots[1]!.id });
    await sleep(150);
    expect(m.room.state.players.get(a.id)?.hasVoted).toBe(true);
    expect(m.room.state.players.get(a.id)?.priv?.myVote).toBe(m.bots[1]!.id);
    a.room.send('meeting.vote', { targetId: m.bots[2]!.id });
    await sleep(150);
    expect(m.room.state.players.get(a.id)?.priv?.myVote).toBe(m.bots[2]!.id);
  }, 30_000);

  it('turns out both seats on a tie, names no abstainer, sends no killed, and the Cabal wins', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    await toMeeting(m);
    // Bot2 (Hireling) and Bot4 (Cutpurse) hold two votes each; Bot5 one, Bot1 one.
    const target = [2, 2, 4, 4, 5, 1];
    await castVotes(m, (i) => m.bots[target[i]!]!.id);
    await toReveal(m);
    const result = events(m.bots[0]!, 'voteResult').at(-1);
    expect(result).toEqual({
      tally: { [m.bots[2]!.id]: 2, [m.bots[4]!.id]: 2, [m.bots[5]!.id]: 1, [m.bots[1]!.id]: 1 },
      outs: ids(m, 2, 4),
      roles: { [m.bots[2]!.id]: 'hireling', [m.bots[4]!.id]: 'cutpurse' },
      abstained: [],
    });
    expect(result).not.toHaveProperty('ejectedId');
    for (const b of m.bots) expect(events(b, 'killed')).toEqual([]);
    for (const i of [2, 4]) expect(m.room.state.players.get(m.bots[i]!.id)?.alive).toBe(false);
    for (const i of [0, 1, 3, 5]) expect(m.room.state.players.get(m.bots[i]!.id)?.alive).toBe(true);
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeLessThanOrEqual(
      onubBalance.timers.revealS * 20,
    );
  }, 30_000);

  it('ends the vote early when every connected seat has voted', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    await toMeeting(m);
    expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
    await castVotes(m, (i) => m.bots[(i + 1) % 6]!.id);
    expect(await until(() => m.room.state.phase === Phase.reveal)).toBe(true);
  }, 30_000);

  it('names the abstainers, and a vote phase of its own length follows the discussion', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    await toMeeting(m);
    m.room.state.phaseEndsTick = m.room.state.tick;
    expect(await until(() => m.room.state.phase === Phase.meetingVote)).toBe(true);
    const left = m.room.state.phaseEndsTick - m.room.state.tick;
    expect(left).toBeLessThanOrEqual(onubBalance.timers.voteS * 20);
    expect(left).toBeGreaterThan(onubBalance.timers.voteS * 20 - 60);
    const target = [4, 4, 4, 4, 0, undefined];
    await castVotes(m, (i) => (target[i] === undefined ? undefined : m.bots[target[i]!]!.id));
    expect(m.room.state.phase).toBe(Phase.meetingVote); // Bot5 has not voted
    m.room.state.phaseEndsTick = m.room.state.tick;
    await toReveal(m);
    const result = events(m.bots[0]!, 'voteResult').at(-1);
    expect(result?.abstained).toEqual(ids(m, 5));
    expect(result?.outs).toEqual(ids(m, 4));
  }, 30_000);

  it('turns out nobody when nobody holds enough votes', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    await toMeeting(m);
    await castVotes(m, (i) => m.bots[(i + 1) % 6]!.id); // one vote each
    await toReveal(m);
    const result = events(m.bots[0]!, 'voteResult').at(-1);
    expect(result?.outs).toEqual([]);
    expect(result?.roles).toEqual({});
    expect(onubBalance.vote.minVotesToTurnOut).toBeGreaterThan(1);
  }, 30_000);

  it('lets a leaver abstain: the match goes on and the early end counts only connected seats', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    await toMeeting(m);
    await m.bots[5]!.room.leave();
    expect(await until(() => m.room.state.players.get(m.bots[5]!.id)?.connected === false)).toBe(true);
    await sleep(200);
    expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
    const voters = m.bots.slice(0, 5);
    for (const [i, b] of voters.entries()) b.room.send('meeting.vote', { targetId: voters[(i + 1) % 5]!.id });
    await toReveal({ ...m, bots: voters });
    const result = events(m.bots[0]!, 'voteResult').at(-1);
    expect(result?.abstained).toEqual([]); // the leaver is not a living seat
    expect(result?.outs).toEqual([]);
    // Nobody can vote for the leaver either.
  }, 30_000);
});

describe('the end of a quick-mode match (GDD 3.11)', () => {
  it('judges the winners on the final loaves and sends the end screen', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    await toMeeting(m);
    await castVotes(m, (i) => m.bots[[2, 2, 4, 4, 5, 1][i]!]!.id);
    await toGameOver(m);
    const o = onub(m);
    const over = events(m.bots[3]!, 'gameOver').at(-1)!;
    expect(m.room.state.winner).toBe(Winner.cabal);
    expect(over.winner).toBe(Winner.cabal);
    const row = onubBalance.winners.find((r) => r.id === 'cabalSurvives')!;
    expect(over.summary).toBe(row.text);
    const final = Object.fromEntries(
      m.bots.map((b) => [b.id, o.loaves.get(`bk.plate_${o.slotOf.get(b.id)}`)]),
    );
    expect(over.roles).toEqual(final);
    expect(over.onub).toEqual({
      dealt: Object.fromEntries(o.dealt),
      final,
      center: ['bk.deadloaf_0', 'bk.deadloaf_1', 'bk.deadloaf_2'].map((p) => o.loaves.get(p)),
      swapLog: [],
      votes: Object.fromEntries(m.bots.map((b, i) => [b.id, m.bots[[2, 2, 4, 4, 5, 1][i]!]!.id])),
      outs: ids(m, 2, 4),
      plates: Object.fromEntries(m.bots.map((b) => [`bk.plate_${o.slotOf.get(b.id)}`, b.id])),
      rowId: 'cabalSurvives',
      winnerIds: ids(m, 0, 1, 2), // both Poisoners and the Hireling, turned out or not
    });
    for (const b of m.bots) expect(events(b, 'killed')).toEqual([]);
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!) as MatchRecord & { event: string };
    expect(record).toMatchObject({
      event: 'match',
      mode: 'onub',
      winner: 'cabal',
      seats: 6,
      onub: { rowId: 'cabalSurvives', winnerIds: ids(m, 0, 1, 2) },
    });
    expect(record.players.map((p) => p.role)).toEqual(Object.values(RIG6));
    expect(record.players.some((p) => 'isNpc' in p)).toBe(false);
    expect(record.meetings).toHaveLength(1);
    expect(record.meetings[0]).toMatchObject({ reason: 'dawn', outs: ids(m, 2, 4) });
  }, 30_000);

  it('a turned-out Poisoner is a Village win; the Debtor wins alone or with the Village', async () => {
    const poisoner = await startOnub(colyseus, 6, RIG6);
    await toMeeting(poisoner);
    await castVotes(poisoner, (i) => poisoner.bots[i === 0 ? 1 : 0]!.id);
    await toGameOver(poisoner);
    const over = events(poisoner.bots[0]!, 'gameOver').at(-1)!;
    expect(over.winner).toBe(Winner.village);
    // Everyone but Bot0 piles onto Bot0, a Poisoner: turned out alone.
    expect((over.onub as { rowId: string }).rowId).toBe('poisonerOut');

    await colyseus.cleanup();
    const debtor = await startOnub(colyseus, 6, RIG6);
    await toMeeting(debtor);
    await castVotes(debtor, (i) => debtor.bots[i === 3 ? 0 : 3]!.id);
    await toGameOver(debtor);
    const dOver = events(debtor.bots[0]!, 'gameOver').at(-1)!;
    expect(dOver.winner).toBe(Winner.debtor);
    expect((dOver.onub as { rowId: string; winnerIds: string[] }).rowId).toBe('debtorAlone');
    expect((dOver.onub as { winnerIds: string[] }).winnerIds).toEqual(ids(debtor, 3));
  }, 60_000);

  it("with both Poisoners among the dead, nobody out is a Village win and someone out the Hireling's", async () => {
    const calm = await startOnub(colyseus, 6, CLEAN6);
    await toMeeting(calm);
    await castVotes(calm, (i) => calm.bots[(i + 1) % 6]!.id);
    await toGameOver(calm);
    const over = events(calm.bots[0]!, 'gameOver').at(-1)!;
    expect(over.winner).toBe(Winner.village);
    expect((over.onub as { rowId: string }).rowId).toBe('cleanTable');

    await colyseus.cleanup();
    const storm = await startOnub(colyseus, 6, CLEAN6);
    await toMeeting(storm);
    await castVotes(storm, (i) => storm.bots[i === 2 ? 3 : 2]!.id);
    await toGameOver(storm);
    const sOver = events(storm.bots[0]!, 'gameOver').at(-1)!;
    expect((sOver.onub as { rowId: string; winnerIds: string[] }).rowId).toBe('storm');
    expect((sOver.onub as { winnerIds: string[] }).winnerIds).toEqual(ids(storm, 0));
  }, 60_000);

  it('returns to the lobby with the same code and a clean quick-mode memory', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    await toMeeting(m);
    await castVotes(m, (i) => m.bots[(i + 1) % 6]!.id);
    await toGameOver(m);
    m.room.state.phaseEndsTick = m.room.state.tick;
    expect(await until(() => m.room.state.phase === Phase.lobby)).toBe(true);
    expect(() => onub(m)).toThrow();
    expect(m.room.state.settings.mode).toBe(GameMode.onub);
    expect(m.room.state.scenes.get('bakery')!.props.size).toBe(0);
    expect(m.room.state.meeting.claims.length).toBe(0);
    expect(m.room.state.meeting.traces.length).toBe(0);
    m.room.state.players.forEach((p) => {
      expect(p.sceneId).toBe(0);
      expect(p.priv?.nightReveal.length).toBe(0);
      expect(p.priv?.role.roleId).toBe('');
    });
    expect(await until(() => m.bots.every((b) => stateOf(b).phase === Phase.lobby))).toBe(true);
  }, 30_000);
});

describe('claims (GDD 3.11)', () => {
  it("replaces the seat's row in the discussion and the vote, and refuses elsewhere", async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    const a = m.bots[5]!;
    a.room.send('meeting.claim', { roleId: 'sinEater' });
    await sleep(250); // dusk, via the lobby queue
    expect(codes(a)).toEqual([425]);
    await toMeeting(m);
    a.room.send('meeting.claim', { roleId: 'sinEater', targetId: m.bots[4]!.id, sawRoleId: 'cutpurse' });
    await sleep(250);
    const claims = () => [...m.room.state.meeting.claims].map((c) => ({ ...c.toJSON() }));
    expect(claims()).toEqual([
      { from: a.id, roleId: 'sinEater', targetId: m.bots[4]!.id, sawRoleId: 'cutpurse' },
    ]);
    a.room.send('meeting.claim', { roleId: 'mourner' });
    m.bots[0]!.room.send('meeting.claim', { roleId: 'poisoner' });
    await sleep(250);
    expect(claims()).toEqual([
      { from: a.id, roleId: 'mourner', targetId: '', sawRoleId: '' },
      { from: m.bots[0]!.id, roleId: 'poisoner', targetId: '', sawRoleId: '' },
    ]);
    // Unknown roles and seats are refused; the board is untouched.
    a.room.send('meeting.claim', { roleId: 'detective' });
    a.room.send('meeting.claim', { roleId: 'sinEater', targetId: 'nobody' });
    a.room.send('meeting.claim', { roleId: 'sinEater', sawRoleId: 'sheriff' });
    await sleep(250);
    expect(codes(a)).toEqual([425, 422, 422, 422]);
    expect(claims()).toHaveLength(2);
    expect(Object.keys(onubRoles.roles)).toContain('sinEater');

    m.room.state.phaseEndsTick = m.room.state.tick;
    expect(await until(() => m.room.state.phase === Phase.meetingVote)).toBe(true);
    a.room.send('meeting.claim', { roleId: 'sinEater' });
    await sleep(250);
    expect(claims().find((c) => c.from === a.id)?.roleId).toBe('sinEater');

    await castVotes(m, (i) => m.bots[(i + 1) % 6]!.id);
    await toReveal(m);
    a.room.send('meeting.claim', { roleId: 'mourner' });
    await sleep(250);
    expect(codes(a).at(-1)).toBe(425);
    expect(claims().find((c) => c.from === a.id)?.roleId).toBe('sinEater');
  }, 30_000);

  it('talks in the meeting channel only during the meeting', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    const a = m.bots[0]!;
    a.room.send('chat.say', { text: 'too early' });
    await sleep(200);
    expect(codes(a)).toEqual([425]);
    await toMeeting(m);
    a.room.send('chat.say', { text: 'I was the Cutpurse' });
    await sleep(250);
    for (const b of m.bots) {
      expect(events(b, 'chat.msg')).toEqual([{ from: a.id, text: 'I was the Cutpurse', channel: 'meeting' }]);
    }
  }, 30_000);
});

describe('debug.clock in quick mode', () => {
  it('refuses a window outside the night and an unknown phase', async () => {
    const m = await startOnub(colyseus, 6, RIG6);
    const l = leader(m);
    l.room.send('debug.clock', { window: 'poisoner' });
    l.room.send('debug.clock', { phase: 'grace' });
    l.room.send('debug.clock', { phase: 'day' });
    await sleep(300);
    expect(codes(l)).toEqual([425, 422, 422]);
    l.room.send('debug.clock', { phase: 'night' });
    expect(await until(() => m.room.state.phase === Phase.night)).toBe(true);
    l.room.send('debug.clock', { window: 'pallbearer' });
    await sleep(250);
    expect(codes(l).at(-1)).toBe(422);
  }, 30_000);
});
