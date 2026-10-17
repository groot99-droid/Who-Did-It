import { describe, expect, it } from 'vitest';
import { traits } from '@wdi/content';
import balance from '@wdi/content/data/balance.json';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import {
  isOnubCard,
  lookLine,
  ROLE_CARD_SECONDS,
  roleCardSeconds,
  roleTitle,
  TRAIT_LABELS,
} from './RoleCard';

describe('role card text', () => {
  it('builds the look line from traits', () => {
    expect(lookLine({ height: 'tall', scarf: 'green', hat: 'bowler' })).toBe(
      'You look like: Tall / Green scarf / Bowler hat',
    );
    expect(lookLine({ height: 'short', scarf: 'red', hat: 'bare' })).toBe(
      'You look like: Short / Red scarf / Bare head',
    );
  });

  it('humanises role ids', () => {
    expect(roleTitle('killer')).toBe('Killer');
    expect(roleTitle('sin_eater')).toBe('Sin Eater');
  });
});

describe('trait labels', () => {
  it('match traits.json ids and labels', () => {
    for (const axis of ['height', 'scarf', 'hat'] as const) {
      const fromData = Object.fromEntries(traits.axes[axis].values.map((v) => [v.id, v.label]));
      expect(TRAIT_LABELS[axis]).toEqual(fromData);
    }
  });
});

describe('quick-mode card', () => {
  it('reads the hold from balance.json, or from the quick-mode timers when the card says so', () => {
    expect(ROLE_CARD_SECONDS).toBe(balance.phases.roleRevealS);
    expect(roleCardSeconds({ beware: 'Clues match your traits' })).toBe(balance.phases.roleRevealS);
    expect(isOnubCard({ beware: onubRoles.cardLine })).toBe(true);
    expect(roleCardSeconds({ beware: onubRoles.cardLine })).toBe(onubBalance.timers.roleCardS);
  });

  it('names a quick-mode role through roles.onub.json', () => {
    expect(roleTitle('sinEater', 'onub')).toBe('Sin-Eater');
    expect(roleTitle('sinEater')).toBe('SinEater');
  });
});
