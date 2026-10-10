// @wdi/content: every roster, number and scene id of docs/GDD.md and docs/WORLD.md as typed,
// validated data. Importing this module parses every JSON file with its zod schema and runs the
// cross-file checks in validate.ts; any problem throws at import, so a bad edit cannot ship.
import paletteJson from "../data/palette.json" with { type: "json" };
import metricsJson from "../data/metrics.json" with { type: "json" };
import styleJson from "../data/style.json" with { type: "json" };
import traitsJson from "../data/traits.json" with { type: "json" };
import rolesJson from "../data/roles.json" with { type: "json" };
import abilitiesJson from "../data/abilities.json" with { type: "json" };
import itemsJson from "../data/items.json" with { type: "json" };
import cluesJson from "../data/clues.json" with { type: "json" };
import tasksJson from "../data/tasks.json" with { type: "json" };
import balanceJson from "../data/balance.json" with { type: "json" };
import onubRolesJson from "../data/roles.onub.json" with { type: "json" };
import onubBalanceJson from "../data/balance.onub.json" with { type: "json" };
import overworldJson from "../data/scenes/overworld.json" with { type: "json" };
import tavernBarJson from "../data/scenes/tavern_bar.json" with { type: "json" };
import tavernBackJson from "../data/scenes/tavern_back.json" with { type: "json" };
import apothShopJson from "../data/scenes/apoth_shop.json" with { type: "json" };
import apothLoftJson from "../data/scenes/apoth_loft.json" with { type: "json" };
import widowParlourJson from "../data/scenes/widow_parlour.json" with { type: "json" };
import widowBedroomJson from "../data/scenes/widow_bedroom.json" with { type: "json" };
import forestJson from "../data/scenes/forest.json" with { type: "json" };
import bakeryJson from "../data/scenes/bakery.json" with { type: "json" };
import caveEntryJson from "../data/scenes/cave_entry.json" with { type: "json" };
import manorHallJson from "../data/scenes/manor_hall.json" with { type: "json" };
import manorUpperJson from "../data/scenes/manor_upper.json" with { type: "json" };
import barnJson from "../data/scenes/barn.json" with { type: "json" };
import chapelJson from "../data/scenes/chapel.json" with { type: "json" };
import cellarJson from "../data/scenes/cellar.json" with { type: "json" };

import { AbilitiesFile } from "./schemas/abilities.js";
import { BalanceFile, type BalanceRow, type Profile } from "./schemas/balance.js";
import { CluesFile } from "./schemas/clues.js";
import { ItemsFile } from "./schemas/items.js";
import { MetricsFile } from "./schemas/metrics.js";
import { OnubBalanceFile, type OnubCountRow } from "./schemas/onubBalance.js";
import { OnubRolesFile } from "./schemas/onubRoles.js";
import { PaletteFile } from "./schemas/palette.js";
import { RolesFile, type RosterRow } from "./schemas/roles.js";
import { SCENE_IDS, Scene, type SceneId } from "./schemas/scene.js";
import { StyleFile } from "./schemas/style.js";
import { TasksFile } from "./schemas/tasks.js";
import { TraitsFile } from "./schemas/traits.js";
import { assertValid, type Content } from "./validate.js";

export * from "./schemas/common.js";
export * from "./schemas/palette.js";
export * from "./schemas/metrics.js";
export * from "./schemas/style.js";
export * from "./schemas/traits.js";
export * from "./schemas/roles.js";
export * from "./schemas/abilities.js";
export * from "./schemas/items.js";
export * from "./schemas/clues.js";
export * from "./schemas/tasks.js";
export * from "./schemas/balance.js";
export * from "./schemas/scene.js";
export * from "./schemas/onubRoles.js";
export * from "./schemas/onubBalance.js";
export { validateContent, type Content } from "./validate.js";

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
};

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
  onubRoles: unknown;
  onubBalance: unknown;
}): Omit<Content, "scenes"> {
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
    onubRoles: OnubRolesFile.parse(raw.onubRoles),
    onubBalance: OnubBalanceFile.parse(raw.onubBalance),
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
    onubRoles: onubRolesJson,
    onubBalance: onubBalanceJson,
  }),
  scenes: parseScenes(),
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
  onubRoles,
  onubBalance,
} = content;

function countKey(playerCount: number): `${4 | 5 | 6 | 7 | 8 | 9 | 10}` {
  if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 10) {
    throw new RangeError(`player count must be 4-10, got ${playerCount}`);
  }
  return String(playerCount) as `${4 | 5 | 6 | 7 | 8 | 9 | 10}`;
}

/** The roles.json row for a party size; `.deal` is what V1 deals. */
export function rosterFor(playerCount: number): RosterRow {
  return roles.rosters[countKey(playerCount)];
}

/** The balance.json row for a party size. */
export function balanceFor(playerCount: number): BalanceRow {
  return balance.byCount[countKey(playerCount)];
}

/** Scene profile open at a party size (Small 4-6, Medium 7-8, Large 9-10). */
export function profileFor(playerCount: number): Profile {
  return balanceFor(playerCount).profile;
}

/** The balance.onub.json row (deck, loaves, discussion) for a party size. */
export function onubFor(playerCount: number): OnubCountRow {
  return onubBalance.byCount[countKey(playerCount)];
}
