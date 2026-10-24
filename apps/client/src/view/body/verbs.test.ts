import itemsJson from '@wdi/content/data/items.json';
import { TILE_PX } from '@wdi/shared/constants';
import { describe, expect, it } from 'vitest';
import { StatusBit } from '../animIds';
import { MobWireState } from '../m5bFrames';
import { STRIKE_RANGE_TILES, reachPx, strikeTarget, useVerbOf } from './verbs';

const avatar = (handle: string, x: number, statusBits = 0) => ({
  handle,
  lookOf: 'baker',
  height: 1,
  x,
  y: 0,
  yaw: 0,
  animId: 0,
  statusBits,
  transitUntilTick: 0,
});
const mob = (id: string, x: number, state = 0) => ({ id, kind: 'rat', x, y: 0, yaw: 0, animId: 0, state });
const range = reachPx(STRIKE_RANGE_TILES);

describe('strikeTarget (GDD 3.22, the X key)', () => {
  it('names the nearest other avatar in reach before any creature', () => {
    const avatars = [avatar('me', 0), avatar('far', range + 1), avatar('near', TILE_PX)];
    expect(strikeTarget(avatars, 'me', [mob('r1', 4)], range)).toBe('near');
  });
  it('falls back to the nearest living creature, never a dead one', () => {
    const avatars = [avatar('me', 0), avatar('ghost', 4, StatusBit.ghost)];
    const mobs = [mob('dead', 2, MobWireState.dead), mob('r2', TILE_PX), mob('r1', 8)];
    expect(strikeTarget(avatars, 'me', mobs, range)).toBe('r1');
    expect(strikeTarget(avatars, 'me', [mob('r3', range + 1)], range)).toBeNull();
  });
  it('has no target without the own avatar', () => {
    expect(strikeTarget([avatar('other', 0)], 'me', [mob('r1', 0)], range)).toBeNull();
  });
});

describe('useVerbOf (the pockets’ Use buttons)', () => {
  it('gives the Medkit, the Remedy and the Wake Loaf their verbs', () => {
    expect(useVerbOf('medkit')).toEqual({ id: 'heal', target: 'player', rangeTiles: 1.5 });
    expect(useVerbOf('remedy')).toEqual({ id: 'antidote', target: 'player', rangeTiles: 1.5 });
    expect(useVerbOf('wakeLoaf')).toEqual({ id: 'eat', target: 'self', rangeTiles: 0 });
  });
  it('leaves a role’s own item verbs, lights and materials to their keys', () => {
    for (const id of ['bandage', 'salts', 'slingshot', 'lantern', 'timber', 'nope'])
      expect(useVerbOf(id)).toBeNull();
  });
  it('matches an item row of the content for every verb it gives', () => {
    const items = itemsJson.items as Record<string, { use?: string }>;
    for (const id of Object.keys(items)) {
      const v = useVerbOf(id);
      if (v) expect(items[id]?.use).toBeDefined();
    }
  });
});
