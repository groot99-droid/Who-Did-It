// Blackpine's placement test (docs/round8/art.md 4.1; round 8, 8K): every `bp_` scene against the shared check of
// placement.ts (8J), with the class of every Blackpine prop frame, spot variant and light holder, plus three rules
// of this map's walls: no prop in the wall ring (it leaves a hole in the drawn wall), no covered `P` tile under
// nothing, and creature loops on open ground.
import { describe, expect, it } from 'vitest';
import { maps, scenes, tasks, type Scene, type SceneId } from '../src/index.js';
import { type PlacementRules, placementProblems } from './placement.js';

/** tools/blender/env/blackpine_props.py, shared_props.py and the sliced props of build_buildings.py. */
export const BLACKPINE_RULES: PlacementRules = {
  props: {
    // Hung on a wall: a back panel at the tile's north edge, the face toward the floor south of it.
    gearing: 'hung',
    pegs: 'hung',
    tally_board: 'hung',
    shelves: 'hung',
    telephone: 'hung',
    tool_rack: 'hung',
    forge: 'hung',
    // A front used from the floor south of it.
    noticeBoard: 'front',
    oven: 'front',
    ledger_desk: 'front',
    safe: 'front',
    // Seen and used from any side.
    bell: 'free',
    pump: 'free',
    kitChest: 'free',
    lanternPost: 'free',
    basin: 'free',
    flume: 'free',
    plank_stack: 'free',
    powder_kegs: 'free',
    ore_cart_0: 'free',
    anvil: 'free',
    tin_crate: 'free',
    trestle: 'free',
    bunks_n: 'free',
    bunks_s: 'free',
    head_saw: 'free',
    kiln_0: 'free',
    kiln_1: 'free',
    mess_table: 'surface',
    refuge_table: 'surface',
    map_table: 'surface',
    teachingClue: 'floor',
  },
  spots: {
    behindCounter: 'free',
    underBed: 'free',
    crawlspace: 'front',
    wardrobe: 'front',
    oreBin: 'free',
    logPile: 'free',
    barrel: 'free',
    bunk: 'free',
    orePillar: 'free',
    sump: 'free',
    woodBox: 'free',
    rootCellar: 'free',
    sawdustPile: 'free',
    logChute: 'free',
    oreCart: 'free',
    timberCrib: 'free',
    oldStope: 'free',
    strongroom: 'front',
    coalBin: 'free',
    hollowTree: 'free',
    brush: 'free',
    pool: 'free',
  },
  lights: {
    lamp: { props: ['pegs', 'tally_board', 'ledger_desk', 'mess_table', 'refuge_table', 'map_table'] },
    lantern: { props: ['lanternPost'] },
    fire: { props: ['oven', 'forge', 'kiln_0', 'kiln_1'], building: true },
    torch: { props: [], wall: true },
    window: { props: [], wall: true, building: true },
    moon: { props: [], wall: true, building: true, outdoors: true },
  },
};

/** Blackpine's wall rules, which the shared check leaves to each map. */
export function wallProblems(scene: Scene): string[] {
  const out: string[] = [];
  const { w, h } = scene.size;
  const mat = (x: number, y: number) => scene.material?.[y]?.[x];
  const floor = (x: number, y: number) => scene.grid[y]?.[x] === '.' || scene.grid[y]?.[x] === 'S';
  const owned = new Set<string>();
  const own = (x0: number, y0: number, fw: number, fh: number) => {
    for (let y = y0; y < y0 + fh; y++) for (let x = x0; x < x0 + fw; x++) owned.add(`${x},${y}`);
  };
  for (const b of scene.buildings ?? []) own(b.footprint.x, b.footprint.y, b.footprint.w, b.footprint.h);
  for (const s of scene.spots) own(s.x, s.y, 1, 1);
  for (const p of scene.props) {
    const f = p.footprint ?? { x: p.x, y: p.y, w: 1, h: 1 };
    own(f.x, f.y, f.w, f.h);
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++)
        if (p.kind !== 'teachingClue' && (x === 0 || y === 0 || x === w - 1 || y === h - 1))
          out.push(`prop ${p.id} stands in the wall ring at ${x},${y} (it leaves a hole in the wall)`);
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mat(x, y) === 'P' && !owned.has(`${x},${y}`)) out.push(`covered tile ${x},${y} is under nothing`);
  for (const path of scene.paths) {
    const pts = path.points;
    const clear = pts.every((a, i) => {
      const b = pts[(i + 1) % pts.length]!;
      const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      for (let k = 0; k <= n; k++)
        if (!floor(a.x + Math.sign(b.x - a.x) * k, a.y + Math.sign(b.y - a.y) * k)) return false;
      return true;
    });
    if (!clear) out.push(`path ${path.id} runs over solid ground`);
  }
  return out;
}

const taskPropsOf = (sceneId: string): Set<string> =>
  new Set(
    Object.values(tasks.tasks).flatMap((t) =>
      (t.targets ?? []).filter((n) => n.scene === sceneId).map((n) => n.prop),
    ),
  );
const problemsOf = (s: Scene) => [
  ...placementProblems(s, BLACKPINE_RULES, taskPropsOf(s.id)),
  ...wallProblems(s),
];

/**
 * Scenes not yet placed by 8K, with the problems they still have: each room's pull request fixes its scene and
 * takes it off this list, and the test fails on an entry that no longer fails, so the list only shrinks.
 */
const PENDING: Partial<Record<SceneId, readonly string[]>> = {
  bp_camp: [
    'light bc.lt_lodge_window (window) at 15,20 hangs on nothing that could hold it',
    'light bc.lt_mill_window (window) at 46,25 hangs on nothing that could hold it',
    'light bc.lt_office_window (window) at 49,12 hangs on nothing that could hold it',
    'light bc.lt_smithy_glow (fire) at 33,12 hangs on nothing that could hold it',
    'light bc.lt_adit_torch (torch) at 41,4 hangs on nothing that could hold it',
  ],
  bp_lodge: [
    'prop bl.stove faces south into no floor (its front is hidden)',
    'light bl.lt_stove (fire) at 1,3 hangs on nothing that could hold it',
    'light bl.lt_lamp_mess (lamp) at 7,7 hangs on nothing that could hold it',
    'light bl.lt_lamp_bunks (lamp) at 17,5 hangs on nothing that could hold it',
    'prop bl.stove stands in the wall ring at 0,3 (it leaves a hole in the wall)',
    'prop bl.basin stands in the wall ring at 9,0 (it leaves a hole in the wall)',
    'prop bl.pegs stands in the wall ring at 11,0 (it leaves a hole in the wall)',
  ],
  bp_mill: [
    'light bs.lt_lamp_saw (lamp) at 11,8 hangs on nothing that could hold it',
    'light bs.lt_lamp_door (lamp) at 20,7 hangs on nothing that could hold it',
    'prop bs.gearing stands in the wall ring at 12,0 (it leaves a hole in the wall)',
  ],
  bp_woods: [
    'light bw.lt_kiln_0 (fire) at 23,28 hangs on nothing that could hold it',
    'light bw.lt_kiln_1 (fire) at 27,28 hangs on nothing that could hold it',
    'light bw.lt_chute_lantern (lantern) at 43,10 hangs on nothing that could hold it',
  ],
  bp_mine: [
    'light bm.lt_adit_torch (torch) at 23,26 hangs on nothing that could hold it',
    'light bm.lt_lamp_chamber (lamp) at 18,13 hangs on nothing that could hold it',
    'light bm.lt_lamp_tally (lamp) at 20,10 hangs on nothing that could hold it',
    'light bm.lt_torch_winze (torch) at 35,9 hangs on nothing that could hold it',
  ],
  bp_office: [
    'light bo.lt_desk_lamp (lamp) at 13,4 hangs on nothing that could hold it',
    'light bo.lt_store_lamp (lamp) at 5,6 hangs on nothing that could hold it',
    'prop bo.shelves stands in the wall ring at 3,0 (it leaves a hole in the wall)',
    'prop bo.telephone stands in the wall ring at 10,0 (it leaves a hole in the wall)',
  ],
  bp_smithy: [
    'prop bf.tool_rack faces south into no floor (its front is hidden)',
    'light bf.lt_forge (fire) at 7,2 hangs on nothing that could hold it',
    'light bf.lt_lamp (lamp) at 12,7 hangs on nothing that could hold it',
    'prop bf.tool_rack stands in the wall ring at 0,5 (it leaves a hole in the wall)',
  ],
  bp_deep: [
    'light bd.lt_refuge_lamp (lamp) at 6,23 hangs on nothing that could hold it',
    'light bd.lt_torch_adit (torch) at 3,20 hangs on nothing that could hold it',
  ],
};

/** Every id the rooms had before round 8 (art.md 4.6): spawns, spots, nodes, givers, props, spawners and paths. */
const FROZEN: Record<string, string[]> = {
  bp_camp: [
    'lodge',
    'lodge_side',
    'mill',
    'mill_yard',
    'office',
    'smithy',
    'woods',
    'adit',
    'chute_foot',
    'yard_0',
    'yard_1',
    'yard_2',
    'yard_3',
    'yard_4',
    'yard_5',
    'yard_6',
    'yard_7',
    'yard_8',
    'yard_9',
    'bc.ore_bin',
    'bc.log_deck',
    'bc.water_barrel',
    'bc.porch_crawl',
    'bc.nd_timber_0',
    'bc.nd_timber_1',
    'bc.nd_stone_0',
    'bc.nd_stone_1',
    'bc.gv_foreman',
    'bc.bell',
    'bc.pump',
    'bc.board',
    'bc.chest',
    'bc.teaching_clue',
    'bc.lantern_0',
    'bc.lantern_1',
    'bc.lantern_2',
    'bc.lantern_3',
    'bc.trestle',
    'bc.flume',
  ],
  bp_woods: [
    'camp',
    'vent',
    'old_adit',
    'bw.hollow_pine',
    'bw.brush_n',
    'bw.log_jam',
    'bw.ford_pool',
    'bw.nd_timber_0',
    'bw.nd_timber_1',
    'bw.nd_timber_2',
    'bw.nd_timber_3',
    'bw.nd_timber_4',
    'bw.nd_timber_5',
    'bw.nd_resin_0',
    'bw.nd_resin_1',
    'bw.nd_herb_0',
    'bw.nd_herb_1',
    'bw.nd_mush_0',
    'bw.nd_mush_1',
    'bw.nd_stone_0',
    'bw.nd_stone_1',
    'bw.gv_collier',
    'bw.kiln_0',
    'bw.kiln_1',
    'bw.sp_wolf_n',
    'bw.sp_wolf_s',
    'bw.sp_boar',
    'bw.wolf_loop_n',
    'bw.wolf_loop_s',
  ],
  bp_lodge: [
    'front',
    'side',
    'bl.wood_box',
    'bl.under_bunk_n',
    'bl.under_bunk_s',
    'bl.root_cellar',
    'bl.stove',
    'bl.basin',
    'bl.mess_table',
    'bl.bunks_n',
    'bl.bunks_s',
    'bl.pegs',
  ],
  bp_mill: ['door', 'yard', 'bs.sawdust', 'bs.log_chute', 'bs.head_saw', 'bs.gearing', 'bs.plank_stack'],
  bp_office: [
    'door',
    'bo.behind_counter',
    'bo.wardrobe',
    'bo.strongroom',
    'bo.shelves',
    'bo.ledger_desk',
    'bo.safe',
    'bo.map_table',
    'bo.telephone',
  ],
  bp_smithy: ['door', 'bf.coal_bin', 'bf.gv_smith', 'bf.forge', 'bf.anvil', 'bf.trough', 'bf.tool_rack'],
  bp_mine: [
    'adit',
    'vent',
    'winze',
    'bm.ore_cart',
    'bm.timber_crib',
    'bm.stope',
    'bm.nd_tin_0',
    'bm.nd_tin_1',
    'bm.nd_tin_2',
    'bm.nd_tin_3',
    'bm.nd_tin_4',
    'bm.nd_stone_0',
    'bm.nd_stone_1',
    'bm.tally_board',
    'bm.powder_kegs',
    'bm.ore_cart_0',
    'bm.sp_bats',
    'bm.sp_rats',
    'bm.rat_run',
  ],
  bp_deep: [
    'winze',
    'old_adit',
    'bd.refuge_bunk',
    'bd.ore_pillar',
    'bd.sump',
    'bd.nd_tin_0',
    'bd.nd_tin_1',
    'bd.nd_tin_2',
    'bd.nd_tin_3',
    'bd.nd_stone_0',
    'bd.nd_stone_1',
    'bd.nd_mush_0',
    'bd.nd_mush_1',
    'bd.refuge_table',
    'bd.tin_crate',
    'bd.sp_bats',
    'bd.sp_rats',
    'bd.rat_run',
  ],
};

const ids = maps.blackpine.scenes as readonly SceneId[];

/** The ids a room keeps whatever its dressing: never renamed or deleted, only moved. */
const keptIds = (id: SceneId) => {
  const s = scenes[id];
  return new Set(
    [s.spawns, s.spots, s.nodes ?? [], s.givers ?? [], s.props, s.spawners ?? [], s.paths].flatMap((l) =>
      l.map((x) => x.id),
    ),
  );
};

describe('Blackpine placement (art.md 4.1)', () => {
  it.each(ids)('%s', (id) => {
    expect(problemsOf(scenes[id])).toEqual(PENDING[id] ?? []);
  });

  it.each(ids)('%s keeps every id it had before round 8', (id) => {
    const kept = keptIds(id);
    for (const x of FROZEN[id] ?? []) expect(kept.has(x), `${id} ${x}`).toBe(true);
  });
});

describe('the Blackpine wall rules', () => {
  const smithy = () => structuredClone(scenes.bp_smithy);
  const solid = (s: Scene, x: number, y: number) => {
    s.grid[y] = s.grid[y]!.slice(0, x) + '#' + s.grid[y]!.slice(x + 1);
    s.material![y] = s.material![y]!.slice(0, x) + 'P' + s.material![y]!.slice(x + 1);
  };

  it('refuses a prop in the wall ring and a covered tile under nothing', () => {
    const s = smithy();
    solid(s, 10, 6);
    s.props.push({ id: 'bf.anvil_2', kind: 'decor', x: 10, y: 0 });
    expect(wallProblems(s)).toEqual(
      expect.arrayContaining([
        'prop bf.anvil_2 stands in the wall ring at 10,0 (it leaves a hole in the wall)',
        'covered tile 10,6 is under nothing',
      ]),
    );
  });

  it('refuses a creature loop over solid ground', () => {
    const s = structuredClone(scenes.bp_mine);
    const p = s.paths[0]!.points[0]!;
    solid(s, p.x, p.y);
    expect(wallProblems(s)).toContain(`path ${s.paths[0]!.id} runs over solid ground`);
  });
});
