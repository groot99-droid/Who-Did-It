// The NPC name pool (GDD 3.12, A39), for the server only: a client that held the pool could tell an NPC
// seat by its name, so this module is reached through `@wdi/content/server` and the client lint forbids
// that import. Importing it parses and validates `data/names.json` against the lobby rules.
import namesJson from '../data/names.json' with { type: 'json' };
import { balance, onubRoles, roles } from './index.js';
import { NamesFile } from './schemas/names.js';

export * from './schemas/names.js';

/** Every problem with the pool: lobby-legal, unique, free of role tokens, enough for a full party. */
export function validateNames(file: NamesFile): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const tokens = [...Object.keys(roles.roles), ...Object.keys(onubRoles.roles)].map((r) => r.toLowerCase());
  for (const name of file.pool) {
    const key = name.trim().toLowerCase();
    if (name !== name.trim() || key.length < balance.lobby.nameMin || key.length > balance.lobby.nameMax) {
      errors.push(`names.json: "${name}" is not a legal lobby name`);
    }
    if (seen.has(key)) errors.push(`names.json: "${name}" twice`);
    seen.add(key);
    for (const token of tokens) {
      if (key.includes(token)) errors.push(`names.json: "${name}" carries the role token ${token}`);
    }
  }
  if (file.pool.length < balance.players.max) {
    errors.push(`names.json: ${file.pool.length} names, at least ${balance.players.max} needed`);
  }
  return errors;
}

export const names: NamesFile = NamesFile.parse(namesJson);
const problems = validateNames(names);
if (problems.length > 0) throw new Error(problems.join('\n'));
