import type { VendettasFile } from './schemas/bible.js';
import type { LooksFile } from './schemas/looks.js';
import type { RelationsFile } from './schemas/relations.js';
import type { RolesFile } from './schemas/roles.js';

/**
 * Round 8 (GDD 3.22 "Inspect"; docs/round8/body.md 7), Session 8B: every side of a live relation names a card, a
 * vendetta, a faction or a look that exists; `mark` stands only on the inspected side of a contract vendetta's row;
 * `figure:` sides (8E's townsfolk) and the roles of a later round are allowed only on an `inert` row, and an inert
 * row must name one; the health and purse bands are in order.
 */
export function checkRelations(
  c: { relations: RelationsFile; roles: RolesFile; vendettas: VendettasFile; looks: LooksFile },
  err: (msg: string) => void,
): void {
  const known = (side: string): boolean => {
    if (side === 'mark') return true;
    const [kind, id = ''] = side.split(':');
    if (kind === 'role') return id in c.roles.roles;
    if (kind === 'vendetta') return id in c.vendettas.vendettas;
    if (kind === 'faction') return id in c.roles.factions;
    if (kind === 'look') return id in c.looks.looks;
    return false; // `figure:` until 8E's townsfolk profiles land
  };
  c.relations.rows.forEach((row, i) => {
    const at = `relation ${i} (${row.inspector} -> ${row.inspected})`;
    if (row.inspector === 'mark') err(`${at}: mark stands only on the inspected side`);
    if (row.inspected === 'mark') {
      const id = row.inspector.startsWith('vendetta:') ? row.inspector.slice('vendetta:'.length) : '';
      if (c.vendettas.vendettas[id]?.kind !== 'contract')
        err(`${at}: mark needs a contract vendetta inspecting`);
    }
    const unknown = [row.inspector, row.inspected].filter((side) => !known(side));
    if (row.inert && unknown.length === 0) err(`${at}: inert, but both sides exist today`);
    if (!row.inert) for (const side of unknown) err(`${at}: unknown side ${side}`);
  });
  const { health, purse } = c.relations.inspect;
  if (health.bruised > health.unhurt) err('relations inspect.health: bruised is above unhurt');
  if (purse && purse.fair > purse.heavy) err('relations inspect.purse: fair is above heavy');
}
