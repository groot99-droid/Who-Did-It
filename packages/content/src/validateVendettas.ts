import type { VendettasFile } from './schemas/bible.js';
import type { MapFile, MapId } from './schemas/maps.js';
import type { RolesFile } from './schemas/roles.js';

/**
 * Round 7 (GDD 3.20; docs/round7/vendettas.md 2), Session 7H: every vendetta is keyed by its id, belongs to a card
 * that holds the Knife, needs a card of `roles.json` and a scene of each of its maps, emits only kinds of its own
 * (`vendetta.<kind>.<step>`), and fires one of them.
 */
export function checkVendettas(
  c: { vendettas: VendettasFile; roles: RolesFile; maps: Record<MapId, MapFile> },
  err: (msg: string) => void,
): void {
  for (const [key, v] of Object.entries(c.vendettas.vendettas)) {
    const at = `vendetta ${key}`;
    if (key !== v.id) err(`${at}: key holds the id "${v.id}"`);
    if (c.roles.roles[v.role]?.abilities.includes('kill') !== true) err(`${at}: ${v.role} holds no Knife`);
    if (v.needsCard !== undefined && !(v.needsCard in c.roles.roles))
      err(`${at}: unknown card ${v.needsCard}`);
    const maps = v.maps ?? (Object.keys(c.maps) as MapId[]);
    if (v.needsScene !== undefined && !maps.some((m) => c.maps[m]?.scenes.includes(v.needsScene as never)))
      err(`${at}: ${v.needsScene} is on none of its maps`);
    for (const kind of v.emits)
      if (!kind.startsWith(`vendetta.${v.kind}.`)) err(`${at}: emits ${kind}, not a vendetta.${v.kind} kind`);
    if (!v.emits.includes(v.fires)) err(`${at}: fires ${v.fires}, which it does not emit`);
  }
}
