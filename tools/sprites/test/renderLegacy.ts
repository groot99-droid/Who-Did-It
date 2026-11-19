/**
 * Render units an art drop ships that have no committed render lock yet (T5, ASSETS 6.6): they were rendered before the
 * writer of T4 existed. renders.test.ts requires a lock for every other unit. The pull request that re-renders a unit
 * with `render_lock.py` commits its lock to `assets/source/renders/<unit>.lock.json` and deletes its line here in the
 * same commit; the list only shrinks, and the test fails on a line whose lock exists. One unit per line.
 */
export const LEGACY_RENDERS: readonly string[] = [
  'baker',
  'bld_blackpine',
  'bld_hollowmere',
  'clues',
  'detective',
  'doctor',
  'fisher',
  'gamekeeper',
  'herbalist',
  'iso_kit_harbour',
  'iso_kit_timber',
  'lamplighter',
  'props',
  'props_blackpine',
  'props_hollowmere',
  'tinner',
  'vfx',
  'vicar',
  'villager',
  'villagerclerk',
  'villagerelder',
  'villagergoodwife',
  'villagerlass',
  'watchman',
];
