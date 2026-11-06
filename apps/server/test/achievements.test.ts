import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ColyseusTestServer } from '@colyseus/testing';
import { ACHIEVEMENT_KINDS } from '@wdi/content';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitSim } from '../src/sim/events/bus';
import { bootFlowServer, events, idOf, until } from './flowHelpers';
import { sleep, startMatch, stateOf, type Match } from './simHelpers';

// Round 10, E1 (GDD 3.28): the steps evaluate in step(), and the `achv` message is private to the earner.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());

const achv = (m: Match, i: number) => events(m.bots[i]!, 'achv');
const emit = (m: Match, kind: string, rest: Record<string, unknown>) =>
  emitSim(m.room, { tick: m.room.state.tick, kind, ...rest });

describe('achievements', () => {
  it('a task finished tells its own seat alone, and a fake task counts for nothing', async () => {
    const m = await startMatch(colyseus, 4);
    const [a, b] = [idOf(m, 0), idOf(m, 1)];
    emit(m, 'taskDone', { seat: b, data: { taskId: 't', fake: true } });
    emit(m, 'taskDone', { seat: a, data: { taskId: 't', fake: false } });
    expect(await until(() => achv(m, 0).length > 0)).toBe(true);
    await sleep(150);
    expect(achv(m, 0)).toEqual([{ id: 'oddJobs', step: 1, steps: 1, done: true }]);
    for (const i of [1, 2, 3]) expect(achv(m, i)).toEqual([]);
  });

  it('steps count in order and a counted step needs all its events', async () => {
    const m = await startMatch(colyseus, 4);
    const a = idOf(m, 0);
    // fullDay is eat, rest, eat: a rest first counts for nothing toward it.
    emit(m, 'sleep.rest', { seat: a, data: { seat: a, kind: 'bed' } });
    emit(m, 'eat', { seat: a, data: { seat: a } });
    emit(m, 'sleep.rest', { seat: a, data: { seat: a, kind: 'bed' } });
    emit(m, 'eat', { seat: a, data: { seat: a } });
    expect(await until(() => achv(m, 0).some((p) => p['id'] === 'fullDay' && p['done']))).toBe(true);
    const day = achv(m, 0).filter((p) => p['id'] === 'fullDay');
    expect(day.map((p) => p['step'])).toEqual([1, 2, 3]);
    // steadyHands wants a run of real tasks: four are not enough.
    for (let n = 0; n < 4; n++) emit(m, 'taskDone', { seat: a, data: { taskId: 't', fake: false } });
    await sleep(200);
    expect(achv(m, 0).some((p) => p['id'] === 'steadyHands')).toBe(false);
    emit(m, 'taskDone', { seat: a, data: { taskId: 't', fake: false } });
    expect(await until(() => achv(m, 0).some((p) => p['id'] === 'steadyHands'))).toBe(true);
  });

  it('credits the seat a data key names (the killer), not the victim', async () => {
    const m = await startMatch(colyseus, 4);
    const [killer, victim] = [idOf(m, 0), idOf(m, 1)];
    emit(m, 'kill', { seat: victim, data: { by: killer } });
    expect(await until(() => achv(m, 0).some((p) => p['id'] === 'bloodOnHands'))).toBe(true);
    await sleep(150);
    expect(achv(m, 1)).toEqual([]);
  });

  it('a story event, naming no seat, reaches the humans at the table', async () => {
    const m = await startMatch(colyseus, 4);
    emit(m, 'story.goal', { data: { chapterId: 'ch1_baker', goal: 'gFlour' } });
    emit(m, 'story.chapterEnd', { data: { chapterId: 'ch1_baker', failed: false, summary: {} } });
    expect(await until(() => achv(m, 0).some((p) => p['id'] === 'bakerDone'))).toBe(true);
    expect(achv(m, 0).map((p) => p['id'])).toEqual(expect.arrayContaining(['firstGoal', 'bakerDone']));
    // A failed chapter is the hard lesson, not the chapter won.
    emit(m, 'story.chapterEnd', { data: { chapterId: 'ch2_watchman', failed: true, summary: {} } });
    expect(await until(() => achv(m, 0).some((p) => p['id'] === 'hardLesson'))).toBe(true);
    expect(achv(m, 0).some((p) => p['id'] === 'watchmanDone')).toBe(false);
  });

  it('is private: no broadcast, no public field, and the payload names only the achievement', async () => {
    const m = await startMatch(colyseus, 4);
    const sent: string[] = [];
    const room = m.room as unknown as { broadcast: (t: unknown, ...a: unknown[]) => void };
    const original = room.broadcast.bind(room);
    room.broadcast = (t, ...a) => {
      sent.push(String(t));
      original(t, ...a);
    };
    const [a, b] = [idOf(m, 0), idOf(m, 1)];
    emit(m, 'rob', { data: { by: a, target: b, amount: 1 } });
    emit(m, 'taskDone', { seat: a, data: { taskId: 't', fake: false } });
    expect(await until(() => achv(m, 0).length >= 2)).toBe(true);
    await sleep(150);
    expect(sent.filter((t) => t === 'achv')).toEqual([]);
    for (const p of achv(m, 0)) {
      expect(Object.keys(p).sort()).toEqual(['done', 'id', 'step', 'steps']);
      expect(JSON.stringify(p)).not.toContain(b); // the victim's seat is not in it
    }
    for (const i of [1, 2, 3]) expect(achv(m, i)).toEqual([]);
    const keys = JSON.stringify(stateOf(m.bots[1]!).toJSON?.() ?? {});
    expect(keys).not.toContain('achv');
    expect(keys).not.toContain('bloodOnHands');
  });
});

describe('achievement kinds', () => {
  it('every kind a step may name has an emit site in the server', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk(join(import.meta.dirname, '../src'));
    const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    // `story.*` kinds are emitted by the story runner's own helper; the rest have a literal `kind: '<kind>'` site.
    const missing = ACHIEVEMENT_KINDS.filter((k) => !source.includes(`kind: '${k}'`));
    expect(missing).toEqual([]);
  });
});
