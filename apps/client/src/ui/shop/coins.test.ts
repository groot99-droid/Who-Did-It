import balance from '@wdi/content/data/balance.json';
import { describe, expect, it } from 'vitest';
import { SCRIP_COPY } from '../copy/scrip';
import { promptFor } from '../M5bLayer';
import { COINS, coinsCastMs, coinsPrompt } from './coins';

describe('coins nodes in the M5b hold', () => {
  const coins = { kind: 'node', id: 'coins.1', resource: COINS, x: 0, y: 0 } as const;
  it('prompts with the coins line, needing no tool', () => {
    expect(coinsPrompt(COINS)).toBe(SCRIP_COPY['prompt.coins']);
    expect(promptFor(coins, () => false)).toBe(SCRIP_COPY['prompt.coins']);
  });
  it('casts for economy.coinPickupS, and leaves every other node to resources.json', () => {
    expect(coinsCastMs(COINS)).toBe(balance.economy.coinPickupS * 1000);
    expect(coinsCastMs('timber')).toBeNull();
    expect(coinsPrompt('timber')).toBeNull();
    expect(promptFor({ ...coins, resource: 'timber' }, () => true)).not.toBe(SCRIP_COPY['prompt.coins']);
  });
});
