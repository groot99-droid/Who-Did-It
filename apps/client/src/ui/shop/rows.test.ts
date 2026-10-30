import economy from '@wdi/content/data/economy.json';
import { describe, expect, it } from 'vitest';
import { SCRIP_COPY, shopName } from '../copy/scrip';
import { shopRows } from './rows';

// Round 8, Session 8C (GDD 3.23, UI.md 14.34): the shop panel's lists.

const open = {
  shopId: 'store',
  stock: [
    { itemId: 'rope', price: 3 },
    { itemId: 'candle', price: 1 },
  ],
  buys: [{ itemId: 'timber', price: 1 }],
};

describe('shopRows', () => {
  it('greys a purchase the purse cannot cover and a sale with nothing to sell', () => {
    const rows = shopRows(open, 2, [
      { defId: 'candle', qty: 1 },
      { defId: '', qty: 0 },
    ]);
    expect(rows.stock).toEqual([
      { itemId: 'rope', price: 3, have: 0, can: false },
      { itemId: 'candle', price: 1, have: 1, can: true },
    ]);
    expect(rows.buys).toEqual([{ itemId: 'timber', price: 1, have: 0, can: false }]);
  });

  it('counts a material across stacks for the sale', () => {
    const rows = shopRows(open, 0, [
      { defId: 'timber', qty: 2 },
      { defId: 'timber', qty: 1 },
    ]);
    expect(rows.buys[0]).toEqual({ itemId: 'timber', price: 1, have: 3, can: true });
  });

  it('greys a stall item with none left today and passes `left` through (round 10, C3)', () => {
    const stall = {
      shopId: 'bakery',
      stock: [
        { itemId: 'flour', price: 1, left: 0 },
        { itemId: 'wakeLoaf', price: 1, left: 3 },
      ],
      buys: [],
    };
    expect(shopRows(stall, 9, []).stock).toEqual([
      { itemId: 'flour', price: 1, have: 0, can: false, left: 0 },
      { itemId: 'wakeLoaf', price: 1, have: 0, can: true, left: 3 },
    ]);
    expect(SCRIP_COPY['shop.soldOut']).toBeTruthy();
    expect(SCRIP_COPY['shop.left']).toContain('{n}');
  });
});

describe('shop copy', () => {
  it('names every shop of economy.json', () => {
    for (const id of Object.keys(economy.shops)) {
      expect(SCRIP_COPY).toHaveProperty(`shop.${id}`);
      expect(shopName(id)).not.toBe(id);
    }
    expect(shopName('nowhere')).toBe('nowhere');
  });
});
