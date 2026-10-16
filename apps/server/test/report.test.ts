import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode, Phase } from '@wdi/shared';
import { createServer } from '../src/server';
import { handleKill } from '../src/sim/Kill';
import {
  act,
  errorCodes,
  playerOf,
  prop,
  readyKnife,
  record,
  setPhase,
  simOfBot,
  sleep,
  teleport,
  toDay,
} from './killHelpers';
import { type Match, startMatch } from './simHelpers';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

const BELL = prop('ov.bell');

async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 5, {
    Bot0: 'killer',
    Bot1: 'townsfolk',
    Bot2: 'townsfolk',
    Bot3: 'detective',
  });
  toDay(m);
  return m;
}

/** Bot 1 dies at (31,22); bots 2 and 3 stand near the body, bot 4 far away. */
function murder(m: Match): void {
  const [k, v] = [m.bots[0]!, m.bots[1]!];
  readyKnife(m, k);
  teleport(m, k, 'overworld', 30, 22);
  teleport(m, v, 'overworld', 31, 22);
  teleport(m, m.bots[2]!, 'overworld', 32, 22);
  teleport(m, m.bots[3]!, 'overworld', 33, 22);
  teleport(m, m.bots[4]!, 'overworld', 38, 17);
  handleKill(m.room, k.id, { abilityId: 'kill', targetId: v.id });
}

describe('report', () => {
  it('pushes a body request once; a second report of the same body is refused (422)', async () => {
    const m = await party();
    murder(m);
    const rec = record(m);
    const [a, b] = [m.bots[2]!, m.bots[3]!];
    const body = `body_${m.bots[1]!.id}`;
    await act(a, 'act.reportBody', { bodyId: body });
    await act(b, 'act.reportBody', { bodyId: body });
    expect(rec.requests).toEqual([{ reason: 'body', callerId: a.id, bodyOf: m.bots[1]!.id }]);
    expect(errorCodes(a)).toEqual([]);
    expect(errorCodes(b)).toEqual([ErrorCode.cannot]);
  });

  it('refuses a far reporter (427), a bad id, a ghost, a wrong phase and a transit', async () => {
    const m = await party();
    murder(m);
    const rec = record(m);
    const body = `body_${m.bots[1]!.id}`;
    const [near, far, ghost] = [m.bots[2]!, m.bots[4]!, m.bots[1]!];
    await act(far, 'act.reportBody', { bodyId: body });
    await act(near, 'act.reportBody', { bodyId: 'body_nobody' });
    await act(near, 'act.reportBody', {});
    await act(ghost, 'act.reportBody', { bodyId: body });
    setPhase(m, Phase.immunity);
    await act(near, 'act.reportBody', { bodyId: body });
    setPhase(m, Phase.day);
    simOfBot(m, near).busyUntilTick = m.room.state.tick + 100;
    await act(near, 'act.reportBody', { bodyId: body });
    expect(errorCodes(far)).toEqual([ErrorCode.outOfRange]);
    expect(errorCodes(near)).toEqual([
      ErrorCode.cannot,
      ErrorCode.cannot,
      ErrorCode.wrongPhase,
      ErrorCode.busy,
    ]);
    expect(errorCodes(ghost)).toEqual([ErrorCode.cannot]);
    expect(rec.requests).toEqual([]);
  });

  it('does not see a body in another scene', async () => {
    const m = await party();
    murder(m);
    teleport(m, m.bots[2]!, 'tavern_bar', 4, 4);
    await act(m.bots[2]!, 'act.reportBody', { bodyId: `body_${m.bots[1]!.id}` });
    expect(errorCodes(m.bots[2]!)).toEqual([ErrorCode.cannot]);
  });
});

describe('bell', () => {
  it('pushes a bell request within reach in day, dusk and night, once per pull of the role', async () => {
    const m = await party();
    const rec = record(m);
    const [t, d] = [m.bots[1]!, m.bots[3]!];
    teleport(m, t, 'overworld', BELL.x, BELL.y + 1);
    teleport(m, d, 'overworld', BELL.x + 1, BELL.y + 1);
    await act(t, 'act.bell', {});
    setPhase(m, Phase.night);
    await act(t, 'act.bell', {});
    await act(d, 'act.bell', {});
    await act(d, 'act.bell', {});
    // Townsfolk pull twice, the Detective once (roles.json bellPulls).
    expect(rec.requests.map((r) => [r.reason, r.callerId])).toEqual([
      ['bell', t.id],
      ['bell', t.id],
      ['bell', d.id],
    ]);
    await act(t, 'act.bell', {});
    expect(errorCodes(t)).toEqual([ErrorCode.cannot]);
    expect(errorCodes(d)).toEqual([ErrorCode.cannot]);
    expect(simOfBot(m, t).bellPulls).toBe(2);
  });

  it('refuses grace, immunity, distance, other scenes and ghosts', async () => {
    const m = await party();
    const rec = record(m);
    const [a, b] = [m.bots[1]!, m.bots[2]!];
    teleport(m, a, 'overworld', BELL.x, BELL.y + 1);
    teleport(m, b, 'overworld', BELL.x + 6, BELL.y + 1);
    setPhase(m, Phase.grace);
    await act(a, 'act.bell', {});
    setPhase(m, Phase.immunity);
    await act(a, 'act.bell', {});
    setPhase(m, Phase.day);
    await act(b, 'act.bell', {});
    teleport(m, a, 'tavern_bar', 4, 4);
    await act(a, 'act.bell', {});
    teleport(m, a, 'overworld', BELL.x, BELL.y + 1);
    simOfBot(m, a).dead = true;
    await act(a, 'act.bell', {});
    expect(errorCodes(a)).toEqual([
      ErrorCode.wrongPhase,
      ErrorCode.wrongPhase,
      ErrorCode.outOfRange,
      ErrorCode.cannot,
    ]);
    expect(errorCodes(b)).toEqual([ErrorCode.outOfRange]);
    expect(rec.requests).toEqual([]);
    expect(playerOf(m, a).alive).toBe(true);
    await sleep(0);
  });
});
