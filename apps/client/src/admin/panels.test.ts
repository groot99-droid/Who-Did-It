import { describe, expect, it } from 'vitest';
import { eventLine, failureLine } from './LogPane';
import { inspectorRows } from './SeatInspector';

const base = {
  id: 'k',
  name: 'Wren',
  roleId: 'killer',
  look: 'baker',
  sceneId: 'overworld',
  x: 10.4,
  y: 20.6,
  dead: false,
};

describe('inspector rows', () => {
  const rows = (s: Parameters<typeof inspectorRows>[0]) => Object.fromEntries(inspectorRows(s));

  it('shows the true role and the look a cover wears', () => {
    const r = rows({ ...base, coverOf: 'killer' });
    expect(r.Role).toBe('killer');
    expect(r.Cover).toBe('wears the look of baker');
    expect(r.Position).toBe('10, 21');
  });

  it('says a plain seat has no cover and a person has no brain', () => {
    const r = rows({ ...base, roleId: 'baker' });
    expect(r.Cover).toBe('none');
    expect(r.Brain).toBe('a person (no brain)');
  });

  it('lists the brain fields, and inventory only when the snapshot has it', () => {
    const r = rows({ ...base, brain: { mode: 'walk', goal: '', striking: true, flee: false } });
    expect(r.Brain).toBe('mode walk, goal -, striking yes, fleeing no');
    expect(r.Inventory).toBe('the snapshot does not carry it yet');
    expect(rows({ ...base, inventory: ['torch', 'spade'], notebook: [] })).toMatchObject({
      Inventory: 'torch, spade',
      Notebook: '-',
    });
  });
});

describe('log lines', () => {
  it('reads an invariant and an event', () => {
    expect(failureLine({ name: 'noNpcStuck', tick: 40, detail: 'x' })).toBe(
      'Invariant noNpcStuck failed at tick 40: x',
    );
    expect(eventLine({ tick: 3, kind: 'kill', seat: 's1' })).toBe('Tick 3: kill (s1)');
    expect(eventLine({ tick: 3, kind: 'phase' })).toBe('Tick 3: phase');
  });
});
