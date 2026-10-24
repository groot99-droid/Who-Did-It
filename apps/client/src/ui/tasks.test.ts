import { describe, expect, it } from 'vitest';
import { choreLine, choreRows, taskPrompt, taskSpots, type TaskSpot } from './tasks';

// Round 7, 7M (GDD 3.5, UI.md 14.38): the pure helpers of the task prompt and the chores panel.

const PROPS: Record<string, { x: number; y: number }> = {
  'as.bench': { x: 100, y: 200 },
  'ov.pump': { x: 300, y: 400 },
  'ov.lantern_0': { x: 500, y: 600 },
};
const propAt = (id: string) => PROPS[id] ?? null;
const none = () => false;
const wrench = (item: string) => item === 'wrench';

describe('taskSpots', () => {
  it('offers a real task its source until the tool is carried, and every target in the scene', () => {
    const mine = [{ id: 'fixPump', done: false, fake: false }];
    expect(taskSpots(mine, 'apoth_shop', propAt, none)).toMatchObject([
      { kind: 'task', taskId: 'fixPump', step: 'source', x: 100, y: 200, tool: 'wrench', fake: false },
    ]);
    expect(taskSpots(mine, 'apoth_shop', propAt, wrench)).toEqual([]);
    expect(taskSpots(mine, 'overworld', propAt, wrench)).toMatchObject([
      { taskId: 'fixPump', step: 'target', x: 300, y: 400 },
    ]);
  });

  it('keeps a fake task its source for the show, drops done tasks and props the scene file lacks', () => {
    const fake = [{ id: 'fixPump', done: false, fake: true }];
    expect(taskSpots(fake, 'apoth_shop', propAt, wrench)).toMatchObject([{ step: 'source', fake: true }]);
    expect(taskSpots([{ id: 'fixPump', done: true, fake: false }], 'overworld', propAt, none)).toEqual([]);
    expect(
      taskSpots([{ id: 'lightLanterns', done: false, fake: false }], 'overworld', propAt, none),
    ).toMatchObject([{ taskId: 'lightLanterns', step: 'target', x: 500, y: 600, nightOnly: true }]);
    expect(taskSpots([{ id: 'nope', done: false, fake: false }], 'overworld', propAt, none)).toEqual([]);
  });
});

describe('taskPrompt', () => {
  const spot = (step: TaskSpot['step'], fake = false, nightOnly = false): TaskSpot => ({
    kind: 'task',
    taskId: 'fixPump',
    step,
    x: 0,
    y: 0,
    name: 'Fix the well pump',
    tool: 'wrench',
    fake,
    nightOnly,
  });
  it('asks to take the tool at the source, names the task at the target, and says what is missing', () => {
    expect(taskPrompt(spot('source'), none, false)).toBe('Press E: take the Wrench');
    expect(taskPrompt(spot('source', true), none, false)).toBe('Press E: Fix the well pump');
    expect(taskPrompt(spot('target'), none, false)).toBe('Needs the Wrench: Fix the well pump');
    expect(taskPrompt(spot('target'), wrench, false)).toBe('Press E: Fix the well pump');
    expect(taskPrompt(spot('target', true), none, false)).toBe('Press E: Fix the well pump');
    expect(taskPrompt(spot('target', false, true), wrench, false)).toBe('Only at night: Fix the well pump');
    expect(taskPrompt(spot('target', false, true), wrench, true)).toBe('Press E: Fix the well pump');
  });
});

describe('choreRows and choreLine', () => {
  const name = (id: string) => ({ apoth_shop: 'Mallory Apothecary', overworld: 'Hollowmere' })[id] ?? id;
  it('steps a real task from fetch to bring to done, and a fake one straight to its station', () => {
    const [fetch] = choreRows([{ id: 'fixPump', done: false, fake: false }], none);
    expect(fetch).toMatchObject({ step: 'fetch', from: 'apoth_shop', to: ['overworld'], tool: 'wrench' });
    expect(choreLine(fetch!, name)).toBe('Fetch the Wrench from Mallory Apothecary');
    const [bring] = choreRows([{ id: 'fixPump', done: false, fake: false }], wrench);
    expect(bring?.step).toBe('bring');
    expect(choreLine(bring!, name)).toBe('Bring it to Hollowmere');
    const [done] = choreRows([{ id: 'fixPump', done: true, fake: false }], none);
    expect(done?.step).toBe('done');
    expect(choreLine(done!, name)).toBe('Done');
    const [show] = choreRows([{ id: 'fixPump', done: false, fake: true }], none);
    expect(show).toMatchObject({ step: 'bring', fake: true });
    expect(choreLine(show!, name)).toBe('Go to Hollowmere');
  });
  it('skips ids the content does not know', () => {
    expect(choreRows([{ id: 'nope', done: false, fake: false }], none)).toEqual([]);
  });
});
