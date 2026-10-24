import { describe, expect, it } from 'vitest';
import { maps, scenes, tasks, type SceneId } from '../src/index.js';
import { type PlacementRules, placementProblems, propKey } from './placement.js';

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
    // Round 8 (8J): St Brannock's.
    stained_glass: 'hung',
    stained_glass_e: 'hungEast',
    hymn_board: 'hung',
    memorial: 'hung',
    lectern: 'front',
    pulpit: 'front',
    altar: 'front',
    pew: 'free',
    candle_stand: 'free',
    votive_rack: 'free',
    alms_box: 'free',
    flower_stand: 'free',
    font: 'free',
    // Vane Manor.
    bookcase: 'front',
    bookcase_b: 'front',
    tin_cabinet: 'front',
    tin_cabinet_b: 'front',
    fireplace_e: 'hungEast',
    vane_portrait: 'hung',
    draped_window: 'hung',
    sideboard: 'front',
    dressing_table: 'front',
    washstand: 'front',
    linen_press: 'front',
    dining_table: 'free',
    armchair: 'free',
    lamp_table: 'free',
    boot_rack: 'free',
    coat_stand: 'free',
    nightstand: 'free',
    blanket_chest: 'free',
    // The Drowned Lantern and its back room.
    bottle_shelf: 'hung',
    bottle_shelf_b: 'hung',
    tide_chart: 'hung',
    chalkboard: 'hung',
    ship_wheel: 'hung',
    store_shelf: 'hung',
    store_shelf_b: 'hung',
    inglenook_e: 'hungEast',
    bar_counter: 'front',
    bar_counter_taps: 'front',
    bar_counter_lamp: 'front',
    keg_rack: 'front',
    piano: 'front',
    tavern_table: 'free',
    tavern_table_b: 'free',
    card_table: 'free',
    settle: 'free',
    log_basket: 'free',
    barrel: 'free',
    bottle_crate: 'free',
    rug: 'floor',
    sawdust: 'floor',
    // Widow Vane's.
    tea_table: 'free',
    writing_desk: 'front',
    birdcage: 'free',
    // Mallory's apothecary, and Hollowmere's shop counter (8C's `counter`).
    counter: 'front',
    counter_case: 'front',
    counter_case_b: 'front',
    apoth_drawers: 'front',
    jar_shelf: 'hung',
    jar_shelf_b: 'hung',
    herb_rack: 'hung',
    still: 'free',
    mortar_table: 'free',
    show_globe: 'free',
    leech_jar: 'free',
    drying_frame: 'free',
    // Crumb's Ovens and its four rooms. A dead loaf lies on a stone ledge seen from any side.
    deadLoaf: 'free',
    bread_shelf: 'hung',
    bread_shelf_b: 'hung',
    peel_rack: 'hung',
    cold_shelf: 'hung',
    wall_bulb: 'hung',
    bread_case: 'front',
    cooling_rack: 'free',
    bread_basket: 'free',
    dough_trough: 'free',
    shaping_table: 'free',
    water_bucket: 'free',
    milk_churn: 'free',
    ice_chest: 'free',
    couche_rack: 'free',
    // Pennock's barn, the cellar under the square, and the tavern back room's black market (8D's).
    harness_rack: 'hung',
    tool_rack: 'hung',
    lantern_hook: 'hung',
    ossuary: 'hung',
    cobweb: 'hung',
    hay_bale: 'free',
    feed_trough: 'free',
    wine_cask: 'free',
    blackMarket: 'free',
    // The square, the house fronts, the platform's mail crane (8D's mailbag) and the quay.
    mailbag: 'free',
    // The wood beyond the gate, the deep wood and Vane's flooded gallery.
    pit_prop: 'hung',
    stump: 'free',
    boulder: 'free',
    fern: 'free',
    fallen_log: 'free',
    signpost: 'free',
    woodpile: 'free',
    lantern_pole: 'free',
    rubble: 'free',
    ore_pile: 'free',
    mushrooms: 'floor',
    leaf_litter: 'floor',
    snare: 'floor',
    bones: 'floor',
    miners_lamp: 'floor',
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
    lamp: {
      props: [
        'lamp',
        'ledger',
        'bench',
        'candle_stand',
        'votive_rack',
        'altar',
        'lamp_table',
        'dining_table',
        'nightstand',
        'bar_counter_lamp',
        'tavern_table',
        'tavern_table_b',
        'card_table',
        'tea_table',
        'counter',
        'mortar_table',
        'show_globe',
        'shaping_table',
        'wall_bulb',
        'miners_lamp',
      ],
    },
    lantern: { props: ['lanternPost', 'drowned_lantern', 'lantern_hook', 'lantern_pole'] },
    fire: { props: ['oven', 'brickOven', 'fireplace_e', 'inglenook_e', 'still', 'clamp'] },
    torch: { props: [], wall: true },
    window: {
      props: ['window', 'stained_glass', 'stained_glass_e', 'draped_window'],
      wall: true,
      building: true,
    },
    // Moonlight falls anywhere out of doors; indoors it comes through a window.
    moon: {
      props: ['window', 'stained_glass', 'stained_glass_e', 'draped_window'],
      wall: true,
      building: true,
      outdoors: true,
    },
  },
};

/**
 * Scenes not yet dressed by 8J, with the problems they still have: each room's pull request fixes its scene and
 * takes it off this list, and the test fails on an entry that no longer fails, so the list only shrinks.
 */
const PENDING: Partial<Record<SceneId, readonly string[]>> = {};

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
  it('keys dressing by id tail, then by the tail without _<n> (SPRITES 3)', () => {
    const known = (k: string) => k in RULES.props;
    expect(propKey({ id: 'ch.pew_3', kind: 'dressing' }, known)).toBe('pew');
    expect(propKey({ id: 'ch.stained_glass_e_1', kind: 'dressing' }, known)).toBe('stained_glass_e');
    expect(propKey({ id: 'ch.lectern', kind: 'dressing' }, known)).toBe('lectern');
    expect(propKey({ id: 'ch.pew_3', kind: 'pew' }, known)).toBe('pew');
  });

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
    Object.assign(
      s.props.find((p) => p.id === 'tb.shutters')!,
      { x: 14, y: 11 },
    );
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
    const s = copy('chapel');
    s.lights!.find((l) => l.id === 'ch.lt_candles')!.x = 7; // the chancel floor beside the altar
    expect(check(s)).toEqual(
      expect.arrayContaining(['light ch.lt_candles (lamp) at 7,1 hangs on nothing that could hold it']),
    );
    expect(check(copy('forest')).some((p) => p.includes('fo.lt_moon_clearing'))).toBe(false);
  });
});
