import { describe, expect, it } from 'vitest';
import { NavGrid } from '@wdi/shared';
import type { Scene } from '@wdi/content';
import { loadScenes, navFor } from '../export';

// The M2 greybox: the overworld and the tavern's two rooms must be walkable end to end, so a player can
// reach every door at the Small profile (4-6 players) from the first square spawn. M3 adds the widow's
// cottage (both rooms), the forest and the cave entry.
const scenes = loadScenes();
const byId = (id: string) => scenes.find((s) => s.id === id) as Scene;

/** Tiles reachable on foot (4-connected floor) from a tile. */
function reach(scene: Scene, sx: number, sy: number): Set<string> {
  const grid = new NavGrid(navFor(scene), 'small');
  const seen = new Set<string>();
  const stack: Array<[number, number]> = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop() as [number, number];
    if (seen.has(`${x},${y}`) || grid.solidAt(x, y)) continue;
    seen.add(`${x},${y}`);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

/** A door is usable from a floor tile orthogonally next to it. */
const touches = (seen: Set<string>, x: number, y: number) =>
  [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`].some((k) => seen.has(k));

describe('greybox reachability at the Small profile', () => {
  it('reaches the tavern, bakery, apothecary and widow doors and the forest gate from the square', () => {
    const ow = byId('overworld');
    const start = ow.spawns.find((s) => s.id === 'square_0') as { x: number; y: number };
    const seen = reach(ow, start.x, start.y);
    for (const id of [
      'ov.tavern_front',
      'ov.tavern_alley',
      'ov.apoth',
      'ov.bakery',
      'ov.widow',
      'ov.forest_gate',
    ]) {
      const p = ow.portals.find((q) => q.id === id) as { x: number; y: number };
      expect(touches(seen, p.x, p.y), id).toBe(true);
    }
    for (const sp of ow.spawns.filter((s) => s.id.startsWith('square_'))) {
      expect(seen.has(`${sp.x},${sp.y}`), sp.id).toBe(true);
    }
  });

  it('reaches every door of the bar and the back room from their entry spawns', () => {
    const bar = byId('tavern_bar');
    const front = bar.spawns.find((s) => s.id === 'front') as { x: number; y: number };
    const inBar = reach(bar, front.x, front.y);
    for (const p of bar.portals) expect(touches(inBar, p.x, p.y), p.id).toBe(true);
    const back = byId('tavern_back');
    const door = back.spawns.find((s) => s.id === 'door') as { x: number; y: number };
    const inBack = reach(back, door.x, door.y);
    for (const p of back.portals) expect(touches(inBack, p.x, p.y), p.id).toBe(true);
  });
});

/** Every door of a scene is usable from the floor reachable from one of its spawns. */
function expectDoorsReachable(sceneId: string, spawnId: string): void {
  const scene = byId(sceneId);
  const sp = scene.spawns.find((s) => s.id === spawnId) as { x: number; y: number };
  expect(sp, `${sceneId}.${spawnId}`).toBeDefined();
  const seen = reach(scene, sp.x, sp.y);
  for (const p of scene.portals) expect(touches(seen, p.x, p.y), p.id).toBe(true);
  for (const s of scene.spawns) expect(seen.has(`${s.x},${s.y}`), `${sceneId}.${s.id}`).toBe(true);
}

describe('greybox reachability of the M3 interiors and outdoor scenes', () => {
  it('reaches both doors of the widow parlour and the bedroom door', () => {
    expectDoorsReachable('widow_parlour', 'door');
    expectDoorsReachable('widow_bedroom', 'door');
  });

  it('reaches the forest gate, log and cave from the gate, and the cave mouth and sea in the cave entry', () => {
    expectDoorsReachable('forest', 'gate');
    expectDoorsReachable('cave_entry', 'mouth');
  });
});
