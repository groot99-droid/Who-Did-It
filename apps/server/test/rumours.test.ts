import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance, economy, scenes } from '@wdi/content';
import { ErrorCode, NoteKind, Phase, S2C, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { emitSim, runEvents } from '../src/sim/events/bus';
import { runCivic } from '../src/sim/economy/civic';
import { gazette, ledgerOf, noticeLine } from '../src/sim/economy/rumours';
import { act, errorCodes, eventsOf, playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

/** Round 8 (GDD 3.23), Session 8D: the rumour ledger, the mailbag and Blackmail Notices. */

/**
 * The mailbag's scene row lands with its art (8J, A139), so these tests stand it on the platform in a fixture of
 * their own, on the tile its row will take.
 */
const bag = { id: economy.notices.mailbags[0]!, kind: 'mailbag', x: 61, y: 29 };

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  if (!scenes.overworld.props.some((p) => p.id === bag.id)) scenes.overworld.props.push(bag);
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  const i = scenes.overworld.props.indexOf(bag);
  if (i >= 0) scenes.overworld.props.splice(i, 1);
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

const SAMPLE = economy.notices.sampleS * TICK_RATE;

/** Gives every seat a public look, in seat order. */
function dress(m: Match, ...looks: string[]): void {
  m.bots.forEach((b, i) => (playerOf(m, b).look = looks[i] ?? ''));
}

/** One sample of the ledger now (white-box: the civic stage outside the Step). */
function sample(m: Match): void {
  ledgerOf(m.room).nextSampleTick = 0;
  runCivic(m.room);
}

/** The Train's delivery, delivered on the bus as `runTrain` emits it (white-box). */
function deliver(m: Match): void {
  runCivic(m.room);
  emitSim(m.room, { tick: m.room.state.tick, kind: 'train.delivery' });
  runEvents(m.room);
}

async function collect(m: Match, i: number): Promise<void> {
  const bot = m.bots[i]!;
  teleport(m, bot, 'overworld', bag.x - 1, bag.y);
  await act(bot, 'act.hold', { action: 'mailbag', targetId: bag.id, on: true }, 50);
  await sleep(balance.clues.collectHoldS * 1000 + 300);
}

const notices = (m: Match, i: number) =>
  [...playerOf(m, m.bots[i]!).priv.notebook].filter((e) => e.note === NoteKind.notice);

describe('the rumour ledger (GDD 3.23)', () => {
  it('writes a look down only where another figure could see it, and never a seat', async () => {
    const m = await startMatch(colyseus, 3);
    dress(m, 'baker', 'doctor', 'vicar');
    setPhase(m, Phase.night);
    teleport(m, m.bots[0]!, 'bakery', 4, 6);
    teleport(m, m.bots[1]!, 'bakery', 6, 6);
    teleport(m, m.bots[2]!, 'chapel', 4, 4);
    await sleep(150);
    sample(m);
    const seen = ledgerOf(m.room).sightings;
    expect(seen.map((s) => s.look).sort()).toEqual(['baker', 'doctor']);
    for (const s of seen) expect(Object.values(s)).not.toContain(m.bots[0]!.id);
    expect(SAMPLE).toBeGreaterThan(0);
  });

  it('fills the bag at the delivery, night first, one slip per look', async () => {
    const m = await startMatch(colyseus, 2);
    dress(m, 'baker', 'doctor');
    const ledger = ledgerOf(m.room);
    ledger.sightings = [
      { look: 'baker', sceneIdx: 8, phase: Phase.day, round: 1, tick: 10 },
      { look: 'baker', sceneIdx: 8, phase: Phase.night, round: 1, tick: 5 },
      { look: 'doctor', sceneIdx: 3, phase: Phase.dusk, round: 1, tick: 9 },
    ];
    deliver(m);
    expect(ledger.bag?.map((s) => [s.look, s.phase])).toEqual([
      ['baker', Phase.night],
      ['doctor', Phase.dusk],
    ]);
    expect(ledger.sightings).toEqual([]);
  });
});

describe('the mailbag and Blackmail Notices (GDD 3.23)', () => {
  it('a collect turns the slips into private notices naming a look; the bag empties', async () => {
    const m = await startMatch(colyseus, 2);
    dress(m, 'baker', 'doctor');
    setPhase(m, Phase.day);
    ledgerOf(m.room).bag = [{ look: 'doctor', sceneIdx: 8, phase: Phase.night, round: 1, tick: 7 }];
    await collect(m, 0);
    const [n] = notices(m, 0);
    expect(n).toMatchObject({ of: 'doctor', sceneId: 8, value: Phase.night });
    expect(notices(m, 1)).toEqual([]);
    expect(ledgerOf(m.room).bag).toBeNull();
    // A second collect finds the bag empty.
    await act(m.bots[0]!, 'act.hold', { action: 'mailbag', targetId: bag.id, on: true });
    expect(errorCodes(m.bots[0]!)).toContain(ErrorCode.cannot);
  });

  it('shows a notice only at a meeting, as a public line; burns another look but not its own', async () => {
    const m = await startMatch(colyseus, 2);
    dress(m, 'baker', 'doctor');
    setPhase(m, Phase.day);
    ledgerOf(m.room).bag = [
      { look: 'doctor', sceneIdx: 8, phase: Phase.night, round: 1, tick: 7 },
      { look: 'baker', sceneIdx: 3, phase: Phase.dusk, round: 1, tick: 8 },
    ];
    await collect(m, 0);
    const [onDoctor, onSelf] = notices(m, 0);
    await act(m.bots[0]!, 'act.notice', { itemId: onDoctor!.id, op: 'show' });
    expect(errorCodes(m.bots[0]!)).toContain(ErrorCode.wrongPhase);
    await act(m.bots[0]!, 'act.notice', { itemId: onSelf!.id, op: 'burn' });
    expect(notices(m, 0)).toHaveLength(2);

    setPhase(m, Phase.meetingDiscussion);
    const line = noticeLine(ledgerOf(m.room).notices.get(onDoctor!.id)!);
    await act(m.bots[0]!, 'act.notice', { itemId: onDoctor!.id, op: 'show' });
    expect(notices(m, 0).map((e) => e.id)).toEqual([onSelf!.id]);
    for (const bot of m.bots)
      expect(eventsOf(bot, S2C.chatMsg)).toContainEqual(
        expect.objectContaining({ channel: 'system', text: expect.stringContaining(line) }),
      );
    // Another seat cannot touch a notice it does not hold.
    await act(m.bots[1]!, 'act.notice', { itemId: onSelf!.id, op: 'burn' });
    expect(notices(m, 0)).toHaveLength(1);
  });

  it('the Gazette prints a notice left a whole day cycle, and only then', async () => {
    const m = await startMatch(colyseus, 2);
    dress(m, 'baker', 'doctor');
    setPhase(m, Phase.day);
    m.room.state.round = 1;
    ledgerOf(m.room).bag = [{ look: 'doctor', sceneIdx: 8, phase: Phase.night, round: 1, tick: 7 }];
    await collect(m, 0);
    gazette(m.room);
    expect(notices(m, 0)).toHaveLength(1);
    m.room.state.round = 1 + economy.notices.gazetteAfterRounds;
    gazette(m.room);
    await sleep(100);
    expect(notices(m, 0)).toEqual([]);
    expect(eventsOf(m.bots[1]!, S2C.chatMsg)).toContainEqual(
      expect.objectContaining({ text: expect.stringMatching(/^The Gazette prints: /) }),
    );
  });
});
