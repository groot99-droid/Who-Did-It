import { describe, expect, it } from 'vitest';
import { traits } from '@wdi/content';
import { lookLine, roleTitle, TRAIT_LABELS } from './RoleCard';

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
