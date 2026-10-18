/**
 * Real-manifest keys whose art predates the round-5 style (docs/ASSETS.md 6.1, 6.11; art plan 1.7).
 * palette.test.ts and budget.test.ts skip them. The PR that replaces or removes a key's art deletes its
 * line here in the same commit; K6 (5K's last PR, integrated after L4, L5 and M1) asserts the list is
 * empty. One key per line, so the three art sessions' deletions merge cleanly.
 */
export const LEGACY: readonly string[] = [
  // K4 (5K): leave both manifests when bld_hollowmere lands
  'bld_tavern_ext',
  'bld_apoth_ext',
  'bld_widow_ext',
  'bld_bakery_ext',
  // K6 (5K): leave both manifests once 5J's isometric tilemaps have landed
  'tiles_grass',
  'tiles_path',
  'tiles_cobble',
  'tiles_floorboards',
  'tiles_caverock',
  'tiles_forestfloor',
  // L4 (5L): the real villager leaves the real manifest (placeholder only in round 5)
  'char_villager',
  'ovl_villager',
  // L5 (5L): re-rendered under the same key
  'vfx',
  // M1 (5M): leave both manifests with the loft
  'loft_backdrop',
  'prop_bedroll',
  'prop_bedroll_self',
];
