import { describe, expect, it } from 'vitest';
import { content, RelationsFile, validateContent, type Content } from '../src/index.js';

// Round 8 (GDD 3.22 "Inspect"), Session 8B: the relations table's checks.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy).filter((e) => e.startsWith('relation'));
}

const row = (inspector: string, inspected: string, extra: Record<string, unknown> = {}) => ({
  inspector,
  inspected,
  suspicion: 1,
  ...extra,
});

describe('relations.json', () => {
  it('ships valid, with the inert Activist and Railroad Baron row', () => {
    expect(broken(() => undefined)).toEqual([]);
    expect(content.relations.rows).toContainEqual(
      expect.objectContaining({
        inspector: 'vendetta:activist',
        inspected: 'role:railroadBaron',
        inert: true,
      }),
    );
  });

  it('rejects an unknown side, a misplaced mark and a needless inert', () => {
    const errors = broken((c) => {
      c.relations.rows = [
        row('role:nobody', 'role:vicar'),
        row('mark', 'role:vicar'),
        row('vendetta:zealot', 'mark'),
        row('role:thief', 'look:baker', { inert: true }),
        row('faction:cabal', 'figure:clerk'),
      ];
    });
    expect(errors).toEqual([
      'relation 0 (role:nobody -> role:vicar): unknown side role:nobody',
      'relation 1 (mark -> role:vicar): mark stands only on the inspected side',
      'relation 2 (vendetta:zealot -> mark): mark needs a contract vendetta inspecting',
      'relation 3 (role:thief -> look:baker): inert, but both sides exist today',
      'relation 4 (faction:cabal -> figure:clerk): unknown side figure:clerk',
    ]);
  });

  it('rejects bands out of order and a side that is not a side', () => {
    expect(
      broken((c) => {
        c.relations.inspect.health = { unhurt: 0.3, bruised: 0.5 };
      }),
    ).toEqual(['relations inspect.health: bruised is above unhurt']);
    const raw = structuredClone(content.relations) as { rows: unknown[] };
    raw.rows = [row('detective', 'role:vicar')];
    expect(() => RelationsFile.parse(raw)).toThrow();
  });
});
