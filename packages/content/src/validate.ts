// Cross-file checks that a single zod schema cannot express: every id a record refers to exists,
// roster and deck rows add up, and every scene grid agrees with its portals, spawns and spots.
import type { AbilitiesFile } from './schemas/abilities.js';
import { PROFILE_RANK, type BalanceFile, type Profile } from './schemas/balance.js';
import { EFFECT_IDS, type EffectsFile } from './schemas/effects.js';
import type { CluesFile } from './schemas/clues.js';
import { PLAYER_COUNTS } from './schemas/common.js';
import type { ItemsFile } from './schemas/items.js';
import type { LooksFile } from './schemas/looks.js';
import type { MetricsFile } from './schemas/metrics.js';
import type { PaletteFile } from './schemas/palette.js';
import type { RolesFile } from './schemas/roles.js';
import { RoutineWorldPhase, type RoutinesFile } from './schemas/routines.js';
import type { CutscenesFile } from './schemas/cutscenes.js';
import type { MusicFile } from './schemas/music.js';
import type { MinigamesFile, MobsFile, QuestsFile, RecipesFile, ResourcesFile } from './schemas/m5b.js';
import type { EventsFile, EvolutionsFile, LawsFile, VendettasFile } from './schemas/bible.js';
import type { RelationsFile } from './schemas/relations.js';
import type { Scene, SceneId } from './schemas/scene.js';
import type { StyleFile } from './schemas/style.js';
import type { TasksFile } from './schemas/tasks.js';
import type { TraitsFile } from './schemas/traits.js';
import { MAP_IDS, type MapFile, type MapId } from './schemas/maps.js';
import { checkMaps, checkSceneWorld } from './validateWorld.js';
import { checkVendettas } from './validateVendettas.js';
import type { EconomyFile } from './schemas/economy.js';
import { checkEconomy } from './validateEconomy.js';
import { checkRelations } from './validateRelations.js';
import type { LoreFile } from './schemas/lore.js';
import { checkLore } from './validateLore.js';
import type { TalkFile } from './schemas/talk.js';
import { checkTalk } from './validateTalk.js';
import { classesOfProp, type InteractionsFile } from './schemas/interactions.js';
import { checkInteractions } from './validateInteractions.js';

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
  looks: LooksFile;
  routines: RoutinesFile;
  // Round 6 (docs/round6/seams.md 1.2), empty until their sessions fill them.
  cutscenes: CutscenesFile;
  music: MusicFile;
  resources: ResourcesFile;
  recipes: RecipesFile;
  mobs: MobsFile;
  quests: QuestsFile;
  minigames: MinigamesFile;
  vendettas: VendettasFile;
  evolutions: EvolutionsFile;
  laws: LawsFile;
  events: EventsFile;
  /** Round 8 (GDD 3.22): the effects table (Session 8A). */
  effects: EffectsFile;
  // Round 8 (GDD 3.23).
  economy: EconomyFile;
  // Round 8 (GDD 3.22), Session 8B.
  relations: RelationsFile;
  // Round 8 (GDD 3.26), 7M.
  lore: LoreFile;
  /** Round 9 (GDD 3.25, N2): the NPC seats' meeting-note lines. */
  talk: TalkFile;
  /** Round 10 (A9; GDD 3.14): the logic table. */
  interactions: InteractionsFile;
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
  const { roles, abilities, items, clues, tasks, balance } = c;
  const scenes: Record<string, Scene | undefined> = c.scenes;

  keyedById('roles.json', roles.roles, errors);
  keyedById('abilities.json', abilities.abilities, errors);
  keyedById('items.json', items.items, errors);
  keyedById('clues.json', clues.clues, errors);
  keyedById('tasks.json', tasks.tasks, errors);

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

  // Round 8 (8L, GDD 3.8): votes open before the shortest discussion ends.
  const shortest = Math.min(...Object.values(balance.byCount).map((row) => row.discussionS));
  if (balance.meeting.minVoteS >= shortest)
    err(
      `balance meeting.minVoteS ${balance.meeting.minVoteS} is not under the shortest discussion, ${shortest} s`,
    );

  // NPC routines (GDD 3.12): the stations by prop kind and the npc spans.
  checkRoutines(c, err);

  // Round 6 (GDD 3.14 to 3.16, 3.18): the M5b cross-references, the cutscene index and the music mapping.
  checkM5b(c, err);
  // Round 7 (GDD 3.20): the vendettas' cards, maps and kinds.
  checkVendettas(c, err);
  // Round 8 (GDD 3.23): the economy's props, items, looks and curfew scenes.
  checkEconomy(c, err);
  checkStakes(c, err);
  // Round 8 (GDD 3.22): the relations table's sides and the inspect bands.
  checkRelations(c, err);
  checkShops(c, err);
  // Round 8 (GDD 3.26): the shelf reader's books, letters, ledgers and clippings.
  checkLore(c, err);
  checkTalk(c, err);
  // Round 10 (A9; GDD 3.14): the logic table's classes and the census of every prop.
  checkInteractions(c, err);

  return errors;
}

/**
 * Round 6 (docs/round6/m5b-data.md 1, cutscene-music.md 1.1 and 3; GDD 3.14 to 3.16). Session 6E's M5b checks: every
 * resource is a `material` item and every material a resource, a resource's `tool` is an item, every
 * `scene.nodes[].resource` names a resource; a recipe's `out` and `in[].item` are items, its `station` a
 * `routines.json` station kind, and every recipe is craftable on every map at every party profile from what the open
 * scenes' nodes yield and their stations offer (`reachable`); every spawner names a mob, the wolf keeps GDD 3.6's light radius, and no scene
 * has more spawners than `mobs.maxPerScene`; every giver names a quest npc, every npc stands once and gives a quest, a quest
 * wants what its map can have and rewards V1 items, and every fetch task has one mini-game. Session 6J
 * adds: every index entry of `cutscenes` names a cutscene of the right kind, every `openings` key a map. Session 6L
 * adds: every `music.byMap` key is a map (the playlist ids are checked against the client manifest by a client test).
 */
function checkM5b(c: Content, err: (msg: string) => void): void {
  const { resources, recipes, mobs, quests, minigames, cutscenes, items } = c;
  for (const [file, map] of [
    ['resources.json', resources.resources],
    ['recipes.json', recipes.recipes],
    ['mobs.json', mobs.mobs],
    ['quests.json', quests.quests],
    ['quests.json npcs', quests.npcs],
    ['minigames.json', minigames.minigames],
    ['cutscenes.json', cutscenes.cutscenes],
  ] as const) {
    for (const [key, record] of Object.entries(map)) {
      if (key !== record.id) err(`${file}: key "${key}" holds record with id "${record.id}"`);
    }
  }

  const isItem = (id: string) => Object.hasOwn(items.items, id);
  for (const r of Object.values(resources.resources)) {
    if (items.items[r.id]?.kind !== 'material') err(`resources.json: ${r.id} is not a material item`);
    if (r.tool !== undefined && !isItem(r.tool)) err(`resources.json: ${r.id} needs unknown tool ${r.tool}`);
  }
  for (const item of Object.values(items.items)) {
    if (item.kind === 'material' && !Object.hasOwn(resources.resources, item.id)) {
      err(`items.json: material ${item.id} is no resource`);
    }
  }
  for (const scene of Object.values(c.scenes)) {
    for (const n of scene.nodes ?? []) {
      if (!Object.hasOwn(resources.resources, n.resource)) {
        err(`scene ${scene.id}: node ${n.id} unknown resource ${n.resource}`);
      }
    }
  }

  const stationKinds = new Set(Object.values(c.routines.activities).flatMap((a) => a.kinds));
  for (const r of Object.values(recipes.recipes)) {
    const where = `recipes.json ${r.id}`;
    if (!isItem(r.out)) err(`${where}: unknown out ${r.out}`);
    else if (items.items[r.out]!.kind === 'material') err(`${where}: makes material ${r.out}`);
    for (const input of r.in) if (!isItem(input.item)) err(`${where}: unknown input ${input.item}`);
    for (const m of r.maps ?? []) if (!Object.hasOwn(c.maps, m)) err(`${where}: unknown map ${m}`);
    if (r.station !== null && !stationKinds.has(r.station))
      err(`${where}: station ${r.station} is no station kind`);
  }

  // Mobs (GDD 3.15): the wolf row keeps 3.6's light rule, and a scene spawns no more than `mobs.maxPerScene`.
  const wolf = mobs.mobs.wolf;
  if (wolf === undefined || !wolf.kills) err('mobs.json: the wolf must exist and kill (GDD 3.6)');
  else if (wolf.fleeLightTiles !== c.balance.wolves.fleeLightTiles) {
    err('mobs.json: wolf fleeLightTiles differs from balance.wolves.fleeLightTiles');
  }
  for (const scene of Object.values(c.scenes)) {
    const spawners = scene.spawners ?? [];
    for (const sp of spawners) {
      if (!Object.hasOwn(mobs.mobs, sp.mob)) err(`scene ${scene.id}: spawner ${sp.id} unknown mob ${sp.mob}`);
    }
    if (spawners.length > c.balance.mobs.maxPerScene) {
      err(`scene ${scene.id}: ${spawners.length} spawners, above mobs.maxPerScene`);
    }
  }
  // Round 8 (GDD 3.22, Session 8A): every effect row keyed by its id and every id present; each cure is an item or
  // `food`; each effect a damage row, a creature or another effect names exists; the body's thresholds are sound.
  const effectRows = c.effects.effects;
  for (const [key, row] of Object.entries(effectRows)) {
    if (key !== row.id) err(`effects.json: key "${key}" holds record with id "${row.id}"`);
  }
  for (const id of EFFECT_IDS) if (!Object.hasOwn(effectRows, id)) err(`effects.json: missing row ${id}`);
  for (const effect of Object.values(effectRows)) {
    for (const cure of effect.cures) {
      if (cure !== 'food' && !Object.hasOwn(items.items, cure))
        err(`effects.json: ${effect.id} cured by unknown item ${cure}`);
    }
    for (const applied of Object.keys(effect.applies ?? {})) {
      if (!Object.hasOwn(effectRows, applied))
        err(`effects.json: ${effect.id} applies unknown effect ${applied}`);
    }
  }
  for (const item of Object.values(items.items)) {
    if (item.buff !== undefined && !effectRows[item.buff as keyof typeof effectRows]?.dish)
      err(`items.json ${item.id}: buff ${item.buff} is no dish buff`);
  }
  for (const item of Object.values(items.items)) {
    if ((item.kind === 'armour') !== (item.armor !== undefined))
      err(`items.json ${item.id}: kind armour and an armor block go together`);
    if (item.armor && item.equip !== 'body' && item.equip !== 'head')
      err(`items.json ${item.id}: armour is worn on the body or the head`);
    else if (item.armor && item.armor.tier > c.balance.armor.tierMult[item.equip as 'body' | 'head'].length)
      err(`items.json ${item.id}: no armor.tierMult for its tier`);
  }
  const checkDamageEffects = (where: string, row: { effects: Record<string, number> }) => {
    for (const id of Object.keys(row.effects)) {
      if (!Object.hasOwn(effectRows, id)) err(`${where}: applies unknown effect ${id}`);
    }
  };
  for (const [id, row] of Object.entries(c.balance.body.damage))
    checkDamageEffects(`balance.json body.damage.${id}`, row);
  for (const mob of Object.values(mobs.mobs)) checkDamageEffects(`mobs.json ${mob.id}`, mob);
  const body = c.balance.body;
  if (body.koWakeHp >= body.maxHp) err('balance.json body.koWakeHp: must be under maxHp');
  if (body.woundedBelow >= body.maxHp) err('balance.json body.woundedBelow: must be under maxHp');
  if (body.fatigueRecover > body.maxStamina)
    err('balance.json body.fatigueRecover: must be at most maxStamina');
  if (body.strikeStamina > body.maxStamina)
    err('balance.json body.strikeStamina: must be at most maxStamina');

  // Per map and per party profile: a small party must be able to make every tool from the scenes open to it.
  const inHand = new Map<string, Set<string>>();
  for (const map of Object.values(c.maps)) {
    for (const [profile, rank] of Object.entries(PROFILE_RANK)) {
      const open = map.scenes
        .flatMap((id) => c.scenes[id] ?? [])
        .filter((s) => PROFILE_RANK[s.profile] <= rank);
      const reach = reachable(c, open);
      inHand.set(`${map.id}/${profile}`, reach.have);
      for (const [id, recipe] of Object.entries(recipes.recipes)) {
        if (recipe.maps && !recipe.maps.includes(map.id)) continue;
        if (!reach.made.has(id))
          err(`map ${map.id} (${profile}): recipe ${id} cannot be crafted from its nodes`);
      }
    }
  }

  // Quests and mini-games (GDD 3.16): each npc stands once and wants what the scenes open with its own scene can
  // yield or make; rewards ship in V1.
  // A giver wears the villager family, never a card's look (3.16 "Givers"; round 9, N1).
  const villagers = new Set(Object.keys(c.looks.villagers));
  const standsOn = new Map<string, string>();
  for (const map of Object.values(c.maps)) {
    for (const sceneId of map.scenes) {
      for (const g of c.scenes[sceneId]?.givers ?? []) {
        if (!Object.hasOwn(quests.npcs, g.npc)) err(`scene ${sceneId}: giver ${g.id} unknown npc ${g.npc}`);
        else if (standsOn.has(g.npc)) err(`quests.json: npc ${g.npc} stands in two places`);
        standsOn.set(g.npc, `${map.id}/${c.scenes[sceneId]!.profile}`);
      }
    }
  }
  for (const npc of Object.values(quests.npcs)) {
    if (!standsOn.has(npc.id)) err(`quests.json: npc ${npc.id} stands nowhere`);
    if (!villagers.has(npc.look))
      err(`quests.json: npc ${npc.id} look ${npc.look} is not of the villager family`);
    if (!Object.values(quests.quests).some((q) => q.giver === npc.id))
      err(`quests.json: npc ${npc.id} gives nothing`);
  }
  for (const q of Object.values(quests.quests)) {
    const where = `quests.json ${q.id}`;
    if (q.kind === 'contract') err(`${where}: contract quests wait for round 7`);
    if (!Object.hasOwn(quests.npcs, q.giver)) err(`${where}: unknown giver ${q.giver}`);
    const have = inHand.get(standsOn.get(q.giver) ?? '');
    for (const w of q.wants) {
      if (!isItem(w.item)) err(`${where}: wants unknown item ${w.item}`);
      else if (have !== undefined && !have.has(w.item))
        err(`${where}: wants ${w.item}, not to be had on its map`);
    }
    for (const r of q.reward) {
      if (!isItem(r.item)) err(`${where}: rewards unknown item ${r.item}`);
      else if (items.items[r.item]!.ships !== 'V1') err(`${where}: rewards unshipped ${r.item}`);
    }
  }
  const played = new Set<string>();
  for (const m of Object.values(minigames.minigames)) {
    const task = c.tasks.tasks[m.task];
    if (task?.kind !== 'fetch') err(`minigames.json ${m.id}: task ${m.task} is no fetch task`);
    if (played.has(m.task)) err(`minigames.json ${m.id}: task ${m.task} has two mini-games`);
    played.add(m.task);
  }
  for (const task of Object.values(c.tasks.tasks)) {
    if (task.kind === 'fetch' && !played.has(task.id))
      err(`tasks.json: fetch task ${task.id} has no mini-game`);
  }
  checkCutscenes(c, err);
}

/** The cutscene index and steps (GDD 3.18): kinds, map ids, scene and tile references, and the openings' lengths. */
function checkCutscenes(c: Content, err: (msg: string) => void): void {
  const { cutscenes, scenes, balance } = c;
  const named = (what: string, id: string, kind: string): void => {
    const cs = cutscenes.cutscenes[id];
    if (!cs) err(`cutscenes.json: ${what} names unknown cutscene "${id}"`);
    else if (cs.kind !== kind)
      err(`cutscenes.json: ${what} names "${id}" of kind ${cs.kind}, expected ${kind}`);
  };
  for (const [cause, id] of Object.entries(cutscenes.deaths)) named(`deaths.${cause}`, id, 'death');
  for (const [map, id] of Object.entries(cutscenes.openings)) {
    if (!(MAP_IDS as readonly string[]).includes(map))
      err(`cutscenes.json: openings key "${map}" is not a map`);
    named(`openings.${map}`, id, 'opening');
    const cs = cutscenes.cutscenes[id];
    if (cs && cs.maxS > balance.phases.openingS) {
      err(
        `cutscenes.json: opening "${id}" runs ${cs.maxS} s, longer than phases.openingS ${balance.phases.openingS}`,
      );
    }
    // Round 7 (7A, A101): grace grows by `maxS`, and the steps fill it, so the opening runs as long as its track
    // (which the client's MusicDirector.test.ts checks against the music manifest).
    const run = cs ? mainTrackS(cs) : 0;
    if (cs && Math.abs(run - cs.maxS) > 1) {
      err(`cutscenes.json: opening "${id}" steps run ${run} s, not its maxS ${cs.maxS}`);
    }
  }
  for (const cs of Object.values(cutscenes.cutscenes)) {
    const mainTrack = mainTrackS(cs);
    for (const step of cs.steps) {
      const where = `cutscenes.json ${cs.id}`;
      if (step.t === 'camera' || step.t === 'vfx') {
        const scene = (scenes as Record<string, Scene | undefined>)[step.sceneId];
        if (!scene) {
          err(`${where}: ${step.t} step names unknown scene ${step.sceneId}`);
          continue;
        }
        const tiles = step.t === 'camera' ? [step.from, step.to] : [step.at];
        for (const t of tiles) {
          if (t.x >= scene.size.w || t.y >= scene.size.h)
            err(`${where}: tile ${t.x},${t.y} is outside ${step.sceneId}`);
        }
      }
      if (step.t === 'cardSlam' && cs.kind !== 'opening') err(`${where}: cardSlam belongs to an opening`);
      if (step.t === 'hold' && cs.kind !== 'death') err(`${where}: hold belongs to a death cutscene`);
      if (step.t === 'video' && cs.kind !== 'memorial') err(`${where}: video belongs to a memorial`);
    }
    if (mainTrack > cs.maxS) err(`cutscenes.json ${cs.id}: steps run ${mainTrack} s, over maxS ${cs.maxS}`);
  }
}

/** Seconds of a cutscene's main track: the steps that do not start with the one before them. */
function mainTrackS(cs: Content['cutscenes']['cutscenes'][string]): number {
  let s = 0;
  for (const step of cs.steps)
    if (!('withPrevious' in step && step.withPrevious) && 'durationS' in step) s += step.durationS;
  return s;
}

/**
 * What can be had in these scenes: start from the resources their nodes yield (a resource whose `tool` is not yet in
 * hand waits for it), add every recipe whose station stands in the scenes and whose inputs are in hand, and repeat
 * until nothing changes. `made` holds recipe ids, `have` item ids.
 */
function reachable(c: Content, scenes: readonly Scene[]): { made: Set<string>; have: Set<string> } {
  const nodeResources = new Set(scenes.flatMap((s) => (s.nodes ?? []).map((n) => n.resource)));
  const propKinds = new Set(scenes.flatMap((s) => s.props.map((p) => p.kind)));
  // A shop in an open scene sells its stock: Flour comes from the bakery's counter (round 10, D4a).
  const propIds = new Set(scenes.flatMap((s) => s.props.map((p) => p.id)));
  const stock = new Set<string>(
    Object.values(c.economy.shops).flatMap((s) => (propIds.has(s.prop) ? s.sells : [])),
  );
  const have = new Set<string>();
  const made = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const id of nodeResources) {
      const tool = c.resources.resources[id]?.tool;
      if (!have.has(id) && (tool === undefined || have.has(tool))) {
        have.add(id);
        grew = true;
      }
    }
    for (const r of Object.values(c.recipes.recipes)) {
      if (made.has(r.id) || (r.station !== null && !propKinds.has(r.station))) continue;
      if (r.in.every((input) => have.has(input.item) || stock.has(input.item))) {
        made.add(r.id);
        have.add(r.out);
        grew = true;
      }
    }
  }
  return { made, have };
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

  // Round 10, B1 (GDD 3.17): a figure look is its own, never a card's or the villager family's; a townsfolk row
  // wears a villager look or a figure look, never a card's.
  const figures = looks.figures ?? {};
  for (const [key, look] of Object.entries(figures)) {
    if (key !== look.id) err(`looks.json figures: key "${key}" holds look "${look.id}"`);
    if (key in looks.looks || key in looks.villagers) err(`looks.json figures: "${key}" is already a look`);
    if (look.bodyAtlas !== `char_${key}` || look.overlayAtlas !== `ovl_${key}`)
      err(`looks.json figures: ${key}'s atlases must be char_${key} and ovl_${key}`);
  }
  for (const [kind, row] of Object.entries(c.routines.townsfolk)) {
    if (!(row.look in looks.villagers) && !(row.look in figures))
      err(`routines.json townsfolk ${kind}: look ${row.look} is neither a villager nor a figure look`);
    if (row.count !== undefined && !row.named)
      err(`routines.json townsfolk ${kind}: count needs a named row`);
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
      // Round 10 (D1): a prop whose class is a station is one, whatever its kind.
      const [cls] = classesOfProp(c.interactions, prop);
      const station = stationKinds.has(prop.kind) || (cls !== undefined && stationKinds.has(cls));
      if (!station && !known.has(prop.kind)) {
        err(`routines.json: prop kind "${prop.kind}" (${prop.id}) is neither a station nor ignored`);
        continue;
      }
      if (!station) continue;
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

  // Round 7 (GDD 3.21): the party numbers are positive; the profile code is not shorter than a join code.
  const { party, lobby } = c.balance;
  for (const [key, value] of Object.entries(party)) {
    if (typeof value === 'number' && value <= 0) err(`balance.json party.${key}: must be positive`);
  }
  if (party.profileCodeLength < lobby.codeLength) {
    err('balance.json party.profileCodeLength: must be at least lobby.codeLength');
  }

  // Round 8 (GDD 3.3): the trial's discussion is longer than every ordinary meeting's.
  const longest = Math.max(...Object.values(c.balance.byCount).map((row) => row.discussionS));
  if (c.balance.finalNight.trialS <= longest) {
    err(`balance.json finalNight.trialS: must be longer than the longest discussion (${longest} s)`);
  }

  // Rule 6: the npc spans and the routine weights of balance.json.
  const { routine, react, night, vote, ready, nightPower, aloneKill } = c.balance.npc;
  if (aloneKill.afterS <= 0) err('balance.json npc.aloneKill.afterS: must be positive');
  if (aloneKill.sightTiles <= 0) err('balance.json npc.aloneKill.sightTiles: must be positive');
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

/**
 * Round 8 (GDD 3.23, 8C): the starting stake is card-blind. It follows a look a card shows in the world, never a
 * cover card's own, every tier is worn by some look (so a cover can carry it), and every tier lies on one side of
 * `economy.heavyPurse`, so the purse band at Start says the look's tier and nothing more.
 */
function checkStakes(c: Content, err: (msg: string) => void): void {
  const { stakes } = c.economy;
  const heavy = c.balance.economy.heavyPurse;
  const coverLooks = new Set(
    Object.values(c.roles.roles)
      .filter((r) => r.cover)
      .map((r) => r.look),
  );
  const worn = new Set(Object.values(stakes.byLook));
  if (!stakes.tiers[stakes.default]) err(`economy.json: stakes.default "${stakes.default}" is not a tier`);
  for (const [look, tier] of Object.entries(stakes.byLook)) {
    if (!c.looks.looks[look]) err(`economy.json: stakes.byLook "${look}" is not a look`);
    if (coverLooks.has(look)) err(`economy.json: stakes.byLook "${look}" is a cover card's look`);
    if (!stakes.tiers[tier]) err(`economy.json: stakes.byLook "${look}" names no tier "${tier}"`);
  }
  for (const [id, t] of Object.entries(stakes.tiers)) {
    if (!worn.has(id)) err(`economy.json: stake tier "${id}" is worn by no look`);
    if (t.min < heavy && t.max >= heavy)
      err(`economy.json: stake tier "${id}" straddles balance economy.heavyPurse`);
  }
}

/**
 * Round 8 (GDD 3.23, 8C): a shop is one `counter` static named `<prefix>.shop_<tail>`. Until 8J and 8K place a row its
 * prefix must still name a scene; once placed it must be a `counter`, and every `counter` belongs to one shop. A shop
 * trades only items that drop (never a role's kit) at a price it names, and pays less than it asks.
 */
function checkShops(c: Content, err: (msg: string) => void): void {
  const { shops, prices } = c.economy;
  const byPrefix = new Map(Object.values(c.scenes).map((s) => [s.prefix, s]));
  const owner = new Map<string, string>();
  const used = new Set<string>();
  for (const [id, shop] of Object.entries(shops)) {
    const [prefix, tail] = shop.prop.split('.') as [string, string];
    const scene = byPrefix.get(prefix);
    if (!scene) err(`economy.json: shop ${id} prop ${shop.prop} names no scene prefix`);
    if (!tail.startsWith('shop_')) err(`economy.json: shop ${id} prop ${shop.prop} lacks the shop_ tail`);
    const placed = scene?.props.find((p) => p.id === shop.prop);
    if (placed && placed.kind !== 'counter')
      err(`economy.json: shop ${id} prop ${shop.prop} is not a counter`);
    if (owner.has(shop.prop)) err(`economy.json: shops ${owner.get(shop.prop)} and ${id} share ${shop.prop}`);
    owner.set(shop.prop, id);
    for (const [list, side] of [
      [shop.sells, 'ask'],
      [shop.buys, 'pay'],
    ] as const) {
      for (const item of list) {
        used.add(item);
        const def = c.items.items[item];
        if (!def) err(`economy.json: shop ${id} trades unknown item ${item}`);
        else if (def.roleBound) err(`economy.json: shop ${id} trades role-bound ${item}`);
        if (prices[item]?.[side] === undefined)
          err(`economy.json: shop ${id} trades ${item} with no ${side}`);
      }
    }
  }
  for (const item of Object.keys(prices))
    if (!used.has(item)) err(`economy.json: price for ${item}, which no shop trades`);
  for (const scene of Object.values(c.scenes))
    for (const p of scene.props) {
      if (p.kind === 'counter' && !owner.has(p.id))
        err(`scene ${scene.id}: counter ${p.id} belongs to no shop`);
      if (p.kind === 'bank' && !p.id.startsWith(`${scene.prefix}.bank_`))
        err(`scene ${scene.id}: bank ${p.id} lacks the bank_ tail`);
    }
}
