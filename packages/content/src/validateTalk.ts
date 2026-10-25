import type { RolesFile } from './schemas/roles.js';
import type { TalkFile } from './schemas/talk.js';

/**
 * Round 9 (N2; GDD 3.25 "Talk"): no NPC line names a card, a role or a faction (CLAUDE.md role secrecy,
 * docs/round9/failures.md rule 4), so a line the Studio edits cannot say what any seat is. Each role id, each word
 * of a role's name and each faction id is refused as a whole word, in any case.
 */
export function checkTalk(c: { talk: TalkFile; roles: RolesFile }, err: (msg: string) => void): void {
  const words = new Set<string>(Object.keys(c.roles.factions).map((f) => f.toLowerCase()));
  for (const role of Object.values(c.roles.roles)) {
    words.add(role.id.toLowerCase());
    for (const w of role.name.toLowerCase().split(/[^a-z-]+/)) if (w !== '' && w !== 'the') words.add(w);
  }
  const lists: Array<[string, string[]]> = [
    ['notes', c.talk.notes.map((l) => l.text)],
    ['herrings', c.talk.herrings.map((l) => l.text)],
    ['smallTalk', c.talk.smallTalk],
  ];
  for (const [list, lines] of lists)
    lines.forEach((text, i) => {
      const hit = text
        .toLowerCase()
        .split(/[^a-z-]+/)
        .find((w) => words.has(w));
      if (hit !== undefined) err(`talk.json ${list}.${i}: names a card, a role or a faction ("${hit}")`);
    });
}
