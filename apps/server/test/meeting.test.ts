import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { ErrorCode, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { simOf } from '../src/sim/RoomSim';
import {
  bootFlowServer,
  events,
  idOf,
  murder,
  openMeeting,
  request,
  seat,
  sim,
  skipPhase,
  startParty,
  until,
  vote,
  voteAll,
} from './flowHelpers';
import { type Match, sleep, spawnOf } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const atSquare = (m: Match, i: number): boolean => {
  const p = sim(m, i);
  const s = spawnOf('overworld', `square_${p.ordinal % 10}`);
  return p.sceneIdx === 0 && p.x === (s.x + 0.5) * TILE_PX && p.y === (s.y + 0.5) * TILE_PX;
};

describe('opening a meeting (A30)', () => {
  it('moves everyone, living or dead, to the square, then sends meetingStart and no sceneEnter', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m); // day
    murder(m, 3);
    // Scatter the players so the move is visible, and record who is at the square when meetingStart goes out.
    for (const i of [0, 1, 2, 3, 4]) {
      sim(m, i).x += 3 * TILE_PX;
    }
    const placedWhenSent: boolean[] = [];
    const broadcast = m.room.broadcast.bind(m.room);
    m.room.broadcast = ((type: string, ...rest: unknown[]) => {
      if (type === 'meetingStart') placedWhenSent.push([0, 1, 2, 3, 4].every((i) => atSquare(m, i)));
      return (broadcast as (t: string, ...r: unknown[]) => void)(type, ...rest);
    }) as typeof m.room.broadcast;
    const sceneEnters = m.bots.map((b) => events(b, 'sceneEnter').length);

    request(m, 1, 3);
    expect(await until(() => m.room.state.phase === Phase.meetingDiscussion)).toBe(true);
    await sleep(200);

    expect(placedWhenSent).toEqual([true]);
    m.bots.forEach((b, i) => {
      expect(events(b, 'sceneEnter')).toHaveLength(sceneEnters[i]!);
      expect(events(b, 'meetingStart')).toEqual([
        { reason: 'body', callerId: idOf(m, 1), bodyOf: idOf(m, 3), missing: [] },
      ]);
    });
    const meeting = m.room.state.meeting;
    expect([meeting.phase, meeting.reason, meeting.callerId, meeting.bodyOf]).toEqual([
      Phase.meetingDiscussion,
      'body',
      idOf(m, 1),
      idOf(m, 3),
    ]);
    expect(meeting.endsTick).toBe(m.room.state.phaseEndsTick);
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeGreaterThan(
      balance.byCount['5'].discussionS * TICK_RATE - 10,
    );
  });

  it('makes the private death public and resets the votes', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    murder(m, 2);
    seat(m, 1).hasVoted = true;
    seat(m, 1).priv!.myVote = 'skip';
    await sleep(100);
    expect(seat(m, 2).alive).toBe(true); // A30: still private
    await openMeeting(m, 1, 2);
    expect(seat(m, 2).alive).toBe(false);
    for (const i of [0, 1, 2, 3]) {
      expect(seat(m, i).hasVoted).toBe(false);
      expect(seat(m, i).priv!.myVote).toBe('');
    }
  });

  it('ignores a request that arrives while a meeting is running', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await openMeeting(m, 1);
    request(m, 2);
    await sleep(150);
    expect(events(m.bots[0]!, 'meetingStart')).toHaveLength(1);
    expect(simOf(m.room).meetingRequests).toHaveLength(0);
  });
});

describe('voting', () => {
  it('refuses a vote outside a meeting with 425', async () => {
    const m = await startParty(colyseus, 4);
    vote(m, 1, 'skip');
    await sleep(150);
    expect(events(m.bots[1]!, 'error').at(-1)).toMatchObject({ code: ErrorCode.wrongPhase });
  });

  it('refuses a ghost, an unknown target and a dead target with 422, and a vote in the reveal with 425', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    murder(m, 4);
    await openMeeting(m, 1, 4);
    vote(m, 4, 'skip');
    vote(m, 1, 'nobody-here');
    vote(m, 2, idOf(m, 4));
    await sleep(200);
    for (const i of [4, 1, 2]) {
      expect(events(m.bots[i]!, 'error').at(-1)).toMatchObject({ code: ErrorCode.cannot });
    }
    expect(seat(m, 4).hasVoted).toBe(false);
    expect([1, 2].some((i) => seat(m, i).hasVoted)).toBe(false);

    await voteAll(m, [0, 1, 2, 3], () => 'skip');
    vote(m, 0, idOf(m, 1));
    await sleep(150);
    expect(events(m.bots[0]!, 'error').at(-1)).toMatchObject({ code: ErrorCode.wrongPhase });
  });

  it('a repeated vote replaces the first without a reply and hasVoted stays true', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await openMeeting(m, 1);
    vote(m, 2, idOf(m, 0));
    await sleep(150);
    vote(m, 2, idOf(m, 3));
    await sleep(150);
    expect(seat(m, 2).priv!.myVote).toBe(idOf(m, 3));
    expect(seat(m, 2).hasVoted).toBe(true);
    expect(events(m.bots[2]!, 'error')).toHaveLength(0);
    expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
  });

  it('ends at once when every living player has voted, even in the discussion', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    murder(m, 4);
    await openMeeting(m, 1, 4);
    vote(m, 0, 'skip');
    vote(m, 1, 'skip');
    vote(m, 2, 'skip');
    await sleep(200);
    expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
    vote(m, 3, 'skip'); // the ghost never needed to vote
    expect(await until(() => m.room.state.phase === Phase.reveal)).toBe(true);
  });

  it('moves from the discussion to the vote on the clock and closes the vote after voteS', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await openMeeting(m, 1);
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.meetingVote);
    expect(m.room.state.meeting.phase).toBe(Phase.meetingVote);
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeGreaterThan(
      balance.phases.voteS * TICK_RATE - 10,
    );
    vote(m, 0, 'skip');
    await sleep(150);
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.reveal);
  });
});

describe('the reveal and the way out', () => {
  it('a tie ejects nobody; every client then gets a second sceneEnter and the day restarts', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await openMeeting(m, 1);
    await voteAll(m, [0, 1, 2, 3, 4], (i) => idOf(m, i < 2 ? 3 : i < 4 ? 2 : 0));
    const result = events(m.bots[0]!, 'voteResult').at(-1)!;
    expect(result.ejectedId).toBeUndefined();
    expect(result.tally).toEqual({ [idOf(m, 3)]: 2, [idOf(m, 2)]: 2, [idOf(m, 0)]: 1 });
    expect(JSON.stringify(result)).not.toMatch(/voter/i);
    const before = m.bots.map((b) => events(b, 'sceneEnter').length);
    const round = m.room.state.round;
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.immunity);
    await sleep(200);
    m.bots.forEach((b, i) => {
      const entered = events(b, 'sceneEnter');
      expect(entered).toHaveLength(before[i]! + 1);
      expect(entered.at(-1)).toMatchObject({ sceneId: 'overworld' });
    });
    expect(m.room.state.meeting.phase).toBe(0);
    for (const i of [0, 1, 2, 3, 4]) expect(atSquare(m, i)).toBe(true);
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.day);
    expect(m.room.state.round).toBe(round + 1);
  });

  it('a Skip plurality ejects nobody', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await openMeeting(m, 1);
    await voteAll(m, [0, 1, 2, 3], (i) => (i < 3 ? 'skip' : idOf(m, 0)));
    expect(events(m.bots[0]!, 'voteResult').at(-1)).toEqual({ tally: { skip: 3, [idOf(m, 0)]: 1 } });
  });

  it('reveals the ejected role, kills them privately, and the next day starts without a win', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await openMeeting(m, 1);
    await voteAll(m, [0, 1, 2, 3, 4], (i) => idOf(m, i === 3 ? 2 : 3));
    const target = idOf(m, 3);
    for (const b of m.bots) {
      expect(events(b, 'voteResult').at(-1)).toMatchObject({ ejectedId: target, role: 'townsfolk' });
    }
    expect(events(m.bots[3]!, 'killed')).toEqual([
      expect.objectContaining({ sceneId: 'overworld', cause: 'ejected' }),
    ]);
    expect(events(m.bots[3]!, 'killed')[0]!.roles).toMatchObject({ [idOf(m, 0)]: 'killer' });
    for (const i of [0, 1, 2, 4]) expect(events(m.bots[i]!, 'killed')).toHaveLength(0);
    expect(seat(m, 3).alive).toBe(false);
    expect(sim(m, 3).dead).toBe(true);
    await sleep(100);
    expect(m.room.state.phase).toBe(Phase.reveal);
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.immunity); // 2 of 4 non-Cabal left: no winner yet
  });

  it('starts a second meeting with hasVoted false again', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await openMeeting(m, 1);
    await voteAll(m, [0, 1, 2, 3], () => 'skip');
    await skipPhase(m); // immunity
    expect(seat(m, 1).hasVoted).toBe(true);
    await openMeeting(m, 2);
    for (const i of [0, 1, 2, 3]) {
      expect(seat(m, i).hasVoted).toBe(false);
      expect(seat(m, i).priv!.myVote).toBe('');
    }
    await sleep(200);
    expect(events(m.bots[0]!, 'meetingStart')).toHaveLength(2);
  });
});

describe('quick-mode messages in the main mode (GDD 3.11)', () => {
  it('refuses meeting.claim 422 outside quick mode, in a meeting too', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    await openMeeting(m, 1);
    const bot = m.bots[0]!;
    bot.room.send('meeting.claim', { roleId: 'cutpurse' });
    await sleep(250);
    expect(events(bot, 'error').map((e) => e.code)).toEqual([422]);
    expect(m.room.state.meeting.claims.length).toBe(0);
  });
});
