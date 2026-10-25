// Round 9 (9W, N4): the NPC editor's pure edits on the people: where a scene's quest givers stand, which look and name
// a quest NPC has, and the lines an NPC seat writes in the meeting notes. Looks come only from the villager family,
// never from a card, so nothing here shows or edits a seat's card (CLAUDE.md role secrecy); a talk line names no role.
import {
  content,
  QuestsFile,
  TalkFile,
  validateContent,
  TALK_FILLS,
  type Content,
  type Scene,
  type TalkWhen,
} from '@wdi/content';
import { checkScene } from '../editor/checks';

export type Done<T> = { value: T } | { error: string };
type Facing = Scene['givers'] extends (infer G)[] | undefined
  ? G extends { facing: infer F }
    ? F
    : never
  : never;

/** The looks a quest NPC may wear: the villager family, in the file's order. A seat's card look is never offered. */
export const villagerLooks = (): Array<{ id: string; name: string }> =>
  Object.values(content.looks.villagers).map((v) => ({ id: v.id, name: v.name }));

const NAME = /^[a-z][a-z0-9_]*$/;
const inside = (s: Scene, x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < s.size.w && y < s.size.h;

const gv = (s: Scene) => s.givers ?? [];
const withGivers = (s: Scene, givers: NonNullable<Scene['givers']>): Scene => ({ ...s, givers });

/** Adds a quest giver for `npc` (an NPC of quests.json) at a tile, under a new id `<prefix>.gv_<name>`. */
export function addGiver(
  s: Scene,
  name: string,
  npc: string,
  x: number,
  y: number,
  facing: Facing,
): Done<Scene> {
  if (!NAME.test(name))
    return { error: 'a name is lowercase letters, digits and underscores, starting with a letter' };
  if (!(npc in content.quests.npcs)) return { error: `${npc} is not a quest NPC` };
  if (!inside(s, x, y)) return { error: `tile ${x},${y} is outside the scene` };
  const id = `${s.prefix}.gv_${name}`;
  if (gv(s).some((g) => g.id === id)) return { error: `${id} already exists` };
  return { value: withGivers(s, [...gv(s), { id, npc, x, y, facing }]) };
}

/** Moves a giver to a tile and turns it; its id and NPC never change (ids are frozen). */
export function moveGiver(s: Scene, id: string, x: number, y: number, facing?: Facing): Done<Scene> {
  const g = gv(s).find((o) => o.id === id);
  if (g === undefined) return { error: `${id} is not a giver of ${s.id}` };
  if (!inside(s, x, y)) return { error: `tile ${x},${y} is outside the scene` };
  return {
    value: withGivers(
      s,
      gv(s).map((o) => (o.id === id ? { ...o, x, y, facing: facing ?? o.facing } : o)),
    ),
  };
}

/** Removes a giver unless a quest still names its NPC and no other giver of the map stands for it. */
export function removeGiver(s: Scene, id: string): Done<Scene> {
  const g = gv(s).find((o) => o.id === id);
  if (g === undefined) return { error: `${id} is not a giver of ${s.id}` };
  const asked = Object.values(content.quests.quests)
    .filter((q) => q.giver === g.npc)
    .map((q) => q.id);
  if (asked.length > 0 && gv(s).filter((o) => o.npc === g.npc).length === 1)
    return { error: `${g.npc} would have no giver; quests ask for it: ${asked.join(', ')}` };
  return {
    value: withGivers(
      s,
      gv(s).filter((o) => o.id !== id),
    ),
  };
}

/** The errors an edited scene adds beyond the committed one. */
export const sceneErrors = (edited: Scene, base: Scene): string[] => {
  const before = new Set(checkScene(base).errors);
  return checkScene(edited).errors.filter((e) => !before.has(e));
};

/** `quests.json` with a quest NPC's look or name changed; the look must be of the villager family. */
export function setNpc(q: QuestsFile, id: string, over: { look?: string; name?: string }): Done<QuestsFile> {
  const npc = q.npcs[id];
  if (npc === undefined) return { error: `${id} is not a quest NPC` };
  if (over.look !== undefined && !(over.look in content.looks.villagers))
    return { error: `${over.look} is not a villager look` };
  if (over.name !== undefined && over.name.trim() === '') return { error: 'a name is needed' };
  return {
    value: {
      ...q,
      npcs: { ...q.npcs, [id]: { ...npc, ...over, ...(over.name ? { name: over.name.trim() } : {}) } },
    },
  };
}

export const LISTS = ['notes', 'herrings', 'smallTalk'] as const;
export type TalkList = (typeof LISTS)[number];
export type Line = { text: string; when?: TalkWhen | undefined };

/** One list of the talk file as lines; small talk has a `text` and no `when`. */
export const linesOf = (t: TalkFile, list: TalkList): Line[] =>
  list === 'smallTalk' ? t.smallTalk.map((text) => ({ text })) : t[list];

/** The talk file with line `i` of a list replaced, or appended when `i` is the list's length, or dropped when `line` is null. */
export function setLine(t: TalkFile, list: TalkList, i: number, line: Line | null): Done<TalkFile> {
  const lines = linesOf(t, list);
  if (!Number.isInteger(i) || i < 0 || i > lines.length) return { error: `no line ${i + 1} in ${list}` };
  const next = [...lines];
  if (line === null) {
    if (i === lines.length) return { error: `no line ${i + 1} in ${list}` };
    if (lines.length === 1) return { error: `${list} needs at least one line` };
    next.splice(i, 1);
  } else next.splice(i, i === lines.length ? 0 : 1, { ...line, text: line.text.trim() });
  const keep = (l: Line) =>
    list === 'smallTalk' ? l.text : l.when === undefined ? { text: l.text } : { text: l.text, when: l.when };
  return { value: { ...t, [list]: next.map(keep) } as TalkFile };
}

/** The placeholders a list may use, for the editor's hint. */
export const fillsOf = (list: TalkList): readonly string[] => TALK_FILLS[list];

const checked = <F extends 'quests' | 'talk'>(file: F, edited: Content[F]): string[] => {
  const run = (v: Content[F]): string[] => {
    const parsed = (file === 'quests' ? QuestsFile : TalkFile).safeParse(v);
    if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return validateContent({ ...content, [file]: v });
  };
  const before = new Set(run(content[file]));
  return run(edited).filter((e) => !before.has(e));
};
/** The errors an edited `quests.json` or `talk.json` adds beyond the committed file. */
export const questErrors = (q: QuestsFile): string[] => checked('quests', q);
export const talkErrors = (t: TalkFile): string[] => checked('talk', t);
