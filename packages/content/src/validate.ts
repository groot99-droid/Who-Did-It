// Cross-file checks that a single zod schema cannot express: every id a record refers to exists,
// roster and deck rows add up, and every scene grid agrees with its portals, spawns and spots.
import type { AbilitiesFile } from './schemas/abilities.js';
import { PROFILE_RANK, type BalanceFile, type Profile } from './schemas/balance.js';
import type { CluesFile } from './schemas/clues.js';
import { PLAYER_COUNTS } from './schemas/common.js';
import type { ItemsFile } from './schemas/items.js';
import type { LooksFile } from './schemas/looks.js';
import type { MetricsFile } from './schemas/metrics.js';
import type { OnubBalanceFile } from './schemas/onubBalance.js';
import type { OnubRolesFile } from './schemas/onubRoles.js';
import type { PaletteFile } from './schemas/palette.js';
import type { RolesFile } from './schemas/roles.js';
import { RoutineWorldPhase, type RoutinesFile } from './schemas/routines.js';
import type { Scene, SceneId } from './schemas/scene.js';
import type { StyleFile } from './schemas/style.js';
import type { TasksFile } from './schemas/tasks.js';
import type { TraitsFile } from './schemas/traits.js';
import type { MapFile, MapId } from './schemas/maps.js';
import { checkMaps, checkSceneWorld } from './validateWorld.js';

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
  maps: Record<MapId, MapFile>;
  onubRoles: OnubRolesFile;
  onubBalance: OnubBalanceFile;
  looks: LooksFile;
  routines: RoutinesFile;
}

const maxProfile = (a: Profile, b: Profile): Profile => (PROFILE_RANK[a] >= PROFILE_RANK[b] ? a : b);

function keyedById(file: string, map: Record<string, { id: string }>, errors: string[]) {
  for (const [key, record] of Object.entries(map)) {
    if (key !== record.id) errors.push(`${file}: key "${key}" holds record with id "${record.id}"`);
  }
}

/** Returns every problem found; an empty list means the content is consistent. */
export function validateContent(c: Content): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);
  const { roles, abilities, items, clues, tasks, balance, onubRoles, onubBalance } = c;
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

  // Roles: kits and abilities.
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
  // The main deck, covers, professions and looks (GDD 3.1, 3.9, 3.17).
  checkDecksAndLooks(c, err);

  // Abilities and items refer to each other.
  for (const ab of Object.values(abilities.abilities)) {
    for (const ref of [ab.requires, ab.consumes]) {
      if (ref !== undefined && !isItem(ref)) err(`ability ${ab.id}: unknown item ${ref}`);
    }
    if (ab.scope === 'role' && ab.ships === 'V1' && !cardAbilities.has(ab.id)) {
      err(`ability ${ab.id}: on no role card`);
    }
    // Phase limits, seat targets and night powers (GDD 3.2, 3.3, 3.17).
    if (ab.phases !== undefined && new Set(ab.phases).size !== ab.phases.length) {
      err(`ability ${ab.id}: a phase repeats`);
    }
    if (ab.target === 'seat' && ab.rangeTiles !== undefined)
      err(`ability ${ab.id}: a seat target has no range`);
    if (ab.allowSelf !== undefined && ab.target !== 'seat')
      err(`ability ${ab.id}: allowSelf needs a seat target`);
    if (ab.nightPower === true) {
      if (ab.target !== 'seat') err(`ability ${ab.id}: a night power targets a seat`);
      if (ab.phases === undefined || ab.phases.some((ph) => !NIGHT_PHASES.has(ph))) {
        err(`ability ${ab.id}: a night power works only at dusk, night and the Final Night`);
      }
    }
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
  const prefixes = new Map<string, string>();
  const propIn = (scene: string, prop: string) => scenes[scene]?.props.some((p) => p.id === prop) ?? false;
  for (const [key, scene] of Object.entries(c.scenes)) {
    const where = `scene ${key}`;
    if (key !== scene.id) err(`${where}: file key and id differ`);
    if (scene.zoneId !== scene.id) err(`${where}: zoneId equals sceneId in V1`);
    errors.push(...checkGrid(scene));
    errors.push(...checkSceneWorld(scene));
    if (prefixes.has(scene.prefix))
      err(`${where}: prefix ${scene.prefix} is also ${prefixes.get(scene.prefix)}'s`);
    prefixes.set(scene.prefix, scene.id);
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
    for (const obj of [
      ...scene.spots,
      ...scene.props,
      ...scene.gates,
      ...scene.paths,
      ...(scene.buildings ?? []),
      ...(scene.lights ?? []),
      ...(scene.nodes ?? []),
      ...(scene.spawners ?? []),
      ...(scene.givers ?? []),
    ]) {
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

  // Maps (GDD 3.13).
  errors.push(...checkMaps({ maps: c.maps, scenes: c.scenes, playersMax: balance.players.max }));

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

  // Quick mode (ONUB v2, GDD 3.11): roles, stations and cards, decks, windows and acts.
  checkOnub(onubRoles, onubBalance, err);

  // NPC routines (GDD 3.12): the stations by prop kind and the npc spans.
  checkRoutines(c, err);

  return errors;
}

const NIGHT_PHASES: ReadonlySet<string> = new Set(['dusk', 'night', 'finalNight']);
const BODY_TONES: ReadonlySet<string> = new Set(['ink', 'slate', 'fog', 'bone']);
const ACCENT_TONES: ReadonlySet<string> = new Set(['mustard', 'lantern', 'bone']);
/** The rules fields a profession copies from the class row it `plays` (GDD 3.2). */
const PLAYS_FIELDS = [
  'faction',
  'winsWith',
  'win',
  'parity',
  'goal',
  'startKit',
  'abilities',
  'beware',
  'bellPulls',
] as const;

/**
 * Roles, decks and looks (GDD 3.1, 3.9, 3.17): covers are Cabal or Neutral, each look belongs to one role, a
 * profession copies its class row, every deck row adds up, and every look is drawn for a card some deck deals. Until
 * Session 5G's contract phase an absent `cover` reads as false and an absent `look` as null.
 */
function checkDecksAndLooks(c: Content, err: (msg: string) => void): void {
  const { roles, looks } = c;
  const isCover = (id: string) => roles.roles[id]?.cover === true;
  const lookIdOf = (id: string) => roles.roles[id]?.look ?? null;
  const hasKill = (id: string) => roles.roles[id]?.abilities.includes('kill') === true;

  const lookOwner = new Map<string, string>();
  for (const role of Object.values(roles.roles)) {
    if (role.cover === true && role.faction === 'village')
      err(`role ${role.id}: a cover role is Cabal or Neutral`);
    const look = role.look ?? null;
    if (look !== null) {
      const row = looks.looks[look];
      if (!row) err(`role ${role.id}: unknown look ${look}`);
      else if (row.role !== role.id) err(`role ${role.id}: look ${look} belongs to ${row.role}`);
      const owner = lookOwner.get(look);
      if (owner !== undefined) err(`role ${role.id}: look ${look} is also ${owner}'s`);
      lookOwner.set(look, role.id);
    }
    if (role.plays === undefined) continue;
    const base = roles.roles[role.plays];
    if (!base) {
      err(`role ${role.id}: plays unknown role ${role.plays}`);
      continue;
    }
    if (base.plays !== undefined) err(`role ${role.id}: plays ${base.id}, which plays another row`);
    if ((base.look ?? null) !== null) err(`role ${role.id}: plays ${base.id}, which has a look`);
    for (const field of PLAYS_FIELDS) {
      if (JSON.stringify(role[field]) !== JSON.stringify(base[field])) {
        err(`role ${role.id}: ${field} differs from ${base.id}'s`);
      }
    }
  }
  const classRows = new Set(
    Object.values(roles.roles).flatMap((r) => (r.plays === undefined ? [] : [r.plays])),
  );

  const dealt = new Set<string>();
  for (const n of PLAYER_COUNTS) {
    const { cards, practice } = roles.decks[n];
    const count = Number(n);
    const where = `deck ${n}`;
    if (cards.length !== count + 2) err(`${where}: has ${cards.length} cards, expected ${count + 2}`);
    if (practice !== (count === 4)) err(`${where}: only 4 is a practice party`);
    const seen = new Map<string, number>();
    for (const id of cards) {
      dealt.add(id);
      seen.set(id, (seen.get(id) ?? 0) + 1);
      const role = roles.roles[id];
      if (!role) {
        err(`${where}: unknown role ${id}`);
        continue;
      }
      if (role.ships !== 'V1') err(`${where}: deals unshipped role ${id}`);
      if (lookIdOf(id) === null) err(`${where}: ${id} has no look`);
      if (classRows.has(id)) err(`${where}: lists the class row ${id}`);
    }
    for (const [id, times] of seen) {
      if (times > 1 && !hasKill(id))
        err(`${where}: ${id} appears ${times} times (only a Killer card may repeat)`);
    }
    const killers = cards.filter(hasKill).length;
    if (killers < 1) err(`${where}: no card holds kill`);
    if (killers > count) err(`${where}: ${killers} kill cards for ${count} seats`);
    const covers = cards.filter(isCover).length;
    if (covers > 2) err(`${where}: ${covers} cover cards, at most 2`);
    const plainLooks = cards.filter((id) => !isCover(id)).map(lookIdOf);
    if (new Set(plainLooks).size !== plainLooks.length) err(`${where}: two non-cover cards share a look`);
  }

  for (const [key, look] of Object.entries(looks.looks)) {
    const where = `look ${key}`;
    if (key !== look.id) err(`looks.json: key "${key}" holds look "${look.id}"`);
    if (look.portrait !== `portrait_${look.id}`) err(`${where}: portrait must be portrait_${look.id}`);
    const role = roles.roles[look.role];
    if (!role) {
      err(`${where}: unknown role ${look.role}`);
      continue;
    }
    if ((role.look ?? null) !== look.id) err(`${where}: role ${role.id} has look ${role.look ?? null}`);
    if (look.profession !== (role.plays !== undefined))
      err(`${where}: profession must match ${role.id}'s plays`);
    const cover = role.cover === true;
    const body = cover ? null : `char_${look.id}`;
    const overlay = cover ? null : `ovl_${look.id}`;
    if (look.bodyAtlas !== body) err(`${where}: bodyAtlas must be ${body}`);
    if (look.overlayAtlas !== overlay) err(`${where}: overlayAtlas must be ${overlay}`);
    if (!cover) {
      const { base, second, accent } = look.palette;
      if (!BODY_TONES.has(base) || !BODY_TONES.has(second))
        err(`${where}: body tones from ink, slate, fog, bone`);
      if (!ACCENT_TONES.has(accent)) err(`${where}: accent from mustard, lantern, bone`);
    }
    if (!dealt.has(look.role)) err(`${where}: no deck deals ${look.role} (orphan art)`);
  }
}

/**
 * The NPC routine rules (GDD 3.12, round-5 npc/data.md 2.3): the phase classes split the six world phases, every
 * prop kind of every scene is a station or ignored, each station has a floor tile to stand on, and the `npc` spans
 * and weights of balance.json are sound.
 */
function checkRoutines(c: Content, err: (msg: string) => void): void {
  const { phaseClasses, activities, holds, ignore, lightKinds } = c.routines;

  // Rule 1: each world phase in exactly one class.
  for (const phase of RoutineWorldPhase.options) {
    const inDay = phaseClasses.day.filter((p) => p === phase).length;
    const inNight = phaseClasses.night.filter((p) => p === phase).length;
    if (inDay + inNight === 0) err(`routines.json phaseClasses: ${phase} is in no class`);
    else if (inDay > 0 && inNight > 0) err(`routines.json phaseClasses: ${phase} is in both classes`);
    else if (inDay + inNight > 1) err(`routines.json phaseClasses: ${phase} repeats`);
  }

  // Rule 2: a kind in at most one activity, never in an activity and `ignore` both.
  const stationKinds = new Set<string>();
  const known = new Set<string>();
  for (const [listed, isStation] of [
    ...Object.values(activities).map((a) => [a.kinds, true] as const),
    [ignore, false] as const,
  ]) {
    for (const kind of listed) {
      if (known.has(kind)) err(`routines.json: kind "${kind}" is listed twice`);
      known.add(kind);
      if (isStation) stationKinds.add(kind);
    }
  }

  // Rule 4: `holds` keys are station kinds; `lightKinds` are known kinds.
  for (const kind of Object.keys(holds)) {
    if (!stationKinds.has(kind)) err(`routines.json holds: "${kind}" is not a station kind`);
  }
  for (const kind of lightKinds) {
    if (!known.has(kind)) err(`routines.json lightKinds: "${kind}" is unknown`);
  }

  // Rules 3 and 5: every prop of every scene is classified, and a station has a floor tile at or beside it
  // (orthogonal, since the NPC arrives within 0.8 of the 1.5-tile verb reach, which a diagonal tile misses).
  for (const scene of Object.values(c.scenes)) {
    const floorAt = (x: number, y: number) => {
      const ch = scene.grid[y]?.[x];
      return ch === '.' || ch === 'S';
    };
    for (const prop of scene.props) {
      if (!known.has(prop.kind)) {
        err(`routines.json: prop kind "${prop.kind}" (${prop.id}) is neither a station nor ignored`);
        continue;
      }
      if (!stationKinds.has(prop.kind)) continue;
      const { x, y } = prop;
      const stand = [
        [x, y],
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].some(([a, b]) => floorAt(a as number, b as number));
      if (!stand) err(`scene ${scene.id}: station ${prop.id} has no floor tile next to it`);
    }
  }

  // Rule 6: the npc spans and the routine weights of balance.json.
  const { routine, react, night, vote, ready, nightPower } = c.balance.npc;
  const spans: [string, { min: number; max: number }][] = [
    ['routine.stationDwellS', routine.stationDwellS],
    ['routine.workPauseS', routine.workPauseS],
    ['routine.idleS', routine.idleS],
    ['routine.strollTiles', routine.strollTiles],
    ['routine.sceneDwellS', routine.sceneDwellS],
    ['react.startleS', react.startleS],
    ['react.afterPlacementIdleS', react.afterPlacementIdleS],
    ['night.leaveDelayS', night.leaveDelayS],
    ['vote.windowFrac', vote.windowFrac],
    ['ready.delayS', ready.delayS],
    ['nightPower.windowFrac', nightPower.windowFrac],
    ['nightPower.lastShotS', nightPower.lastShotS],
  ];
  for (const [path, span] of spans) if (span.min > span.max) err(`balance.json npc.${path}: min > max`);
  for (const [cls, row] of Object.entries(routine.weights)) {
    const sum = row.work + row.stroll + row.idle;
    if (Math.abs(sum - 1) > 1e-9) {
      err(`balance.json npc.routine.weights.${cls}: weights sum to ${Number(sum.toFixed(6))}`);
    }
  }
}

export function assertValid(c: Content): void {
  const errors = validateContent(c);
  if (errors.length) throw new Error(`@wdi/content is inconsistent:\n- ${errors.join('\n- ')}`);
}

/** The ONUB v2 cross-file rules: every id a record names exists, decks obey `copies`, windows and acts chain. */
function checkOnub(onubRoles: OnubRolesFile, onubBalance: OnubBalanceFile, err: (msg: string) => void): void {
  const { roles, scenes, teams } = onubRoles;
  const { stations, cards, acts, windows } = onubBalance;
  for (const [key, team] of Object.entries(teams)) {
    if (key !== team.id) err(`roles.onub.json teams: key "${key}" holds team "${team.id}"`);
  }
  for (const [key, scene] of Object.entries(scenes)) {
    if (key !== scene.id) err(`roles.onub.json scenes: key "${key}" holds scene "${scene.id}"`);
  }
  for (const [key, card] of Object.entries(cards)) {
    if (key !== card.id) err(`balance.onub.json cards: key "${key}" holds card "${card.id}"`);
  }

  // Roles.
  const windowRoles = windows.map((w) => w.role);
  for (const role of Object.values(roles)) {
    if (!(role.scene in scenes)) err(`onub role ${role.id}: unknown scene ${role.scene}`);
    if (role.spore && role.team !== 'mold') err(`onub role ${role.id}: a Spore is Team Mold`);
    if (role.sabotages !== (role.team === 'mold')) err(`onub role ${role.id}: sabotages iff Team Mold`);
    if (new Set(role.copies).size !== role.copies.length) err(`onub role ${role.id}: copies repeat`);
    if (role.wakes !== windowRoles.includes(role.id)) {
      err(`onub role ${role.id}: wakes=${role.wakes} but ${role.wakes ? 'has no' : 'has a'} window`);
    }
  }
  if (!Object.values(roles).some((r) => r.spore && r.required)) err('roles.onub.json: no required Spore');

  // Stations and their ingredient cards: each card in exactly one hand, of its own station and kind.
  const stationIds = stations.map((s) => s.id);
  if (new Set(stationIds).size !== stationIds.length) err('balance.onub.json: a station id repeats');
  const listed = new Map<string, number>();
  for (const s of stations) {
    if ((s.underMixBelow === undefined) !== (s.underMixWeight === undefined)) {
      err(`onub station ${s.id}: underMixBelow and underMixWeight go together`);
    }
    for (const [kind, ids] of [
      ['good', s.good],
      ['sabotage', s.sabotage],
    ] as const) {
      for (const id of ids) {
        listed.set(id, (listed.get(id) ?? 0) + 1);
        const card = cards[id];
        if (!card) err(`onub station ${s.id}: unknown card ${id}`);
        else if (card.station !== s.id || card.kind !== kind)
          err(`onub card ${id}: listed as ${s.id} ${kind}`);
      }
    }
  }
  for (const card of Object.values(cards)) {
    if (!stationIds.includes(card.station)) err(`onub card ${card.id}: unknown station ${card.station}`);
    if (listed.get(card.id) !== 1)
      err(`onub card ${card.id}: in ${listed.get(card.id) ?? 0} hands, expected 1`);
  }

  // Default decks: player count + Pantry roles, each role within its copies, every required role present.
  for (const n of PLAYER_COUNTS) {
    const deck = onubBalance.byCount[n].deck;
    const size = Number(n) + onubBalance.pantry.roles;
    if (deck.length !== size) err(`onub ${n}: deck has ${deck.length} cards, expected ${size}`);
    const counts = new Map<string, number>();
    for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, count] of counts) {
      const role = roles[id];
      if (!role) err(`onub ${n}: unknown role ${id}`);
      else if (role.ships !== 'V1') err(`onub ${n}: ${id} does not ship in V1`);
      else if (!role.copies.includes(count))
        err(`onub ${n}: ${count} x ${id}, allowed ${role.copies.join(' or ')}`);
    }
    for (const role of Object.values(roles)) {
      if (role.required && !counts.has(role.id)) err(`onub ${n}: deck lacks ${role.id}`);
    }
  }

  // Windows and acts: one window per waking role in order; every act is reached by a window or a `then`.
  if (new Set(windowRoles).size !== windowRoles.length) err('onub: a role has two night windows');
  const reached = new Set<string>();
  windows.forEach((w, i) => {
    if (w.order !== i + 1) err(`onub window ${w.role}: order ${w.order}, expected ${i + 1}`);
    if (!roles[w.role]) err(`onub window: unknown role ${w.role}`);
    for (const id of w.sees) if (!roles[id]) err(`onub window ${w.role}: sees unknown role ${id}`);
    if (w.onlyIfAlone && !w.seeEachOther) err(`onub window ${w.role}: onlyIfAlone needs seeEachOther`);
    if (w.onTimeout === 'seededPick' && w.acts.length !== 1)
      err(`onub window ${w.role}: a must-act has one act`);
    for (const id of w.acts) {
      const act = acts[id];
      if (!act) err(`onub window ${w.role}: unknown act ${id}`);
      else if (act.effect === 'swapWithPeeked') err(`onub window ${w.role}: ${id} is only a second step`);
      reached.add(id);
    }
  });
  for (const act of Object.values(acts)) {
    if (act.then === undefined) continue;
    const next = acts[act.then];
    if (!next) err(`onub act ${act.id}: unknown then ${act.then}`);
    else if (next.effect !== 'swapWithPeeked' || act.effect !== 'peek')
      err(`onub act ${act.id}: then needs peek -> swapWithPeeked`);
    reached.add(act.then);
  }
  for (const id of Object.keys(acts)) if (!reached.has(id)) err(`onub act ${id}: no window or step uses it`);

  // Ranges and the winners table.
  const winnerIds = onubBalance.winners.map((w) => w.id);
  if (new Set(winnerIds).size !== winnerIds.length) err('balance.onub.json: a winners row id repeats');
  const { npc, timers, targetLengthMin } = onubBalance;
  const ranges: [string, { min: number; max: number }][] = [
    ['npc.commitS', npc.commitS],
    ['npc.actFrac', npc.actFrac],
    ['npc.claimFrac', npc.claimFrac],
    ['npc.voteFrac', npc.voteFrac],
    ['npc.stepS', npc.stepS],
    ['timers.sleeperPulse', { min: timers.sleeperPulseMinS, max: timers.sleeperPulseMaxS }],
    ['timers.crustCountdownS (inside voteS)', { min: timers.crustCountdownS, max: timers.voteS }],
    ['targetLengthMin', targetLengthMin],
  ];
  for (const [name, r] of ranges) if (r.min > r.max) err(`balance.onub.json ${name}: min > max`);
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
