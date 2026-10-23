// @wdi/content: every roster, number and scene id of docs/GDD.md and docs/WORLD.md as typed,
// validated data. Importing this module parses every JSON file with its zod schema and runs the
// cross-file checks in validate.ts; any problem throws at import, so a bad edit cannot ship.
import paletteJson from '../data/palette.json' with { type: 'json' };
import metricsJson from '../data/metrics.json' with { type: 'json' };
import styleJson from '../data/style.json' with { type: 'json' };
import traitsJson from '../data/traits.json' with { type: 'json' };
import rolesJson from '../data/roles.json' with { type: 'json' };
import abilitiesJson from '../data/abilities.json' with { type: 'json' };
import itemsJson from '../data/items.json' with { type: 'json' };
import cluesJson from '../data/clues.json' with { type: 'json' };
import tasksJson from '../data/tasks.json' with { type: 'json' };
import balanceJson from '../data/balance.json' with { type: 'json' };
import looksJson from '../data/looks.json' with { type: 'json' };
import routinesJson from '../data/routines.json' with { type: 'json' };
// Round 6 (docs/round6/seams.md 1.2): pre-seeded empty; 6E, 6J and 6L fill them, rounds 7 to 9 the Bible's four.
import cutscenesJson from '../data/cutscenes/cutscenes.json' with { type: 'json' };
import musicJson from '../data/music.json' with { type: 'json' };
import resourcesJson from '../data/resources.json' with { type: 'json' };
import recipesJson from '../data/recipes.json' with { type: 'json' };
import mobsJson from '../data/mobs.json' with { type: 'json' };
import questsJson from '../data/quests.json' with { type: 'json' };
import minigamesJson from '../data/minigames.json' with { type: 'json' };
import vendettasJson from '../data/vendettas.json' with { type: 'json' };
// Round 8 (GDD 3.22 "Inspect"), Session 8B.
import relationsJson from '../data/relations.json' with { type: 'json' };
import evolutionsJson from '../data/evolutions.json' with { type: 'json' };
import lawsJson from '../data/laws.json' with { type: 'json' };
import eventsJson from '../data/events.json' with { type: 'json' };
import economyJson from '../data/economy.json' with { type: 'json' };
import overworldJson from '../data/scenes/overworld.json' with { type: 'json' };
import tavernBarJson from '../data/scenes/tavern_bar.json' with { type: 'json' };
import tavernBackJson from '../data/scenes/tavern_back.json' with { type: 'json' };
import apothShopJson from '../data/scenes/apoth_shop.json' with { type: 'json' };
import apothLoftJson from '../data/scenes/apoth_loft.json' with { type: 'json' };
import widowParlourJson from '../data/scenes/widow_parlour.json' with { type: 'json' };
import widowBedroomJson from '../data/scenes/widow_bedroom.json' with { type: 'json' };
import forestJson from '../data/scenes/forest.json' with { type: 'json' };
import bakeryJson from '../data/scenes/bakery.json' with { type: 'json' };
import caveEntryJson from '../data/scenes/cave_entry.json' with { type: 'json' };
import manorHallJson from '../data/scenes/manor_hall.json' with { type: 'json' };
import manorUpperJson from '../data/scenes/manor_upper.json' with { type: 'json' };
import barnJson from '../data/scenes/barn.json' with { type: 'json' };
import chapelJson from '../data/scenes/chapel.json' with { type: 'json' };
import cellarJson from '../data/scenes/cellar.json' with { type: 'json' };
import forestDeepJson from '../data/scenes/forest_deep.json' with { type: 'json' };
import caveGalleryJson from '../data/scenes/cave_gallery.json' with { type: 'json' };
import bpCampJson from '../data/scenes/bp_camp.json' with { type: 'json' };
import bpLodgeJson from '../data/scenes/bp_lodge.json' with { type: 'json' };
import bpMillJson from '../data/scenes/bp_mill.json' with { type: 'json' };
import bpWoodsJson from '../data/scenes/bp_woods.json' with { type: 'json' };
import bpMineJson from '../data/scenes/bp_mine.json' with { type: 'json' };
import bpOfficeJson from '../data/scenes/bp_office.json' with { type: 'json' };
import bpSmithyJson from '../data/scenes/bp_smithy.json' with { type: 'json' };
import bpDeepJson from '../data/scenes/bp_deep.json' with { type: 'json' };
import crumbColdJson from '../data/scenes/crumb_cold.json' with { type: 'json' };
import crumbMixingJson from '../data/scenes/crumb_mixing.json' with { type: 'json' };
import crumbOvenJson from '../data/scenes/crumb_oven.json' with { type: 'json' };
import crumbProofingJson from '../data/scenes/crumb_proofing.json' with { type: 'json' };
import hollowmereJson from '../data/maps/hollowmere.json' with { type: 'json' };
import blackpineJson from '../data/maps/blackpine.json' with { type: 'json' };

import { AbilitiesFile } from './schemas/abilities.js';
import { BalanceFile, type BalanceRow, type Profile } from './schemas/balance.js';
import { CluesFile } from './schemas/clues.js';
import { ItemsFile } from './schemas/items.js';
import { LooksFile, type Look } from './schemas/looks.js';
import { MetricsFile } from './schemas/metrics.js';
import { PaletteFile } from './schemas/palette.js';
import { RolesFile, type DeckRow } from './schemas/roles.js';
import { RoutinesFile } from './schemas/routines.js';
import { CutscenesFile } from './schemas/cutscenes.js';
import { MusicFile } from './schemas/music.js';
import { MinigamesFile, MobsFile, QuestsFile, RecipesFile, ResourcesFile } from './schemas/m5b.js';
import { EventsFile, EvolutionsFile, LawsFile, VendettasFile } from './schemas/bible.js';
import { EconomyFile } from './schemas/economy.js';
import { RelationsFile } from './schemas/relations.js';
import { SCENE_IDS, Scene, type SceneId } from './schemas/scene.js';
import { StyleFile } from './schemas/style.js';
import { TasksFile } from './schemas/tasks.js';
import { TraitsFile } from './schemas/traits.js';
import { DEFAULT_MAP, MAP_IDS, MapFile, type MapId } from './schemas/maps.js';
import { assertValid, type Content } from './validate.js';

export * from './schemas/common.js';
export * from './schemas/palette.js';
export * from './schemas/metrics.js';
export * from './schemas/style.js';
export * from './schemas/traits.js';
export * from './schemas/roles.js';
export * from './schemas/abilities.js';
export * from './schemas/items.js';
export * from './schemas/looks.js';
export * from './schemas/clues.js';
export * from './schemas/tasks.js';
export * from './schemas/balance.js';
export * from './schemas/scene.js';
export * from './schemas/maps.js';
export * from './schemas/routines.js';
export * from './schemas/cutscenes.js';
export * from './schemas/music.js';
export * from './schemas/m5b.js';
export * from './schemas/bible.js';
export * from './schemas/economy.js';
export * from './schemas/relations.js';
export { validateContent, type Content } from './validate.js';
export { navs, NavFile } from './nav.js';

const sceneJson: Record<SceneId, unknown> = {
  overworld: overworldJson,
  tavern_bar: tavernBarJson,
  tavern_back: tavernBackJson,
  apoth_shop: apothShopJson,
  apoth_loft: apothLoftJson,
  widow_parlour: widowParlourJson,
  widow_bedroom: widowBedroomJson,
  forest: forestJson,
  bakery: bakeryJson,
  cave_entry: caveEntryJson,
  manor_hall: manorHallJson,
  manor_upper: manorUpperJson,
  barn: barnJson,
  chapel: chapelJson,
  cellar: cellarJson,
  forest_deep: forestDeepJson,
  cave_gallery: caveGalleryJson,
  bp_camp: bpCampJson,
  bp_lodge: bpLodgeJson,
  bp_mill: bpMillJson,
  bp_woods: bpWoodsJson,
  bp_mine: bpMineJson,
  bp_office: bpOfficeJson,
  bp_smithy: bpSmithyJson,
  bp_deep: bpDeepJson,
  crumb_cold: crumbColdJson,
  crumb_mixing: crumbMixingJson,
  crumb_oven: crumbOvenJson,
  crumb_proofing: crumbProofingJson,
};

const mapJson: Record<MapId, unknown> = {
  hollowmere: hollowmereJson,
  blackpine: blackpineJson,
};

function parseMaps(): Record<MapId, MapFile> {
  const out = {} as Record<MapId, MapFile>;
  for (const id of MAP_IDS) out[id] = MapFile.parse(mapJson[id]);
  return out;
}

function parseScenes(): Record<SceneId, Scene> {
  const out = {} as Record<SceneId, Scene>;
  for (const id of SCENE_IDS) out[id] = Scene.parse(sceneJson[id]);
  return out;
}

/** Parses every raw file; exported so tests can feed it broken copies. */
export function parseContent(raw: {
  palette: unknown;
  metrics: unknown;
  style: unknown;
  traits: unknown;
  roles: unknown;
  abilities: unknown;
  items: unknown;
  clues: unknown;
  tasks: unknown;
  balance: unknown;
  looks: unknown;
  routines: unknown;
  cutscenes: unknown;
  music: unknown;
  resources: unknown;
  recipes: unknown;
  mobs: unknown;
  quests: unknown;
  minigames: unknown;
  vendettas: unknown;
  evolutions: unknown;
  laws: unknown;
  events: unknown;
  economy: unknown;
  relations: unknown;
}): Omit<Content, 'scenes' | 'maps'> {
  return {
    palette: PaletteFile.parse(raw.palette),
    metrics: MetricsFile.parse(raw.metrics),
    style: StyleFile.parse(raw.style),
    traits: TraitsFile.parse(raw.traits),
    roles: RolesFile.parse(raw.roles),
    abilities: AbilitiesFile.parse(raw.abilities),
    items: ItemsFile.parse(raw.items),
    clues: CluesFile.parse(raw.clues),
    tasks: TasksFile.parse(raw.tasks),
    balance: BalanceFile.parse(raw.balance),
    looks: LooksFile.parse(raw.looks),
    routines: RoutinesFile.parse(raw.routines),
    cutscenes: CutscenesFile.parse(raw.cutscenes),
    music: MusicFile.parse(raw.music),
    resources: ResourcesFile.parse(raw.resources),
    recipes: RecipesFile.parse(raw.recipes),
    mobs: MobsFile.parse(raw.mobs),
    quests: QuestsFile.parse(raw.quests),
    minigames: MinigamesFile.parse(raw.minigames),
    vendettas: VendettasFile.parse(raw.vendettas),
    evolutions: EvolutionsFile.parse(raw.evolutions),
    laws: LawsFile.parse(raw.laws),
    events: EventsFile.parse(raw.events),
    economy: EconomyFile.parse(raw.economy),
    relations: RelationsFile.parse(raw.relations),
  };
}

export const content: Content = {
  ...parseContent({
    palette: paletteJson,
    metrics: metricsJson,
    style: styleJson,
    traits: traitsJson,
    roles: rolesJson,
    abilities: abilitiesJson,
    items: itemsJson,
    clues: cluesJson,
    tasks: tasksJson,
    balance: balanceJson,
    looks: looksJson,
    routines: routinesJson,
    cutscenes: cutscenesJson,
    music: musicJson,
    resources: resourcesJson,
    recipes: recipesJson,
    mobs: mobsJson,
    quests: questsJson,
    minigames: minigamesJson,
    vendettas: vendettasJson,
    evolutions: evolutionsJson,
    laws: lawsJson,
    events: eventsJson,
    economy: economyJson,
    relations: relationsJson,
  }),
  scenes: parseScenes(),
  maps: parseMaps(),
};
assertValid(content);

export const {
  palette,
  metrics,
  style,
  traits,
  roles,
  abilities,
  items,
  clues,
  tasks,
  balance,
  scenes,
  maps,
  looks,
  routines,
  cutscenes,
  music,
  resources,
  recipes,
  mobs,
  quests,
  minigames,
  vendettas,
  evolutions,
  laws,
  events,
  economy,
  relations,
} = content;

function countKey(playerCount: number): `${4 | 5 | 6 | 7 | 8 | 9 | 10}` {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 10) {
    throw new RangeError(`player count must be 4-10, got ${playerCount}`);
  }
  return String(playerCount) as `${4 | 5 | 6 | 7 | 8 | 9 | 10}`;
}

/** The main-mode deck for a party size (GDD 3.1, 3.9): `cards` is player count + 2 card role ids, public. */
export function deckFor(playerCount: number): DeckRow {
  return roles.decks[countKey(playerCount)];
}

/** The look (looks.json) on a role's card, or null for a row with no character (GDD 3.17). */
export function lookOf(roleId: string): Look | null {
  const id = roles.roles[roleId]?.look;
  return id === undefined || id === null ? null : (looks.looks[id] ?? null);
}

/** The balance.json row for a party size. */
export function balanceFor(playerCount: number): BalanceRow {
  return balance.byCount[countKey(playerCount)];
}

/** Scene profile open at a party size (Small 4-6, Medium 7-8, Large 9-10). */
export function profileFor(playerCount: number): Profile {
  return balanceFor(playerCount).profile;
}

const sceneMap = new Map<SceneId, MapId>(
  MAP_IDS.flatMap((id) => maps[id].scenes.map((s) => [s, id] as const)),
);

/** The map a scene belongs to (every scene belongs to exactly one, GDD 3.13). */
export function mapOf(sceneId: SceneId): MapId {
  const id = sceneMap.get(sceneId);
  if (id === undefined) throw new Error(`scene ${sceneId} belongs to no map`);
  return id;
}

/** A map id from `Settings.map`, or the default map when the value is not one (GDD 3.13). */
export function mapIdOf(value: string): MapId {
  return (MAP_IDS as readonly string[]).includes(value) ? (value as MapId) : DEFAULT_MAP;
}
