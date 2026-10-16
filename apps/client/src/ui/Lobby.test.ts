import { describe, expect, it } from 'vitest';
import balanceJson from '@wdi/content/data/balance.json';
import onubBalanceJson from '@wdi/content/data/balance.onub.json';
import { modeChipText } from './Lobby';

describe('mode chip', () => {
  it('names the main mode plainly', () => {
    expect(modeChipText('main')).toBe('Who Did It');
  });

  it('names the quick mode with its length and party size from the content files', () => {
    const { min, max } = onubBalanceJson.targetLengthMin;
    const { players } = balanceJson;
    expect(modeChipText('onub')).toBe(
      `One Night Ultimate Baguette, ${min}-${max} min, ${players.min}-${players.max} players`,
    );
  });
});
