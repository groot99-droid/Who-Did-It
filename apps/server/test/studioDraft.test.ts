import { readFileSync } from 'node:fs';
import { scenes } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import { checkScene } from '../src/services/studioSave';
import {
  type StudioSim,
  createStudio,
  parseStudio,
  stepStudio,
  studioSnapshot,
} from '../src/sim/studio/Studio';

/** Parses and queues each message, then runs one room tick; the refusals of parsing and of the step, in order. */
function send(sim: StudioSim, ...msgs: [string, unknown][]): string[] {
  const out: string[] = [];
  for (const [type, payload] of msgs) {
    const cmd = parseStudio(type, payload);
    if (typeof cmd === 'string') out.push(cmd);
    else sim.commands.push(cmd);
  }
  return [...out, ...stepStudio(sim)];
}

/** Queues a draft as `POST /studio/draft` does: checked first, then a command for the step. */
function draft(sim: StudioSim, raw: unknown): string[] {
  sim.commands.push({ kind: 'draft', scene: checkScene(raw) });
  return stepStudio(sim);
}

let seq = 0;
function hold(sim: StudioSim, dx: number, dy: number, ticks: number): void {
  for (let i = 0; i < ticks; i++) send(sim, ['studio.move', { seq: ++seq, dx, dy }]);
}

/** The committed bakery with a wall at (x, 8); row 8 is open from x 1 to 16. */
function walledBakery(x: number): unknown {
  const s = JSON.parse(
    readFileSync(new URL('../../../packages/content/data/scenes/bakery.json', import.meta.url), 'utf8'),
  );
  const put = (row: string, ch: string) => row.slice(0, x) + ch + row.slice(x + 1);
  s.grid[8] = put(s.grid[8], '#');
  s.material[8] = put(s.material[8], 'W');
  return s;
}

const atRow8 = (): StudioSim => {
  const sim = createStudio();
  expect(send(sim, ['studio.teleport', { sceneId: 'bakery', x: 3, y: 8 }])).toEqual([]);
  return sim;
};

describe('a Studio draft (S5, Walk it)', () => {
  it('walks a checked draft in place of the committed scene, in this room only, and writes nothing', () => {
    const before = JSON.stringify(scenes.bakery);
    const sim = atRow8();
    expect(draft(sim, walledBakery(6))).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ sceneId: 'bakery', tx: 3, ty: 8, draft: true });
    expect(sim.log.some((l) => l.endsWith('draft bakery (unsaved)'))).toBe(true);
    hold(sim, 1, 0, 60);
    expect(studioSnapshot(sim).tx).toBe(5);

    const other = atRow8();
    hold(other, 1, 0, 60);
    expect(studioSnapshot(other)).toMatchObject({ draft: false });
    expect(studioSnapshot(other).tx).toBeGreaterThan(6);
    expect(JSON.stringify(scenes.bakery)).toBe(before);
  });

  it('accepts an unchanged scene, and moves the figure to its first spawn when the draft walls its tile', () => {
    const sim = atRow8();
    expect(draft(sim, JSON.parse(JSON.stringify(scenes.bakery)))).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ tx: 3, ty: 8, draft: true });
    expect(draft(sim, walledBakery(3))).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ tx: 8, ty: 9, draft: true });

    const away = createStudio();
    expect(away.sceneId).toBe('overworld');
    expect(draft(away, walledBakery(6))).toEqual([]);
    expect(studioSnapshot(away)).toMatchObject({ sceneId: 'bakery', tx: 8, ty: 9, draft: true });
  });

  it("drops the draft and its scene's stand-ins on null and on a teleport to another scene", () => {
    const sim = atRow8();
    draft(sim, walledBakery(6));
    expect(send(sim, ['studio.spawn', { kind: 'look', ref: 'baker' }])).toEqual([]);
    expect(studioSnapshot(sim).spawns).toHaveLength(1);
    expect(send(sim, ['studio.draft', { scene: null }])).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ draft: false, spawns: [] });
    expect(sim.log.some((l) => l.endsWith('draft bakery dropped'))).toBe(true);
    hold(sim, 1, 0, 60);
    expect(studioSnapshot(sim).tx).toBeGreaterThan(6);

    draft(sim, walledBakery(6));
    expect(
      send(sim, ['studio.teleport', { sceneId: 'overworld', spawnId: scenes.overworld.spawns[0]!.id }]),
    ).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ sceneId: 'overworld', draft: false });
    expect(send(sim, ['studio.teleport', { sceneId: 'bakery', x: 3, y: 8 }])).toEqual([]);
    hold(sim, 1, 0, 60);
    expect(studioSnapshot(sim)).toMatchObject({ draft: false });
    expect(studioSnapshot(sim).tx).toBeGreaterThan(6);
  });

  it('takes only a null scene over the socket; a scene comes through the draft route', () => {
    expect(parseStudio('studio.draft', { scene: null })).toEqual({ kind: 'draft', scene: null });
    expect(parseStudio('studio.draft', { scene: scenes.bakery })).toBe(
      'send a draft scene by POST /studio/draft',
    );
    expect(parseStudio('studio.draft', {})).toBe('send a draft scene by POST /studio/draft');
    expect(parseStudio('studio.draft', null)).toBe('bad payload');
    const sim = createStudio();
    expect(send(sim, ['studio.draft', { scene: null }])).toEqual([]);
    expect(studioSnapshot(sim).draft).toBe(false);
  });
});
