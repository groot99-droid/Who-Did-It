// Cross-file checks that a single zod schema cannot express: every id a record refers to exists,
// roster and deck rows add up, and every scene grid agrees with its portals, spawns and spots.
import type { AbilitiesFile } from './schemas/abilities.js';
import { PROFILE_RANK, type BalanceFile, type Profile } from './schemas/balance.js';
import type { CluesFile } from './schemas/clues.js';
import { PLAYER_COUNTS } from './schemas/common.js';
import type { ItemsFile } from './schemas/items.js';
import type { MetricsFile } from './schemas/metrics.js';
import type { NamesFile } from './schemas/names.js';
import type { OnubBalanceFile } from './schemas/onubBalance.js';
import type { OnubRolesFile } from './schemas/onubRoles.js';
import type { PaletteFile } from './schemas/palette.js';
import type { RolesFile } from './schemas/roles.js';
import type { Scene, SceneId } from './schemas/scene.js';
import type { StyleFile } from './schemas/style.js';
import type { TasksFile } from './schemas/tasks.js';
import type { TraitsFile } from './schemas/traits.js';

export interface Content {
  palette: PaletteFile;
  metrics: MetricsFile;
  style: StyleFile;
  traits: TraitsFile;
  roles: RolesFile;
  abilities: AbilitiesFile;
  items: ItemsFile;
  clues: CluesFile;
  tasks: TasksFile;
  balance: BalanceFile;
  scenes: Record<SceneId, Scene>;
  onubRoles: OnubRolesFile;
  onubBalance: OnubBalanceFile;
  names: NamesFile;
}

const maxProfile = (a: Profile, b: Profile): Profile => (PROFILE_RANK[a] >= PROFILE_RANK[b] ? a : b);

function keyedById(file: string, map: Record<string, { id: string }>, errors: string[]) {
  for (const [key, record] of Object.entries(map)) {
    if (key !== record.id) errors.push(`${file}: key "${key}" holds record with id "${record.id}"`);
  }
}

function sameMultiset(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/** Returns every problem found; an empty list means the content is consistent. */
export function validateContent(c: Content): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);
  const { roles, abilities, items, clues, tasks, balance, onubRoles, onubBalance, names } = c;
  const scenes: Record<string, Scene | undefined> = c.scenes;

  keyedById('roles.json', roles.roles, errors);
  keyedById('abilities.json', abilities.abilities, errors);
  keyedById('items.json', items.items, errors);
  keyedById('clues.json', clues.clues, errors);
  keyedById('tasks.json', tasks.tasks, errors);
  keyedById('roles.onub.json', onubRoles.roles, errors);
  keyedById('balance.onub.json acts', onubBalance.acts, errors);

  const isItem = (id: string) => id in items.items;
  const isAbility = (id: string) => id in abilities.abilities;

  // Roles: kits, abilities and rosters.
  const cardAbilities = new Set<string>();
  for (const role of Object.values(roles.roles)) {
    for (const k of role.startKit) if (!isItem(k.item)) err(`role ${role.id}: unknown item ${k.item}`);
    for (const a of role.abilities) {
      cardAbilities.add(a);
      if (!isAbility(a)) err(`role ${role.id}: unknown ability ${a}`);
      else if (abilities.abilities[a]?.scope !== 'role') err(`role ${role.id}: ${a} is not a role ability`);
    }
    if ((role.faction === 'cabal') !== (role.winsWith === 'cabal')) err(`role ${role.id}: faction/winsWith`);
  }
  const standIn = roles.roles[roles.standIn];
  if (!standIn || standIn.ships !== 'V1') err(`roles.json: stand-in ${roles.standIn} must be a V1 role`);
  for (const n of PLAYER_COUNTS) {
    const row = roles.rosters[n];
    const count = Number(n);
    if (row.deal.length !== count) err(`roster ${n}: deal has ${row.deal.length} roles`);
    if (row.planned.length !== count) err(`roster ${n}: planned has ${row.planned.length} roles`);
    for (const id of [...row.deal, ...row.planned])
      if (!roles.roles[id]) err(`roster ${n}: unknown role ${id}`);
    for (const id of row.deal) {
      if (roles.roles[id] && roles.roles[id].ships !== 'V1') err(`roster ${n}: deals unshipped role ${id}`);
    }
    const expected = row.planned.map((id) => (roles.roles[id]?.ships === 'V1' ? id : roles.standIn));
    if (!sameMultiset(expected, row.deal)) err(`roster ${n}: deal is not planned with stand-ins`);
    if (!row.deal.includes(roles.standIn)) err(`roster ${n}: no ${roles.standIn} (never fewer than 1)`);
    if (row.practice !== (count === 4)) err(`roster ${n}: only 4 is a practice party`);
  }

  // Abilities and items refer to each other.
  for (const ab of Object.values(abilities.abilities)) {
    for (const ref of [ab.requires, ab.consumes]) {
      if (ref !== undefined && !isItem(ref)) err(`ability ${ab.id}: unknown item ${ref}`);
    }
    if (ab.scope === 'role' && !cardAbilities.has(ab.id)) err(`ability ${ab.id}: on no role card`);
  }
  const itemUses = new Set<string>();
  for (const item of Object.values(items.items)) {
    if (item.use !== undefined) {
      itemUses.add(item.use);
      if (!isAbility(item.use)) err(`item ${item.id}: unknown ability ${item.use}`);
    }
    if (item.roleBound && item.onDeath === 'drops') err(`item ${item.id}: role-bound items never drop`);
    if (!item.roleBound && item.onDeath !== 'drops') err(`item ${item.id}: only role-bound items stay`);
  }
  for (const ab of Object.values(abilities.abilities)) {
    if (ab.scope === 'item' && !itemUses.has(ab.id)) err(`ability ${ab.id}: no item uses it`);
  }
  for (const clue of Object.values(clues.clues)) {
    if (clue.readWith !== undefined && !isAbility(clue.readWith)) {
      err(`clue ${clue.id}: unknown ability ${clue.readWith}`);
    }
  }

  // Scenes.
  const portalIds = new Set<string>();
  const objectIds = new Set<string>();
  const propIn = (scene: string, prop: string) => scenes[scene]?.props.some((p) => p.id === prop) ?? false;
  for (const [key, scene] of Object.entries(c.scenes)) {
    const where = `scene ${key}`;
    if (key !== scene.id) err(`${where}: file key and id differ`);
    if (scene.zoneId !== scene.id) err(`${where}: zoneId equals sceneId in V1`);
    errors.push(...checkGrid(scene));
    for (const portal of scene.portals) {
      if (portalIds.has(portal.id)) err(`${where}: duplicate portal id ${portal.id}`);
      portalIds.add(portal.id);
      if (portal.from !== scene.id) err(`${where}: portal ${portal.id} has from ${portal.from}`);
      if (portal.to === null || portal.toSpawn === null) {
        if (portal.ships === 'V1') err(`${where}: V1 portal ${portal.id} has no target`);
        continue;
      }
      const target = scenes[portal.to];
      if (!target) {
        err(`${where}: portal ${portal.id} targets unknown scene ${portal.to}`);
        continue;
      }
      if (!target.spawns.some((s) => s.id === portal.toSpawn)) {
        err(`${where}: portal ${portal.id} targets unknown spawn ${portal.to}.${portal.toSpawn}`);
      }
      const gated = maxProfile(scene.profile, target.profile);
      if (portal.minProfile !== gated) {
        err(`${where}: portal ${portal.id} minProfile ${portal.minProfile}, expected ${gated}`);
      }
      if (portal.kind === 'drop' && portal.noise !== 'oneWayDrop') err(`${where}: drop ${portal.id} noise`);
      if (portal.kind === 'drop' && !portal.oneWay) err(`${where}: drop ${portal.id} must be one-way`);
    }
    for (const obj of [...scene.spots, ...scene.props, ...scene.gates, ...scene.paths]) {
      if (objectIds.has(obj.id)) err(`${where}: duplicate id ${obj.id}`);
      objectIds.add(obj.id);
    }
    for (const prop of scene.props) {
      if (prop.item !== undefined && !isItem(prop.item)) err(`${where}: prop ${prop.id} unknown item`);
    }
    for (const gate of scene.gates) {
      if (PROFILE_RANK[gate.minProfile] <= PROFILE_RANK[scene.profile]) {
        err(`${where}: gate ${gate.id} never closes`);
      }
    }
  }
  // Two-way portals come in pairs: A -> B.spawn and B's portal at that spawn leads back to A.
  for (const scene of Object.values(c.scenes)) {
    for (const portal of scene.portals) {
      if (portal.oneWay || portal.to === null) continue;
      const back = scenes[portal.to]?.portals.find(
        (p) => p.to === scene.id && !p.oneWay && p.toSpawn !== null,
      );
      if (!back) err(`portal ${portal.id}: no portal leads back from ${portal.to}`);
    }
  }

  // Tasks point at real items, scenes and props.
  for (const task of Object.values(tasks.tasks)) {
    if (task.tool !== undefined && !isItem(task.tool)) err(`task ${task.id}: unknown tool ${task.tool}`);
    for (const node of [...(task.source ? [task.source] : []), ...task.targets]) {
      if (!propIn(node.scene, node.prop)) err(`task ${task.id}: no prop ${node.prop} in ${node.scene}`);
    }
    if (task.source && task.targets.some((t) => t.scene === task.source?.scene)) {
      err(`task ${task.id}: the tool must come from another scene`);
    }
    if (task.kind === 'fetch' && (task.tool === undefined || task.source === undefined)) {
      err(`task ${task.id}: fetch tasks need a tool and a source`);
    }
    if (task.kind === 'coop' && (task.coopPlayers === undefined || task.coopRadiusTiles === undefined)) {
      err(`task ${task.id}: co-op tasks need coopPlayers and coopRadiusTiles`);
    }
  }

  // Balance rows agree with the scene profiles.
  for (const n of PLAYER_COUNTS) {
    const profile = balance.byCount[n].profile;
    const count = Number(n);
    const expected: Profile = count <= 6 ? 'small' : count <= 8 ? 'medium' : 'large';
    if (profile !== expected) err(`balance ${n}: profile ${profile}, WORLD 4.3 says ${expected}`);
  }

  // NPC name pool (GDD 3.12): lobby-legal, unique, enough for a full party, no role token.
  const seen = new Set<string>();
  const roleTokens = [...Object.keys(roles.roles), ...Object.keys(onubRoles.roles)].map((r) =>
    r.toLowerCase(),
  );
  for (const name of names.pool) {
    const key = name.trim().toLowerCase();
    if (name !== name.trim() || key.length < balance.lobby.nameMin || key.length > balance.lobby.nameMax)
      err(`names.json: "${name}" is not a legal lobby name`);
    if (seen.has(key)) err(`names.json: "${name}" twice`);
    seen.add(key);
    for (const token of roleTokens)
      if (key.includes(token)) err(`names.json: "${name}" carries the role token ${token}`);
  }
  if (names.pool.length < balance.players.max)
    err(`names.json: ${names.pool.length} names, at least ${balance.players.max} needed`);

  // Quick mode: decks, windows and acts.
  const onubRole = (id: string) => onubRoles.roles[id];
  if (onubRole(onubRoles.standIn)?.ships !== 'V1') err(`roles.onub.json: stand-in must ship in V1`);
  for (const n of PLAYER_COUNTS) {
    const row = onubBalance.byCount[n];
    const loaves = Number(n) + onubBalance.deadLoaves;
    if (row.loaves !== loaves) err(`onub ${n}: ${row.loaves} loaves, expected ${loaves}`);
    if (row.deck.length !== loaves) err(`onub ${n}: deck has ${row.deck.length} loaves`);
    if (row.planned.length !== loaves) err(`onub ${n}: planned deck has ${row.planned.length} loaves`);
    for (const id of [...row.deck, ...row.planned]) if (!onubRole(id)) err(`onub ${n}: unknown role ${id}`);
    const expected = row.planned.map((id) => (onubRole(id)?.ships === 'V1' ? id : onubRoles.standIn));
    if (!sameMultiset(expected, row.deck)) err(`onub ${n}: deck is not planned with stand-ins`);
  }
  const windowRoles = onubBalance.windows.map((w) => w.role);
  if (new Set(windowRoles).size !== windowRoles.length) err('onub: a role has two night windows');
  onubBalance.windows.forEach((w, i) => {
    if (w.order !== i + 1) err(`onub window ${w.role}: order ${w.order}, expected ${i + 1}`);
    if (!onubRole(w.role)) err(`onub window: unknown role ${w.role}`);
    for (const a of w.acts)
      if (!(a.act in onubBalance.acts)) err(`onub window ${w.role}: unknown act ${a.act}`);
  });
  for (const role of Object.values(onubRoles.roles)) {
    if (role.wakes !== windowRoles.includes(role.id)) {
      err(`onub role ${role.id}: wakes=${role.wakes} but ${role.wakes ? 'has no' : 'has a'} window`);
    }
  }

  return errors;
}

export function assertValid(c: Content): void {
  const errors = validateContent(c);
  if (errors.length) throw new Error(`@wdi/content is inconsistent:\n- ${errors.join('\n- ')}`);
}

const SOLID_USED_FROM_FLOOR = new Set(['D', 'H', 'B']);

/** Grid size, legend bijections and object bounds for one scene. */
export function checkGrid(scene: Scene): string[] {
  const errors: string[] = [];
  const where = `scene ${scene.id}`;
  const { w, h } = scene.size;
  if (scene.grid.length !== h) errors.push(`${where}: grid has ${scene.grid.length} rows, size says ${h}`);
  scene.grid.forEach((row, y) => {
    if (row.length !== w) errors.push(`${where}: row ${y} has ${row.length} columns, size says ${w}`);
  });
  const at = (x: number, y: number) => scene.grid[y]?.[x];
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  const expect = new Map<string, string>();
  const mark = (x: number, y: number, ch: string, what: string) => {
    const key = `${x},${y}`;
    if (!inBounds(x, y)) errors.push(`${where}: ${what} at ${key} is out of bounds`);
    else if (expect.has(key)) errors.push(`${where}: ${what} shares tile ${key}`);
    else if (at(x, y) !== ch) errors.push(`${where}: ${what} at ${key} is "${at(x, y)}", expected "${ch}"`);
    expect.set(key, ch);
  };
  for (const p of scene.portals) mark(p.x, p.y, 'D', `portal ${p.id}`);
  for (const s of scene.spawns) mark(s.x, s.y, 'S', `spawn ${s.id}`);
  for (const s of scene.spots) mark(s.x, s.y, s.kind === 'hide' ? 'H' : 'B', `spot ${s.id}`);
  scene.grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if ('DSHB'.includes(ch) && !expect.has(`${x},${y}`)) {
        errors.push(
          `${where}: "${ch}" at ${x},${y} has no ${ch === 'D' ? 'portal' : ch === 'S' ? 'spawn' : 'spot'}`,
        );
      }
    }),
  );

  const spawnIds = scene.spawns.map((s) => s.id);
  if (new Set(spawnIds).size !== spawnIds.length) errors.push(`${where}: duplicate spawn id`);
  const prefixed = [...scene.portals, ...scene.spots, ...scene.props, ...scene.gates, ...scene.paths];
  for (const o of prefixed) {
    if (!o.id.startsWith(`${scene.prefix}.`)) errors.push(`${where}: ${o.id} lacks prefix ${scene.prefix}.`);
  }

  // Solid interactables must be usable from an orthogonally adjacent floor tile.
  const floorish = (x: number, y: number) => at(x, y) === '.' || at(x, y) === 'S';
  const touchesFloor = (x: number, y: number) =>
    floorish(x + 1, y) || floorish(x - 1, y) || floorish(x, y + 1) || floorish(x, y - 1);
  for (const o of [...scene.portals, ...scene.spots, ...scene.props]) {
    if (!inBounds(o.x, o.y)) {
      errors.push(`${where}: ${o.id} out of bounds`);
      continue;
    }
    const ch = at(o.x, o.y) ?? '#';
    if ((SOLID_USED_FROM_FLOOR.has(ch) || ch === '#') && !touchesFloor(o.x, o.y)) {
      errors.push(`${where}: ${o.id} at ${o.x},${o.y} has no adjacent floor`);
    }
  }
  for (const g of scene.gates) {
    for (let y = g.y; y < g.y + g.h; y++) {
      for (let x = g.x; x < g.x + g.w; x++) {
        if (at(x, y) !== '.') errors.push(`${where}: gate ${g.id} covers ${x},${y} which is not floor`);
      }
    }
  }
  return errors;
}
