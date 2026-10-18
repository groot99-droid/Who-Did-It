/**
 * Real-manifest keys whose art predates the round-5 style (docs/ASSETS.md 6.1, 6.11; art plan 1.7).
 * palette.test.ts and budget.test.ts skip them. The PR that replaces or removes a key's art deletes its
 * line here in the same commit; K6 (5K's last PR, integrated after L4, L5 and M1) asserts the list is
 * empty. One key per line, so the three art sessions' deletions merge cleanly.
 */
export const LEGACY: readonly string[] = [
  // K6 (5K): leave both manifests once 5J's isometric tilemaps have landed
  'tiles_grass',
  'tiles_path',
  'tiles_cobble',
  'tiles_floorboards',
  'tiles_caverock',
  'tiles_forestfloor',
];
