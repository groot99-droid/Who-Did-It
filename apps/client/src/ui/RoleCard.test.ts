import { describe, expect, it } from 'vitest';
import { lookLine, roleTitle } from './RoleCard';

describe('role card text', () => {
  it('builds the look line from traits', () => {
    expect(lookLine({ height: 'T', scarf: 'green', hat: 'bowler' })).toBe(
      'You look like: Tall / Green scarf / Bowler hat',
    );
    expect(lookLine({ height: 'S', scarf: 'red', hat: 'bare' })).toBe(
      'You look like: Short / Red scarf / No hat',
    );
  });

  it('humanises role ids', () => {
    expect(roleTitle('killer')).toBe('Killer');
    expect(roleTitle('sin_eater')).toBe('Sin Eater');
  });
});
