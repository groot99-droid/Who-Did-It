import { describe, expect, it } from 'vitest';
import { tradeLanded } from './feedback';

describe('shop trade feedback', () => {
  it('a buy lands when the purse drops, a sale when it rises', () => {
    expect(tradeLanded({ side: 'buy', itemId: 'bread', coins: 10 }, 7)).toBe(true);
    expect(tradeLanded({ side: 'buy', itemId: 'bread', coins: 10 }, 10)).toBe(false);
    expect(tradeLanded({ side: 'buy', itemId: 'bread', coins: 10 }, 13)).toBe(false);
    expect(tradeLanded({ side: 'sell', itemId: 'timber', coins: 10 }, 12)).toBe(true);
    expect(tradeLanded({ side: 'sell', itemId: 'timber', coins: 10 }, 10)).toBe(false);
  });
});
