// Which manifest entries load when (SPRITES 5 and 10.13). Pure, so it is tested without Phaser.

export interface ManifestEntry {
  key: string;
  type: 'multiatlas' | 'atlas' | 'image' | 'animation';
  url: string;
  path?: string;
  filter?: 'linear' | 'nearest';
  origin?: [number, number];
  /** Map ids: the entry loads with the match's map, not at boot (SPRITES 5, 10.13). */
  maps?: string[];
  /** Modes: the entry loads at match start when the match's mode is listed, whatever the client's card. */
  modes?: Array<'main' | 'onub'>;
}

/** Entries with neither `maps` nor `modes` load at boot (SPRITES 10.13). */
export const loadsAtBoot = (e: ManifestEntry): boolean => e.maps === undefined && e.modes === undefined;

/** Whether an entry loads with this match: its map or its mode is listed. */
export const loadsWithMatch = (e: ManifestEntry, mapId: string, mode: 'main' | 'onub'): boolean =>
  (e.maps?.includes(mapId) ?? false) || (e.modes?.includes(mode) ?? false);

/** The map id a quick match loads art for: none, as the quick mode walks no map (GDD 3.11), so only `modes` entries. */
export const QUICK_MATCH_MAP = '';
