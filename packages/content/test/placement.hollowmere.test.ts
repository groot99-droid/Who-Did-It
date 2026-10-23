import { describe, expect, it } from 'vitest';
import { maps, scenes, tasks, type SceneId } from '../src/index.js';
import { type PlacementRules, placementProblems } from './placement.js';

// Round 8 (8J, docs/round8/art.md 4.1): perfect object placement in every Hollowmere scene. The classes say what
// each prop's art needs (tools/blender/env/hollowmere_props.py, shared_props.py and the sliced props of
// build_buildings.py): a wall behind it, floor in front of it, or a table under it.
const RULES: PlacementRules = {
  props: {
    // Hung on a wall: a back panel at the tile's north edge, the face toward the floor south of it.
    dartboard: 'hung',
    keyCache: 'hung',
    lockedDoor: 'hung',
    window: 'hung',
    letter_box: 'hung',
    photos: 'hung',
    portrait: 'hung',
    rope: 'hung',
    clock: 'hung',
    shelf: 'hung',
    noticeBoard: 'front',
    // A front used from the floor south of it.
    oven: 'front',
    ledger: 'front',
    bench: 'front',
    safe: 'front',
    flourBin: 'front',
    deadLoaf: 'front',
    coldShelves: 'front',
    proofingCabinet: 'front',
    brickOven: 'front',
    doughMixer: 'front',
    den: 'front',
    gasPocket: 'front',
    lamp: 'free',
    // Seen and used from any side.
    basin: 'free',
    bell: 'free',
    pump: 'free',
    kitChest: 'free',
    lanternPost: 'free',
    fence: 'free',
    scarecrow: 'free',
    goat: 'free',
    flour_sacks: 'free',
    planks: 'free',
    oil_barrel: 'free',
    ore_cart: 'free',
    tin_crate: 'free',
    drowned_lantern: 'free',
    hanging_oak: 'free',
    clamp: 'free',
    pump_beam: 'free',
    wakeTable: 'surface',
    plate: 'overlay',
    crepe: 'doorOverlay',
    teachingClue: 'floor',
  },
  spots: {
    curtain: 'hung',
    herbLoft: 'hung',
    confessional: 'front',
    wineRack: 'front',
    pantry: 'front',
    wardrobe: 'front',
    oreChute: 'front',
    behindCounter: 'free',
    underBed: 'free',
    crawlspace: 'front',
    cryptNiche: 'free',
    atticHatch: 'free',
    bog: 'free',
    breadRack: 'free',
    brush: 'free',
    cart: 'free',
    charcoalPit: 'free',
    cratePile: 'free',
    crates: 'free',
    dumpSpot: 'free',
    flourSacks: 'free',
    hayPile: 'free',
    hedge: 'free',
    hollowLog: 'free',
    hollowTree: 'free',
    kegStack: 'free',
    poolNiche: 'free',
    reeds: 'free',
    stalagmite: 'free',
    sump: 'free',
    timberCrib: 'free',
    trayStack: 'free',
    trunk: 'free',
    woodBox: 'free',
  },
  lights: {
    lamp: { props: ['lamp', 'ledger', 'bench'] },
    lantern: { props: ['lanternPost', 'drowned_lantern'] },
    fire: { props: ['oven', 'brickOven'] },
    torch: { props: [], wall: true },
    window: { props: ['window'], wall: true, building: true },
    // Moonlight falls anywhere out of doors; indoors it comes through a window.
    moon: { props: ['window'], wall: true, building: true, outdoors: true },
  },
};

/**
 * Scenes not yet dressed by 8J, with the problems they still have: each room's pull request fixes its scene and
 * takes it off this list, and the test fails on an entry that no longer fails, so the list only shrinks.
 */
const PENDING: Partial<Record<SceneId, readonly string[]>> = {
  overworld: [
    'light ov.lt_tavern_window (window) at 31,35 hangs on nothing that could hold it',
    'light ov.lt_bakery_window (window) at 44,20 hangs on nothing that could hold it',
    'light ov.lt_apoth_window (window) at 53,25 hangs on nothing that could hold it',
    'light ov.lt_chapel_window (window) at 11,30 hangs on nothing that could hold it',
    'light ov.lt_platform (lantern) at 60,30 hangs on nothing that could hold it',
  ],
  tavern_bar: [
    'prop tb.shutters faces south into no floor (its front is hidden)',
    'wall-hung prop tb.shutters has no wall behind it',
    'prop tb.flour_bin faces south into no floor (its front is hidden)',
    'light tb.lt_hearth (fire) at 1,3 hangs on nothing that could hold it',
    'light tb.lt_lamp_bar (lamp) at 15,2 hangs on nothing that could hold it',
    'light tb.lt_lamp_room (lamp) at 7,8 hangs on nothing that could hold it',
  ],
  tavern_back: ['light tk.lt_lamp (lamp) at 6,4 hangs on nothing that could hold it'],
  apoth_shop: [
    'prop as.bench faces south into no floor (its front is hidden)',
    'light as.lt_lamp (lamp) at 8,3 hangs on nothing that could hold it',
    'light as.lt_shelf (lamp) at 4,1 hangs on nothing that could hold it',
  ],
  apoth_loft: ['light al.lt_green_lamp (lamp) at 6,1 hangs on nothing that could hold it'],
  widow_parlour: [
    'prop wp.letter_box faces south into no floor (its front is hidden)',
    'spot wp.pantry faces south into no floor',
    'light wp.lt_lamp (lamp) at 8,5 hangs on nothing that could hold it',
  ],
  widow_bedroom: ['light wb.lt_candle (lamp) at 6,1 hangs on nothing that could hold it'],
  forest: ['light fo.lt_gate_lantern (lantern) at 21,28 hangs on nothing that could hold it'],
  bakery: [
    'prop bk.deadloaf_0 faces south into no floor (its front is hidden)',
    'prop bk.deadloaf_1 faces south into no floor (its front is hidden)',
    'prop bk.ledger faces south into no floor (its front is hidden)',
    'light bk.lt_lamp_table (lamp) at 8,6 hangs on nothing that could hold it',
    'light bk.lt_lamp_counter (lamp) at 14,6 hangs on nothing that could hold it',
  ],
  manor_hall: [
    'wall-hung spot mh.curtain_alcove has no wall behind it',
    'light mh.lt_lamp_w (lamp) at 7,7 hangs on nothing that could hold it',
    'light mh.lt_lamp_e (lamp) at 21,7 hangs on nothing that could hold it',
  ],
  manor_upper: [
    'prop mu.study_door faces south into no floor (its front is hidden)',
    'light mu.lt_lamp (lamp) at 12,6 hangs on nothing that could hold it',
  ],
  barn: [
    'prop ba.study_key stands on a walkable tile or a door or spot (it is solid, so it needs a "#" tile)',
    'light ba.lt_lantern (lantern) at 10,6 hangs on nothing that could hold it',
  ],
  chapel: [
    'light ch.lt_candles (lamp) at 9,1 hangs on nothing that could hold it',
    'light ch.lt_moon_window (moon) at 4,6 hangs on nothing that could hold it',
  ],
  cellar: [
    'prop cl.study_key stands on a walkable tile or a door or spot (it is solid, so it needs a "#" tile)',
    'prop cl.study_key faces south into no floor (its front is hidden)',
    'wall-hung prop cl.study_key has no wall behind it',
    'prop cl.gas_alcove_n stands on a walkable tile or a door or spot (it is solid, so it needs a "#" tile)',
    'prop cl.gas_alcove_s stands on a walkable tile or a door or spot (it is solid, so it needs a "#" tile)',
    'light cl.lt_torch_well (torch) at 14,2 hangs on nothing that could hold it',
    'light cl.lt_torch_trap (torch) at 25,8 hangs on nothing that could hold it',
    'light cl.lt_torch_crypt (torch) at 2,8 hangs on nothing that could hold it',
  ],
  forest_deep: [
    'prop fd.den faces south into no floor (its front is hidden)',
    'light fd.lt_clamp (fire) at 37,8 hangs on nothing that could hold it',
    'light fd.lt_drowned (lantern) at 10,29 hangs on nothing that could hold it',
  ],
  cave_gallery: [
    'spot cg.ore_chute faces south into no floor',
    'light cg.lt_lamp_ore (lamp) at 19,4 hangs on nothing that could hold it',
  ],
  crumb_cold: ['light cf.lt_lamp (lamp) at 6,3 hangs on nothing that could hold it'],
  crumb_mixing: ['light cm.lt_lamp (lamp) at 5,4 hangs on nothing that could hold it'],
  crumb_oven: [
    'light co.lt_bulb (lamp) at 3,1 hangs on nothing that could hold it',
    'light co.lt_oven (fire) at 6,3 hangs on nothing that could hold it',
  ],
  crumb_proofing: [
    'light cp.lt_bulb_w (lamp) at 2,1 hangs on nothing that could hold it',
    'light cp.lt_bulb_e (lamp) at 9,1 hangs on nothing that could hold it',
    'light cp.lt_cabinet (lamp) at 5,4 hangs on nothing that could hold it',
  ],
};

const taskPropsOf = (sceneId: string): Set<string> =>
  new Set(
    Object.values(tasks.tasks).flatMap((t) =>
      (t.targets ?? []).filter((n) => n.scene === sceneId).map((n) => n.prop),
    ),
  );

describe('Hollowmere placement (art.md 4.1)', () => {
  it.each(maps.hollowmere.scenes)('%s', (id) => {
    const problems = placementProblems(scenes[id], RULES, taskPropsOf(id));
    expect(problems).toEqual(PENDING[id] ?? []);
  });
});

describe('the placement check', () => {
  const copy = (id: SceneId) => structuredClone(scenes[id]);
  const check = (s: ReturnType<typeof copy>) => placementProblems(s, RULES, new Set());

  it('refuses a prop on another prop, and one with no class', () => {
    const s = copy('cave_entry');
    const at = s.grid.findIndex((row) => row.includes('#.'));
    const x = s.grid[at]!.indexOf('#.');
    s.props.push({ id: 'ce.a', kind: 'basin', x, y: at }, { id: 'ce.b', kind: 'mystery', x, y: at });
    expect(check(s)).toEqual(expect.arrayContaining(['prop ce.b (mystery) has no placement class']));
    s.props[s.props.length - 1]!.kind = 'bell';
    expect(check(s)).toEqual(expect.arrayContaining([`prop ce.b overlaps ce.a at ${x},${at}`]));
  });

  it('refuses a wall-hung prop with floor behind it, and a front facing a wall', () => {
    const s = copy('tavern_bar');
    expect(check(s)).toEqual(
      expect.arrayContaining([
        'prop tb.shutters faces south into no floor (its front is hidden)',
        'wall-hung prop tb.shutters has no wall behind it',
      ]),
    );
  });

  it('refuses a solid prop on the floor, a blocked door and unreachable floor', () => {
    const s = copy('chapel');
    s.grid[6] = `${s.grid[6]!.slice(0, 15)}#SD`;
    s.grid[5] = `${s.grid[5]!.slice(0, 16)}##`;
    s.grid[7] = `${s.grid[7]!.slice(0, 16)}##`;
    const problems = check(s);
    expect(problems).toEqual(expect.arrayContaining([expect.stringMatching(/unreachable from spawn door$/)]));
    s.props.push({ id: 'ch.x', kind: 'basin', x: 3, y: 4 });
    expect(check(s)).toEqual(
      expect.arrayContaining([expect.stringContaining('prop ch.x stands on a walkable tile')]),
    );
  });

  it('refuses a lamp light with no lamp under it, and takes moonlight anywhere outside', () => {
    expect(check(copy('chapel'))).toEqual(
      expect.arrayContaining(['light ch.lt_candles (lamp) at 9,1 hangs on nothing that could hold it']),
    );
    expect(check(copy('forest')).some((p) => p.includes('fo.lt_moon_clearing'))).toBe(false);
  });
});
