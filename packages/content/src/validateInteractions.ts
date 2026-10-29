import type { ItemsFile } from './schemas/items.js';
import type { MinigamesFile, RecipesFile, ResourcesFile } from './schemas/m5b.js';
import type { RoutinesFile } from './schemas/routines.js';
import type { Scene, SceneId } from './schemas/scene.js';
import {
  CENSUS_DECISIONS,
  STEM_KINDS,
  censusMap,
  classesOfProp,
  decideProp,
  propStem,
  type InteractionsFile,
} from './schemas/interactions.js';

/**
 * Round 10 (A9; docs/round9/logic-table.md 3.2 and 5, GDD 3.14): the logic table against the scenes and the other
 * tables. Every placed prop has one census decision and at most one class, so a hold on it has one answer and a new
 * prop in a scene file is caught; every `live` kind is a class; every class, drop, loot table and mini-game an
 * interaction names exists; a tool wall has its `NEED_TOOL` line.
 */
export function checkInteractions(
  c: {
    interactions: InteractionsFile;
    scenes: Record<SceneId, Scene>;
    items: ItemsFile;
    resources: ResourcesFile;
    recipes: RecipesFile;
    minigames: MinigamesFile;
    routines: RoutinesFile;
  },
  err: (msg: string) => void,
): void {
  const t = c.interactions;
  const file = 'interactions.json';

  for (const which of ['kinds', 'stems'] as const) {
    const seen = new Map<string, string>();
    for (const d of CENSUS_DECISIONS)
      for (const name of (t.census[which][d] ?? []).flatMap((e) => e.split(/\s+/))) {
        const before = seen.get(name);
        if (before !== undefined) err(`${file} census.${which}: ${name} is both ${before} and ${d}`);
        else seen.set(name, d);
      }
  }

  const placedKinds = new Set<string>();
  const placedStems = new Set<string>();
  for (const scene of Object.values(c.scenes))
    for (const prop of scene.props) {
      placedKinds.add(prop.kind);
      if (STEM_KINDS.has(prop.kind)) placedStems.add(propStem(prop.id));
      const name = STEM_KINDS.has(prop.kind) ? `${prop.kind} stem ${propStem(prop.id)}` : `kind ${prop.kind}`;
      if (decideProp(t, prop) === undefined)
        err(`scene ${scene.id}: prop ${prop.id} (${name}) has no census decision`);
      const classes = classesOfProp(t, prop);
      if (classes.length > 1) err(`scene ${scene.id}: prop ${prop.id} matches classes ${classes.join(', ')}`);
    }

  const routineKinds = new Set(Object.values(c.routines.activities).flatMap((a) => a.kinds));
  const classKinds = new Set<string>();
  for (const [id, cls] of Object.entries(t.classes)) {
    for (const kind of cls.match.kinds ?? []) {
      classKinds.add(kind);
      if (!placedKinds.has(kind) && !routineKinds.has(kind))
        err(`${file} class ${id}: kind ${kind} is placed nowhere`);
    }
    for (const stem of cls.match.stems ?? [])
      if (!placedStems.has(stem)) err(`${file} class ${id}: stem ${stem} is placed nowhere`);
    const res = cls.match.resource;
    if (res !== undefined && !Object.hasOwn(c.resources.resources, res))
      err(`${file} class ${id}: unknown resource ${res}`);
  }
  for (const kind of censusMap(t.census.kinds).entries())
    if (kind[1] === 'live' && !classKinds.has(kind[0])) err(`${file}: live kind ${kind[0]} has no class`);

  const made = new Set(Object.values(c.recipes.recipes).map((r) => r.out));
  const looted = new Set(Object.values(t.lootTables).flatMap((l) => l.entries.map((e) => e.item)));
  const obtainable = (id: string) => made.has(id) || looted.has(id);
  const isItem = (id: string) => Object.hasOwn(c.items.items, id);
  for (const [id, table] of Object.entries(t.lootTables))
    for (const e of table.entries)
      if (e.item !== null && !isItem(e.item)) err(`${file} loot ${id}: unknown item ${e.item}`);

  for (const [id, it] of Object.entries(t.interactions)) {
    const where = `${file} ${id}`;
    const cls = t.classes[it.target];
    if (cls === undefined) err(`${where}: unknown class ${it.target}`);
    for (const m of it.modes) {
      if (m.tool !== null && m.tool.tier > t.tags[m.tool.tag].tiers)
        err(`${where}: ${m.tool.tag} has no tier ${m.tool.tier}`);
      for (const ref of [...(m.drops ?? []), ...(m.consumes ?? [])])
        if (!isItem(ref.item)) err(`${where}: unknown item ${ref.item}`);
      if (m.loot !== undefined && !Object.hasOwn(t.lootTables, m.loot))
        err(`${where}: unknown loot table ${m.loot}`);
      if (
        m.minigame !== undefined &&
        it.status === 'live' &&
        !Object.hasOwn(c.minigames.minigames, m.minigame)
      )
        err(`${where}: unknown mini-game ${m.minigame}`);
      for (const stem of m.only ?? [])
        if (!(cls?.match.stems?.includes(stem) ?? false))
          err(`${where}: mode stem ${stem} is not its class's`);
    }
    for (const m of it.modes)
      if (m.tool !== null) {
        const carriers = Object.values(c.items.items).filter((i) => (i.tool?.[m.tool!.tag] ?? 0) >= m.tool!.tier);
        // Logic table 10.1: no verb needs a role's item, and a wall's tool is one a seat can come by.
        if (!carriers.some((i) => !i.roleBound)) err(`${where}: no neutral item carries ${m.tool.tag} ${m.tool.tier}`);
        else if (!carriers.some((i) => !i.roleBound && obtainable(i.id)))
          err(`${where}: nobody can come by a ${m.tool.tag} ${m.tool.tier} tool`);
      }
    if (it.modes.every((m) => m.tool !== null) && it.fail.NEED_TOOL === undefined)
      err(`${where}: a tool wall needs a NEED_TOOL line`);
  }
}
