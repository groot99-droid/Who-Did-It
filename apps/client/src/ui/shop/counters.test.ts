import { TILE_PX } from '@wdi/shared/constants';
import { describe, expect, it } from 'vitest';
import { shopCounters } from './counters';

describe('shopCounters', () => {
  it('keeps the counters a shop names, at their tile centres', () => {
    const props = [
      { id: 'bk.shop_counter', kind: 'counter', x: 2, y: 3 },
      { id: 'bk.shop_spare', kind: 'counter', x: 4, y: 3 },
      { id: 'bk.oven', kind: 'oven', x: 1, y: 1 },
    ];
    const spots = shopCounters(props, {
      bakery: { prop: 'bk.shop_counter' },
      store: { prop: 'tb.shop_counter' },
    });
    expect(spots).toEqual([
      { propId: 'bk.shop_counter', shopId: 'bakery', x: 2.5 * TILE_PX, y: 3.5 * TILE_PX },
    ]);
  });
});
