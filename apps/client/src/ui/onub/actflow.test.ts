import { describe, expect, it } from 'vitest';
import { ActFlow } from './actflow';
import { parseSlot, seatSlot, slotLabel } from './slots';

const peek = { act: 'onub.peekRole', picks: 1, slots: ['seat.1.role', 'seat.2.role'] };
const pair = { act: 'onub.dishRoles', picks: 2, slots: ['seat.1.role', 'seat.2.role', 'seat.3.role'] };
const inspect = { act: 'onub.inspect', picks: 0, slots: [] };

describe('ActFlow', () => {
  it('chooses a single legal act at once and sends once the picks are complete', () => {
    const f = new ActFlow([peek]);
    expect(f.act?.act).toBe('onub.peekRole');
    expect(f.complete).toBe(false);
    f.toggle('seat.2.role');
    expect(f.send()).toEqual(['onub.peekRole', ['seat.2.role']]);
  });

  it('replaces a one-pick choice and ignores slots outside the pool', () => {
    const f = new ActFlow([peek]);
    f.toggle('seat.1.role');
    f.toggle('seat.2.role');
    f.toggle('seat.9.role');
    expect(f.picks).toEqual(['seat.2.role']);
  });

  it('waits for the seat to choose between several acts, and a new act starts the picks over', () => {
    const f = new ActFlow([peek, pair]);
    expect(f.act).toBeNull();
    expect(f.selectable().size).toBe(0);
    f.choose('onub.dishRoles');
    f.toggle('seat.1.role');
    f.toggle('seat.2.role');
    f.toggle('seat.3.role');
    expect(f.picks).toEqual(['seat.1.role', 'seat.2.role']);
    f.choose('onub.peekRole');
    expect(f.picks).toEqual([]);
  });

  it('lets a pick be taken back', () => {
    const f = new ActFlow([pair]);
    f.toggle('seat.1.role');
    f.toggle('seat.1.role');
    expect(f.picks).toEqual([]);
  });

  it('sends a pickless act at once and restarts on a new legal list', () => {
    const f = new ActFlow([inspect]);
    expect(f.send()).toEqual(['onub.inspect', []]);
    f.setLegal([peek]);
    expect(f.send()).toBeNull();
  });
});

describe('slots', () => {
  it('parses and labels the four slot forms', () => {
    expect(parseSlot('seat.3.loc')).toEqual({ kind: 'seat', index: 3, card: 'loc' });
    expect(parseSlot('pantry.role.2')).toEqual({ kind: 'pantry', index: 2, card: 'role' });
    expect(parseSlot('seat.3')).toBeNull();
    expect(seatSlot(1, 'role')).toBe('seat.1.role');
    expect(slotLabel('seat.0.role', () => 'Hana')).toBe("Hana's Role card");
    expect(slotLabel('pantry.loc.0', () => '')).toBe('Pantry Location card 1');
  });
});
