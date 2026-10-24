import { describe, expect, it } from 'vitest';
import { takesUse } from './M5bLayer';
import { choreLine, choreRows, coopPrompt, taskPrompt, taskSpots, type TaskSpot } from './tasks';

// Round 7, 7M (GDD 3.5, UI.md 14.38): the pure helpers of the task prompt and the chores panel.

const PROPS: Record<string, { x: number; y: number }> = {
  'as.bench': { x: 100, y: 200 },
  'ov.pump': { x: 300, y: 400 },
  'ov.lantern_0': { x: 500, y: 600 },
  'tb.shutters': { x: 700, y: 800 },
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

describe('the co-op spot (GDD 3.5 "Shutter the windows")', () => {
  it('offers the shutters to every seat in the tavern, with the task on its list or not, within its own radius', () => {
    const [spot] = taskSpots([], 'tavern_bar', propAt, none);
    expect(spot).toMatchObject({
      taskId: 'shutterWindows',
      step: 'coop',
      x: 700,
      y: 800,
      fake: false,
      players: 2,
      reach: 2 * 64,
    });
    expect(
      taskSpots([{ id: 'shutterWindows', done: false, fake: true }], 'tavern_bar', propAt, none),
    ).toMatchObject([{ step: 'coop', fake: true }]);
    expect(taskSpots([], 'overworld', propAt, none)).toEqual([]);
    expect(taskPrompt(spot!, none, false)).toBe('Hold E: Shutter the windows (takes 2)');
  });
  it('says how many hands are on it while holding, and takes the release to let go', () => {
    expect(coopPrompt(1, 2)).toBe('Waiting for hands: 1 of 2');
    expect(coopPrompt(2, 2)).toBe('Keep holding: 2 of 2');
    expect(takesUse(false, null, 'task')).toBe(true);
    expect(takesUse(false, null, 'craft')).toBe(false);
  });
  it('lists it in the chores with the hands it takes', () => {
    const [row] = choreRows([{ id: 'shutterWindows', done: false, fake: false }], none);
    expect(row).toMatchObject({ step: 'coop', players: 2, to: ['tavern_bar'] });
    expect(choreLine(row!, (id) => (id === 'tavern_bar' ? 'The Tavern' : id))).toBe(
      'Takes 2 hands, at The Tavern',
    );
    expect(choreRows([{ id: 'shutterWindows', done: true, fake: false }], none)[0]?.step).toBe('done');
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
