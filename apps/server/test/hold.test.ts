import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClueKind, ErrorCode, NotebookStatus, Phase } from '@wdi/shared';
import { createServer } from '../src/server';
import { simOf } from '../src/sim/RoomSim';
import {
  act,
  errorCodes,
  eventsOf,
  playerOf,
  prop,
  setPhase,
  simOfBot,
  sleep,
  teleport,
  toDay,
} from './killHelpers';
import { type Match, move, startMatch } from './simHelpers';

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

const TEACH = prop('ov.teaching_clue');
const collect = (on: boolean, targetId = 'clue_teaching') => ({ action: 'collect', targetId, on });

async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 4, {
    Bot0: 'killer',
    Bot1: 'detective',
    Bot2: 'townsfolk',
    Bot3: 'townsfolk',
  });
  toDay(m); // the sim extends the match clock; the teaching clue spawned at the placement
  for (const [i, dx] of [
    [0, 0],
    [1, 1],
    [2, -1],
    [3, 2],
  ] as const)
    teleport(m, m.bots[i]!, 'overworld', TEACH.x + dx, TEACH.y + 1);
  await sleep(300);
  return m;
}
const notebook = (m: Match, i: number) => playerOf(m, m.bots[i]!).priv.notebook;

describe('collect', () => {
  it('finishes after the cast: one entry, clueFound with its id, the clue claimed', async () => {
    const m = await party();
    const b = m.bots[2]!;
    await act(b, 'act.hold', collect(true), 100);
    expect(simOfBot(m, b).hold).toMatchObject({ action: 'collect', targetId: 'clue_teaching' });
    await sleep(1400);
    expect(notebook(m, 2)).toHaveLength(0);
    expect(eventsOf(b, 'clueFound')).toEqual([]);
    await sleep(900);
    expect(notebook(m, 2)).toHaveLength(1);
    const entry = notebook(m, 2)[0]!;
    expect(entry).toMatchObject({
      id: 'entry_1',
      clueKind: ClueKind.footprints,
      value: 2,
      sceneId: 0,
      status: NotebookStatus.teaching,
    });
    expect(entry.tick).toBeGreaterThan(0);
    expect(eventsOf(b, 'clueFound')).toEqual([{ entryId: 'entry_1' }]);
    expect(simOfBot(m, b).hold).toBeNull();
    expect(m.room.state.scenes.get('overworld')!.clues.get('clue_teaching')!.claimed).toBe(true);
    // A second collect of the same clue by the same player is refused.
    await act(b, 'act.hold', collect(true));
    expect(errorCodes(b)).toEqual([ErrorCode.cannot]);
  });

  it('lets several players collect one clue; a Detective reads it as any card does (round 10, V1a)', async () => {
    const m = await party();
    for (const i of [0, 1, 2]) m.bots[i]!.room.send('act.hold', collect(true));
    await sleep(2600);
    expect(notebook(m, 1)[0]?.status).toBe(NotebookStatus.teaching);
    expect(notebook(m, 2)[0]?.status).toBe(NotebookStatus.teaching);
    expect(notebook(m, 0)[0]?.status).toBe(NotebookStatus.teaching);
    expect(simOf(m.room).clueMeta.get('clue_teaching')!.collectors.size).toBe(3);
  });

  it('a regular clue is Claimed, entries count per player and ids stay unique', async () => {
    const m = await party();
    const scene = m.room.state.scenes.get('overworld')!;
    const { spawnClue } = await import('../src/sim/Clues');
    const id = spawnClue(m.room, 'overworld', {
      kind: ClueKind.thread,
      value: 1,
      dir: 0,
      tx: TEACH.x - 1,
      ty: TEACH.y + 1,
    })!;
    const b = m.bots[2]!;
    await act(b, 'act.hold', collect(true, id), 2400);
    await act(b, 'act.hold', collect(true), 2400);
    expect(notebook(m, 2).map((e) => [e.id, e.status])).toEqual([
      ['entry_1', NotebookStatus.claimed],
      ['entry_2', NotebookStatus.teaching],
    ]);
    expect(scene.clues.get(id)!.claimed).toBe(true);
  }, 15000);

  it('is cancelled by releasing, by moving, and by leaving a world phase', async () => {
    const m = await party();
    const [rel, mov, ph] = [m.bots[0]!, m.bots[1]!, m.bots[3]!];
    for (const b of [rel, mov, ph]) b.room.send('act.hold', collect(true));
    await sleep(800);
    rel.room.send('act.hold', collect(false));
    move(mov, 1, 0);
    await sleep(200);
    expect(simOfBot(m, rel).hold).toBeNull();
    expect(simOfBot(m, mov).hold).toBeNull();
    setPhase(m, Phase.meetingDiscussion);
    await sleep(300);
    expect(simOfBot(m, ph).hold).toBeNull();
    await sleep(2200);
    for (const i of [0, 1, 3]) expect(notebook(m, i)).toHaveLength(0);
  });

  it('refuses out of reach (427), a missing clue, other phases (425) and ghosts (422)', async () => {
    const m = await party();
    const b = m.bots[2]!;
    teleport(m, b, 'overworld', TEACH.x + 6, TEACH.y);
    await act(b, 'act.hold', collect(true));
    await act(b, 'act.hold', collect(true, 'clue_nope'));
    await act(b, 'act.hold', { action: 'drag', targetId: 'clue_teaching', on: true });
    await act(b, 'act.hold', { action: 'collect', targetId: 'clue_teaching' });
    teleport(m, b, 'overworld', TEACH.x, TEACH.y + 1);
    setPhase(m, Phase.immunity);
    await act(b, 'act.hold', collect(true));
    setPhase(m, Phase.day);
    simOfBot(m, b).dead = true;
    await act(b, 'act.hold', collect(true));
    expect(errorCodes(b)).toEqual([
      ErrorCode.outOfRange,
      ErrorCode.cannot,
      ErrorCode.cannot,
      ErrorCode.wrongPhase,
      ErrorCode.cannot,
    ]);
    expect(notebook(m, 2)).toHaveLength(0);
  });

  it('is cancelled when the clue decays under the holder', async () => {
    const m = await party();
    const b = m.bots[2]!;
    await act(b, 'act.hold', collect(true), 100);
    simOf(m.room).clueMeta.get('clue_teaching')!.expiresTick = m.room.state.tick + 1;
    await sleep(2600);
    expect(notebook(m, 2)).toHaveLength(0);
    expect(m.room.state.scenes.get('overworld')!.clues.has('clue_teaching')).toBe(false);
  });
});
