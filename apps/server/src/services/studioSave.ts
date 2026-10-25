import { SCENE_IDS, Scene, type SceneId, content, validateContent } from '@wdi/content';
import { tilemapFor } from '@wdi/content/tilemap';
import { type NavData, navFromGrid } from '@wdi/shared';

/**
 * The server's half of a Studio save (round 9, docs/round9/admin-studio.md 5): it never trusts the editor. The scene
 * is parsed with the content's zod schema and the whole content is validated again with the edit in place of the
 * committed scene, so a broken reference anywhere (a clue, a task, a routine, a portal of another scene) refuses
 * the save. Ids are frozen (CLAUDE.md, WORLD 4.3): the scene keeps its id and prefix, and no portal, spawn or spot
 * id of the committed scene may disappear, so a rename is refused. A key the schema does not know, at any depth, is
 * refused rather than dropped, so nothing unchecked reaches the repo. The nav and the client's tilemap are
 * regenerated here, with the functions `pnpm grid:export` uses (`navFromGrid`, `@wdi/content/tilemap`).
 */

/** The object lists of a scene that carry ids. */
const KINDS = [
  'portals',
  'spawns',
  'spots',
  'props',
  'gates',
  'paths',
  'buildings',
  'lights',
  'nodes',
  'spawners',
  'givers',
] as const;
/** Ids V2 and other scenes read (WORLD 4.3): never removed, so never renamed. */
const FROZEN: ReadonlySet<(typeof KINDS)[number]> = new Set(['portals', 'spawns', 'spots']);

export interface CheckedSave {
  scene: Scene;
  nav: NavData;
  sceneText: string;
  navText: string;
  /** `apps/client/public/assets/scenes/<id>/tilemap.json`, as the exporter writes it. */
  tilemapText: string;
  /** Markdown lines naming what changed against the committed scene. */
  summary: string[];
}

/** A save the checks refuse: every problem found, for the editor's panel. */
export class SaveRefused extends Error {
  constructor(readonly problems: string[]) {
    super(problems[0] ?? 'refused');
  }
}

const idsOf = (scene: Scene, kind: (typeof KINDS)[number]): Map<string, string> =>
  new Map((scene[kind] ?? []).map((o: { id: string }) => [o.id, JSON.stringify(o)]));

/** What changed, kind by kind: added, removed and edited ids, the size and the grid rows. */
export function diffSummary(before: Scene, after: Scene): string[] {
  const out: string[] = [];
  if (before.size.w !== after.size.w || before.size.h !== after.size.h)
    out.push(`- size ${before.size.w}x${before.size.h} -> ${after.size.w}x${after.size.h}`);
  const rows = after.grid.filter((row, y) => row !== before.grid[y]).length;
  if (rows > 0) out.push(`- grid: ${rows} row${rows === 1 ? '' : 's'} changed`);
  if (JSON.stringify(before.material) !== JSON.stringify(after.material)) out.push('- material changed');
  for (const kind of KINDS) {
    const a = idsOf(before, kind);
    const b = idsOf(after, kind);
    const added = [...b.keys()].filter((id) => !a.has(id));
    const removed = [...a.keys()].filter((id) => !b.has(id));
    const edited = [...b.keys()].filter((id) => a.has(id) && a.get(id) !== b.get(id));
    const parts = [
      added.length ? `added ${added.map((id) => `\`${id}\``).join(', ')}` : '',
      removed.length ? `removed ${removed.map((id) => `\`${id}\``).join(', ')}` : '',
      edited.length ? `changed ${edited.map((id) => `\`${id}\``).join(', ')}` : '',
    ].filter(Boolean);
    if (parts.length) out.push(`- ${kind}: ${parts.join('; ')}`);
  }
  const rest = Object.keys({ ...before, ...after }).filter(
    (k) =>
      !['size', 'grid', 'material', ...KINDS].includes(k) &&
      JSON.stringify((before as Record<string, unknown>)[k]) !==
        JSON.stringify((after as Record<string, unknown>)[k]),
  );
  if (rest.length) out.push(`- fields: ${rest.map((k) => `\`${k}\``).join(', ')}`);
  return out;
}

/** Checks an untrusted scene from the editor against the committed content; throws `SaveRefused`. */
export function checkSave(raw: unknown, committed: typeof content = content): CheckedSave {
  const id = (raw as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !(SCENE_IDS as readonly string[]).includes(id))
    throw new SaveRefused(['unknown scene: the Studio edits the scenes of SCENE_IDS only']);
  const before = committed.scenes[id as SceneId];
  const parsed = Scene.safeParse(raw);
  if (!parsed.success)
    throw new SaveRefused(
      parsed.error.issues.slice(0, 50).map((i) => `${i.path.join('.') || 'scene'}: ${i.message}`),
    );
  const scene = parsed.data;
  const problems: string[] = unknownKeys(raw, scene, []).map((p) => `unknown key: ${p}`);
  if (scene.prefix !== before.prefix) problems.push(`prefix is frozen: ${before.prefix}`);
  for (const kind of FROZEN) {
    const now = idsOf(scene, kind);
    for (const old of idsOf(before, kind).keys())
      if (!now.has(old)) problems.push(`frozen id removed or renamed: ${kind} ${old}`);
  }
  problems.push(...validateContent({ ...committed, scenes: { ...committed.scenes, [id]: scene } }));
  if (problems.length) throw new SaveRefused(problems);
  const summary = diffSummary(before, scene);
  if (summary.length === 0) throw new SaveRefused(['nothing changed']);
  const nav = navFromGrid(scene);
  // The file keeps the editor's key order (the committed file's): zod's output follows the schema's order instead.
  return {
    scene,
    nav,
    sceneText: formatDataJson(raw),
    navText: formatDataJson(nav),
    tilemapText: tilemapText(scene),
    summary,
  };
}

/** A scene's tilemap file, byte for byte what `tools/grid/export.ts` writes. */
export const tilemapText = (scene: Scene): string => JSON.stringify(tilemapFor(scene)) + '\n';

/**
 * The paths of keys in the raw body that the parsed scene lacks (zod strips an unknown key of a non-strict object
 * instead of refusing it). The sceneText is the raw body, so every key in it must have been checked.
 */
export function unknownKeys(raw: unknown, parsed: unknown, path: string[]): string[] {
  if (Array.isArray(raw))
    return Array.isArray(parsed)
      ? raw.flatMap((v, i) => unknownKeys(v, parsed[i], [...path, String(i)]))
      : [];
  if (raw === null || typeof raw !== 'object' || parsed === null || typeof parsed !== 'object') return [];
  return Object.entries(raw).flatMap(([k, v]) =>
    Object.hasOwn(parsed, k)
      ? unknownKeys(v, (parsed as Record<string, unknown>)[k], [...path, k])
      : [[...path, k].join('.')],
  );
}

const WIDTH = 100;

function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const parts = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`);
    return parts.length ? `{ ${parts.join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

function format(value: unknown, indent: string, prefix: string, suffix: string): string {
  const flat = inline(value);
  if (
    value === null ||
    typeof value !== 'object' ||
    indent.length + prefix.length + flat.length + suffix.length <= WIDTH
  )
    return `${indent}${prefix}${flat}${suffix}`;
  const inner = indent + '  ';
  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((v) => ['', v])
    : Object.entries(value).map(([k, v]) => [`${JSON.stringify(k)}: `, v]);
  const lines = entries.map(([p, v], i) => format(v, inner, p, i < entries.length - 1 ? ',' : ''));
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return [`${indent}${prefix}${open}`, ...lines, `${indent}${close}${suffix}`].join('\n');
}

/**
 * The content's canonical JSON layout (`packages/content/scripts/lint-data.mjs`, which a script cannot share with
 * the server): two-space indent, a value on one line when it fits in 100 columns, a trailing newline. A test holds
 * it equal to the lint's own `formatJson` on every committed scene and nav.
 */
export const formatDataJson = (value: unknown): string => format(value, '', '', '') + '\n';
