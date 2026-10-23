import type { EconomyFile } from './schemas/economy.js';
import type { ItemsFile } from './schemas/items.js';
import type { LooksFile } from './schemas/looks.js';
import type { MapFile, MapId } from './schemas/maps.js';
import type { Scene, SceneId } from './schemas/scene.js';

/**
 * Round 8 (GDD 3.23), Session 8D: every prop `economy.json` names is a prop of the right kind on a scene of a map,
 * every item and look exists, each curfew scene is an interior of its map, and the HQ tiers cost more as they climb.
 */
export function checkEconomy(
  c: {
    economy: EconomyFile;
    items: ItemsFile;
    looks: LooksFile;
    scenes: Record<SceneId, Scene>;
    maps: Record<MapId, MapFile>;
  },
  err: (msg: string) => void,
): void {
  const { economy } = c;
  const propAt = (id: string): { kind: string; map: MapId | undefined } | undefined => {
    for (const scene of Object.values(c.scenes)) {
      const prop = scene.props.find((p) => p.id === id);
      if (!prop) continue;
      const map = (Object.keys(c.maps) as MapId[]).find((m) =>
        c.maps[m].scenes.includes(scene.id as SceneId),
      );
      return { kind: prop.kind, map };
    }
    return undefined;
  };
  const expectProp = (where: string, id: string, kind: string, map?: MapId) => {
    const prop = propAt(id);
    if (!prop) return err(`economy ${where}: no prop ${id}`);
    if (prop.kind !== kind) err(`economy ${where}: ${id} has kind ${prop.kind}, expected ${kind}`);
    if (map !== undefined && prop.map !== map) err(`economy ${where}: ${id} is not on ${map}`);
  };
  const isItem = (id: string) => id in c.items.items;

  for (const id of economy.faith.altars) expectProp('faith.altars', id, 'altar');
  for (const id of economy.notices.mailbags) expectProp('notices.mailbags', id, 'mailbag');
  for (const id of economy.notices.blackMarkets) expectProp('notices.blackMarkets', id, 'blackMarket');
  for (const id of economy.quota.racks) expectProp('quota.racks', id, 'rack');
  for (const item of economy.quota.items) if (!isItem(item)) err(`economy quota: unknown item ${item}`);
  for (const [map, list] of Object.entries(economy.curfew) as Array<[MapId, readonly string[]]>) {
    for (const id of list) {
      const scene = c.scenes[id as SceneId];
      if (!scene || !c.maps[map].scenes.includes(id as SceneId))
        err(`economy curfew: ${id} is not on ${map}`);
      else if (scene.kind !== 'interior') err(`economy curfew: ${id} is not an interior`);
    }
  }
  const { indulgence, seal } = economy.faith;
  if (indulgence.faith > economy.faith.max || seal.faith > economy.faith.max)
    err('economy faith: a price exceeds the Faith a seat can hold');

  for (const [id, station] of Object.entries(economy.hq.stations)) {
    const at = `hq ${id}`;
    if (!(station.look in c.looks.looks)) err(`${at}: unknown look ${station.look}`);
    for (const [map, prop] of Object.entries(station.props) as Array<[MapId, string]>)
      expectProp(at, prop, 'hq', map);
    station.tiers.forEach((tier, i) => {
      for (const m of tier.materials) if (!isItem(m.item)) err(`${at} tier ${i + 1}: unknown item ${m.item}`);
      if (Object.keys(tier.perks).length === 0) err(`${at} tier ${i + 1}: no perk`);
      const prev = station.tiers[i - 1];
      if (prev && tier.scrip <= prev.scrip) err(`${at} tier ${i + 1}: costs no more Scrip than tier ${i}`);
    });
  }
}
