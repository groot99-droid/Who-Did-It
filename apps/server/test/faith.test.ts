import { ColyseusTestServer, boot } from '@colyseus/testing';
import { economy, scenes } from '@wdi/content';
import { ErrorCode, Phase, S2C } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { civicMeetingStart } from '../src/sim/economy/civic';
import { FAITH_COPY } from '../src/sim/economy/faith';
import { TOWN, movePurse } from '../src/sim/economy/purse';
import { type Notice, ledgerOf } from '../src/sim/economy/rumours';
import { count } from '../src/sim/Inventory';
import { act, errorCodes, eventsOf, playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

/** Round 8 (GDD 3.23), Session 8D: Faith at the altar, the Indulgence and the Parish Seal. */

/**
 * The wayside altar's scene row lands with its art (8J, A139), so these tests stand it on the overworld in a fixture
 * of their own, on the tile its row will take.
 */
const altar = { id: economy.faith.altars[0]!, kind: 'altar', x: 12, y: 35 };

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  if (!scenes.overworld.props.some((p) => p.id === altar.id)) scenes.overworld.props.push(altar);
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  const i = scenes.overworld.props.indexOf(altar);
  if (i >= 0) scenes.overworld.props.splice(i, 1);
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

const { indulgence, seal } = economy.faith;

/** A match in the day, every seat dressed and paid, seat 0 at the altar. */
async function atAltar(n: number, scrip = 30): Promise<Match> {
  const m = await startMatch(colyseus, n);
  const looks = ['baker', 'doctor', 'vicar', 'detective'];
  m.bots.forEach((b, i) => {
    playerOf(m, b).look = looks[i]!;
    movePurse(m.room, b.id, TOWN, playerOf(m, b).priv.purse, 'buy');
    movePurse(m.room, TOWN, b.id, scrip, 'stake');
  });
  setPhase(m, Phase.day);
  teleport(m, m.bots[0]!, 'overworld', altar.x + 1, altar.y);
  await sleep(100);
  return m;
}

const notice = (m: Match, id: string, look: string, holder: string): Notice => {
  const n = { id, look, holder, sceneIdx: 0, phase: Phase.night, round: 1, tick: 1, madeRound: 1 };
  ledgerOf(m.room).notices.set(id, n);
  return n;
};

describe('Faith at the altar (GDD 3.23)', () => {
  it('a donation at an altar turns Scrip into Faith; away from one it is refused', async () => {
    const m = await atAltar(2);
    const [a, b] = m.bots as [Match['bots'][0], Match['bots'][0]];
    await act(a, 'act.donate', { amount: 5 });
    expect(playerOf(m, a).priv.faith).toBe(5 * economy.faith.perScrip);
    expect(playerOf(m, a).priv.purse).toBe(25);
    await act(a, 'act.donate', { amount: economy.faith.donateMax + 50 });
    expect(playerOf(m, a).priv.purse).toBe(25 - Math.min(25, economy.faith.donateMax));

    await act(b, 'act.donate', { amount: 5 });
    expect(errorCodes(b)).toContain(ErrorCode.outOfRange);
    expect(playerOf(m, b).priv.faith).toBe(0);
  });

  it('Faith and Scrip buy an Indulgence and one Seal, into the private inventory', async () => {
    const m = await atAltar(2);
    const a = m.bots[0]!;
    const priv = playerOf(m, a).priv;
    priv.faith = indulgence.faith + seal.faith;
    await act(a, 'act.faith', { kind: 'indulgence' });
    await act(a, 'act.faith', { kind: 'seal' });
    expect(count(playerOf(m, a), 'indulgence')).toBe(1);
    expect(count(playerOf(m, a), 'parishSeal')).toBe(1);
    expect(priv.faith).toBe(0);
    expect(priv.purse).toBe(30 - indulgence.scrip - seal.scrip);
    priv.faith = seal.faith;
    await act(a, 'act.faith', { kind: 'seal' });
    expect(count(playerOf(m, a), 'parishSeal')).toBe(economy.faith.holdMax);
    expect(errorCodes(a)).toContain(ErrorCode.cannot);
  });
});

describe('the Indulgence (GDD 3.23, A139)', () => {
  it('lets a seat burn its own name, and presented at a meeting voids the oldest notice on its look', async () => {
    const m = await atAltar(3);
    const [a, b] = m.bots as [Match['bots'][0], Match['bots'][0]];
    playerOf(m, a).priv.faith = 2 * indulgence.faith;
    await act(a, 'act.faith', { kind: 'indulgence' });
    await act(a, 'act.faith', { kind: 'indulgence' });
    expect(count(playerOf(m, a), 'indulgence')).toBe(2);

    notice(m, 'notice_own', 'baker', a.id);
    await act(a, 'act.notice', { itemId: 'notice_own', op: 'burn' });
    expect(ledgerOf(m.room).notices.has('notice_own')).toBe(false);
    expect(count(playerOf(m, a), 'indulgence')).toBe(1);

    notice(m, 'notice_old', 'baker', b.id);
    notice(m, 'notice_new', 'baker', b.id);
    notice(m, 'notice_other', 'doctor', b.id);
    setPhase(m, Phase.meetingDiscussion);
    const before = eventsOf(a, S2C.chatMsg).length;
    await act(a, 'act.faith', { kind: 'indulgence' });
    expect([...ledgerOf(m.room).notices.keys()]).toEqual(['notice_new', 'notice_other']);
    expect(count(playerOf(m, a), 'indulgence')).toBe(0);
    // Nothing reports it: the buyer learns nothing either way.
    expect(eventsOf(a, S2C.chatMsg).length).toBe(before);
  });
});

describe('the Parish Seal (GDD 3.23, A139)', () => {
  it('posts a line under the public name, clears the votes, and shields the seat for the meeting', async () => {
    const m = await atAltar(3);
    const [a, b, c] = m.bots as [Match['bots'][0], Match['bots'][0], Match['bots'][0]];
    playerOf(m, a).priv.faith = seal.faith;
    await act(a, 'act.faith', { kind: 'seal' });
    setPhase(m, Phase.meetingVote);
    await act(b, 'meeting.vote', { targetId: a.id });
    await act(c, 'meeting.vote', { targetId: b.id });
    expect(playerOf(m, b).priv.myVote).toBe(a.id);

    await act(a, 'act.faith', { kind: 'seal' });
    const name = playerOf(m, a).name;
    for (const bot of m.bots)
      expect(eventsOf(bot, S2C.chatMsg)).toContainEqual(
        expect.objectContaining({ channel: 'system', text: FAITH_COPY.seal(name) }),
      );
    expect(m.bots.map((x) => playerOf(m, x).priv.myVote)).toEqual(['', '', '']);
    expect(m.bots.every((x) => !playerOf(m, x).hasVoted)).toBe(true);

    await act(b, 'meeting.vote', { targetId: a.id });
    expect(errorCodes(b)).toContain(ErrorCode.cannot);
    expect(playerOf(m, b).priv.myVote).toBe('');
    await act(b, 'meeting.vote', { targetId: c.id });
    expect(playerOf(m, b).priv.myVote).toBe(c.id);

    // The next meeting's start lifts the shield.
    civicMeetingStart(m.room);
    await act(c, 'meeting.vote', { targetId: a.id });
    expect(playerOf(m, c).priv.myVote).toBe(a.id);
  });
});
