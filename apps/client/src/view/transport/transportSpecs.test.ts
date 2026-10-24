import { describe, expect, it } from 'vitest';
import { balance, maps, scenes } from '@wdi/content';
import {
  type MapList,
  type SceneGraph,
  TRAIN_DWELL_MS,
  TRAIN_ROLL_MS,
  climbHeight,
  elevationOf,
  openness,
  swingSide,
  trainAt,
  trainTrack,
  transportOf,
} from './transportSpecs';

const graph = scenes as unknown as SceneGraph;
const mapList = maps as MapList;
const elev = (sceneId: string, id: string) => elevationOf(graph, sceneId, id);
const track = (sceneId: string) => trainTrack(graph, mapList, sceneId);

describe('transport motion (round 8, 8G: motion.md 2)', () => {
  it('gives doors a leaf, the cellar hatches a lid, the wells and winzes a ladder and the rest a veil', () => {
    expect(transportOf('door', 'ov.tavern_front', 's')).toBe('door');
    expect(transportOf('door', 'tb.front', null)).toBe('veil');
    expect(transportOf('hatch', 'tk.trap', null)).toBe('hatch');
    expect(transportOf('hatch', 'ov.well', null)).toBe('ladder');
    expect(transportOf('hatch', 'bm.winze', null)).toBe('ladder');
    for (const kind of ['stairs', 'drop', 'crawl', 'gate', 'forest_gate', 'cave_mouth'])
      expect(transportOf(kind, 'x.y', 's')).toBe('veil');
  });

  it('opens fast, holds and falls shut over the swing, and holds open under reduced motion', () => {
    const s = balance.doors.swingS;
    expect(openness(s, false)).toBe(0);
    expect(openness(s * 0.5, false)).toBe(1);
    expect(openness(s * 0.1, false)).toBeGreaterThan(0);
    expect(openness(s * 0.1, false)).toBeLessThan(1);
    expect(openness(0, false)).toBe(0);
    expect(openness(s * 0.95, true)).toBe(1);
    expect(openness(0, true)).toBe(0);
  });

  it('swings a door away from the one crossing, both ways', () => {
    const door = { x: 100, y: 100 };
    expect(swingSide('s', door, { x: 100, y: 140 })).toBe(-1);
    expect(swingSide('s', door, { x: 100, y: 60 })).toBe(1);
    expect(swingSide('e', door, { x: 60, y: 100 })).toBe(1);
    expect(swingSide('e', door, null)).toBe(-1);
  });

  it('climbs down the well on the way to the cellar and up it on the way back', () => {
    expect(elev('overworld', 'ov.well')).toBeLessThan(0);
    expect(elev('cellar', 'cl.well')).toBeGreaterThan(0);
    const down = (k: number) => climbHeight(true, elev('overworld', 'ov.well'), k);
    expect(down(0)).toBeGreaterThan(down(1));
    expect(down(1)).toBeLessThan(0);
    const up = (k: number) => climbHeight(false, elev('overworld', 'ov.well'), k);
    expect(up(1)).toBeGreaterThan(up(0));
    expect(climbHeight(true, elev('cellar', 'cl.well'), 1)).toBeGreaterThan(0);
  });

  it("finds HollowMere's rail spur beside the platform, and no Train elsewhere", () => {
    const t = track('overworld');
    expect(t).toMatchObject({ sceneId: 'overworld', x: 62, stopY: 30 });
    expect(t!.fromY).toBeGreaterThan(36);
    expect(track('bp_camp')).toBeNull();
    expect(track('tavern_bar')).toBeNull();
  });

  it('rolls the Train in on the arrival, stands, and backs out after the delivery', () => {
    const heard = { arriveAt: 1000, brakeAt: null };
    expect(trainAt(heard, 999, false)).toBeNull();
    expect(trainAt(heard, 1000, false)).toBe(1);
    expect(trainAt(heard, 1000 + TRAIN_ROLL_MS, false)).toBe(0);
    const brake = 1000 + balance.train.deliveryAfterS * 1000;
    const both = { arriveAt: 1000, brakeAt: brake };
    expect(trainAt(both, brake + TRAIN_DWELL_MS - 1, false)).toBe(0);
    expect(trainAt(both, brake + TRAIN_DWELL_MS + TRAIN_ROLL_MS / 2, false)).toBeCloseTo(0.5);
    expect(trainAt(both, brake + TRAIN_DWELL_MS + TRAIN_ROLL_MS, false)).toBeNull();
    // Unheard delivery: it still leaves when the delivery was due.
    expect(trainAt(heard, brake + TRAIN_DWELL_MS + TRAIN_ROLL_MS, false)).toBeNull();
    // Heard only the delivery: it is standing already.
    expect(trainAt({ arriveAt: null, brakeAt: brake }, brake, false)).toBe(0);
  });

  it('cuts the Train in and out under reduced motion', () => {
    const both = { arriveAt: 1000, brakeAt: 9000 };
    expect(trainAt(both, 1000, true)).toBe(0);
    expect(trainAt(both, 9000 + TRAIN_DWELL_MS, true)).toBeNull();
  });
});
