import { describe, expect, it } from 'vitest';
import {
  balance,
  biomeOf,
  MAP_IDS,
  maps,
  PROFILE_RANK,
  routines,
  SCENE_IDS,
  scenes,
  type Profile,
  type Scene,
} from '../src/index.js';
import { flood, opensAt, sceneFiles, touches } from './helpers.js';

/** WORLD 4.3, copied by hand so a data edit cannot silently move a frozen id, size or profile. */
const WORLD: Record<string, { profile: Profile; w: number; h: number; portals: string[] }> = {
  overworld: {
    profile: 'small',
    w: 64,
    h: 48,
    portals: [
      'ov.tavern_front -> tavern_bar.front',
      'ov.tavern_alley -> tavern_bar.alley',
      'ov.apoth -> apoth_shop.door',
      'ov.bakery -> bakery.door',
      'ov.widow -> widow_parlour.door',
      'ov.forest_gate -> forest.gate',
      'ov.manor_front -> manor_hall.front',
      'ov.manor_back -> manor_hall.back',
      'ov.barn -> barn.door',
      'ov.chapel -> chapel.door',
      'ov.well -> cellar.well',
    ],
  },
  tavern_bar: {
    profile: 'small',
    w: 20,
    h: 12,
    portals: [
      'tb.front -> overworld.tavern_front',
      'tb.alley -> overworld.tavern_alley',
      'tb.back -> tavern_back.door',
    ],
  },
  tavern_back: {
    profile: 'small',
    w: 12,
    h: 10,
    portals: ['tk.door -> tavern_bar.back', 'tk.trap -> cellar.trap'],
  },
  apoth_shop: {
    profile: 'small',
    w: 18,
    h: 11,
    portals: ['as.door -> overworld.apoth', 'as.stairs -> apoth_loft.stairs'],
  },
  apoth_loft: { profile: 'small', w: 12, h: 9, portals: ['al.stairs -> apoth_shop.stairs'] },
  widow_parlour: {
    profile: 'small',
    w: 16,
    h: 11,
    portals: ['wp.door -> overworld.widow', 'wp.bedroom -> widow_bedroom.door'],
  },
  widow_bedroom: { profile: 'small', w: 12, h: 9, portals: ['wb.door -> widow_parlour.bedroom'] },
  forest: {
    profile: 'small',
    w: 40,
    h: 30,
    portals: [
      'fo.gate -> overworld.forest_gate',
      'fo.log -> overworld.forest_back',
      'fo.cave -> cave_entry.mouth',
      'fo.deep -> forest_deep.wood_side',
    ],
  },
  bakery: {
    profile: 'small',
    w: 18,
    h: 11,
    portals: [
      'bk.door -> overworld.bakery',
      'bk.oven_room -> crumb_oven.door',
      'bk.mixing_room -> crumb_mixing.door',
      'bk.proofing_room -> crumb_proofing.door',
      'bk.cold_room -> crumb_cold.door',
    ],
  },
  cave_entry: {
    profile: 'small',
    w: 20,
    h: 14,
    portals: ['ce.mouth -> forest.cave_side', 'ce.sea -> null.null', 'ce.gallery -> cave_gallery.upper'],
  },
  manor_hall: {
    profile: 'medium',
    w: 28,
    h: 16,
    portals: [
      'mh.front -> overworld.manor_front',
      'mh.back -> overworld.manor_back',
      'mh.stairs -> manor_upper.stairs',
    ],
  },
  manor_upper: {
    profile: 'medium',
    w: 24,
    h: 12,
    portals: ['mu.stairs -> manor_hall.stairs', 'mu.balcony -> overworld.balcony_drop'],
  },
  barn: {
    profile: 'medium',
    w: 20,
    h: 12,
    portals: ['ba.door -> overworld.barn', 'ba.loft -> overworld.barn_loft_drop'],
  },
  chapel: {
    profile: 'large',
    w: 18,
    h: 12,
    portals: ['ch.door -> overworld.chapel', 'ch.crypt -> cellar.crypt'],
  },
  cellar: {
    profile: 'large',
    w: 28,
    h: 16,
    portals: ['cl.well -> overworld.well', 'cl.trap -> tavern_back.trap', 'cl.crypt -> chapel.crypt'],
  },
  // Round 5 (A50, docs/round5/world.md 8): Hollowmere's second wood and cave, both Medium (F4).
  forest_deep: {
    profile: 'medium',
    w: 48,
    h: 36,
    portals: [
      'fd.wood -> forest.deep_side',
      'fd.adit -> cave_gallery.fen',
      'fd.sinkhole -> cave_gallery.sink_landing',
    ],
  },
  cave_gallery: {
    profile: 'medium',
    w: 40,
    h: 28,
    portals: ['cg.upper -> cave_entry.gallery', 'cg.fen -> forest_deep.adit_side'],
  },
  // Blackpine (A50, docs/round5/world.md 6.2 and 8.3-8.10).
  bp_camp: {
    profile: 'small',
    w: 56,
    h: 40,
    portals: [
      'bc.lodge -> bp_lodge.front',
      'bc.lodge_side -> bp_lodge.side',
      'bc.mill -> bp_mill.door',
      'bc.mill_yard -> bp_mill.yard',
      'bc.office -> bp_office.door',
      'bc.smithy -> bp_smithy.door',
      'bc.woods -> bp_woods.camp',
      'bc.adit -> bp_mine.adit',
    ],
  },
  bp_lodge: {
    profile: 'small',
    w: 24,
    h: 12,
    portals: ['bl.front -> bp_camp.lodge', 'bl.side -> bp_camp.lodge_side'],
  },
  bp_mill: {
    profile: 'small',
    w: 24,
    h: 14,
    portals: ['bs.door -> bp_camp.mill', 'bs.yard -> bp_camp.mill_yard'],
  },
  bp_woods: {
    profile: 'small',
    w: 52,
    h: 40,
    portals: [
      'bw.camp -> bp_camp.woods',
      'bw.vent -> bp_mine.vent',
      'bw.chute -> bp_camp.chute_foot',
      'bw.old_adit -> bp_deep.old_adit',
    ],
  },
  bp_mine: {
    profile: 'small',
    w: 44,
    h: 30,
    portals: ['bm.adit -> bp_camp.adit', 'bm.vent -> bp_woods.vent', 'bm.winze -> bp_deep.winze'],
  },
  bp_office: {
    profile: 'medium',
    w: 18,
    h: 11,
    portals: ['bo.door -> bp_camp.office'],
  },
  bp_smithy: {
    profile: 'medium',
    w: 16,
    h: 11,
    portals: ['bf.door -> bp_camp.smithy'],
  },
  bp_deep: {
    profile: 'large',
    w: 40,
    h: 28,
    portals: ['bd.winze -> bp_mine.winze', 'bd.old_adit -> bp_woods.old_adit'],
  },
  // Round 7 (A116, A118): Crumb's Ovens' four station rooms.
  crumb_cold: { profile: 'small', w: 12, h: 9, portals: ['cf.door -> bakery.cold_room'] },
  crumb_mixing: { profile: 'small', w: 12, h: 9, portals: ['cm.door -> bakery.mixing_room'] },
  crumb_oven: { profile: 'small', w: 12, h: 10, portals: ['co.door -> bakery.oven_room'] },
  crumb_proofing: { profile: 'small', w: 12, h: 10, portals: ['cp.door -> bakery.proofing_room'] },
};

const PROFILES: Profile[] = ['small', 'medium', 'large'];
const all = Object.values(scenes);
const v1Open = (p: Scene['portals'][number], at: Profile) =>
  p.ships === 'V1' && p.to !== null && opensAt(p.minProfile, at);

describe('scene graph (WORLD 4.3)', () => {
  it('has exactly the frozen scenes, one file each', () => {
    expect([...SCENE_IDS].sort()).toEqual(Object.keys(WORLD).sort());
    expect(sceneFiles()).toEqual([...SCENE_IDS].sort());
  });

  it("keeps every scene's profile, size and portal ids as WORLD 4.3 lists them", () => {
    for (const [id, w] of Object.entries(WORLD)) {
      const s = scenes[id as keyof typeof scenes];
      expect(s.profile, id).toBe(w.profile);
      expect(s.size, id).toEqual({ w: w.w, h: w.h });
      expect(s.portals.map((p) => `${p.id} -> ${p.to}.${p.toSpawn}`).sort(), id).toEqual(
        [...w.portals].sort(),
      );
    }
  });

  it('resolves every portal target to an existing scene and spawn', () => {
    for (const s of all) {
      for (const p of s.portals) {
        if (p.to === null) {
          expect(p.ships, p.id).not.toBe('V1');
          continue;
        }
        const target = scenes[p.to as keyof typeof scenes];
        expect(target, p.id).toBeDefined();
        expect(
          target.spawns.map((sp) => sp.id),
          p.id,
        ).toContain(p.toSpawn);
      }
    }
  });

  it('uses globally unique portal ids', () => {
    const ids = all.flatMap((s) => s.portals.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks one-way drops, the hollow log and the boarded sea passage', () => {
    const oneWay = all.flatMap((s) => s.portals.filter((p) => p.oneWay).map((p) => p.id));
    expect(oneWay.sort()).toEqual(['ba.loft', 'bw.chute', 'fd.sinkhole', 'fo.log', 'mu.balcony']);
    const sea = scenes.cave_entry.portals.find((p) => p.id === 'ce.sea');
    expect(sea).toMatchObject({ window: 'lowTide', ships: 'V1.5' });
  });
});

describe('grids', () => {
  it('match the declared size exactly', () => {
    for (const s of all) {
      expect(s.grid, s.id).toHaveLength(s.size.h);
      for (const row of s.grid) expect(row, s.id).toHaveLength(s.size.w);
    }
  });

  it('put every D on a portal and every portal on a D', () => {
    for (const s of all) {
      const doors = s.grid.flatMap((row, y) =>
        [...row].flatMap((ch, x) => (ch === 'D' ? [`${x},${y}`] : [])),
      );
      expect(doors.sort(), s.id).toEqual(s.portals.map((p) => `${p.x},${p.y}`).sort());
    }
  });

  it('put every S, H and B on a spawn, hiding spot or body spot and back', () => {
    for (const s of all) {
      const tiles = (ch: string) =>
        s.grid.flatMap((row, y) => [...row].flatMap((c, x) => (c === ch ? [`${x},${y}`] : []))).sort();
      expect(tiles('S'), s.id).toEqual(s.spawns.map((p) => `${p.x},${p.y}`).sort());
      const at = (kind: string) => s.spots.filter((p) => p.kind === kind).map((p) => `${p.x},${p.y}`);
      expect(tiles('H'), s.id).toEqual(at('hide').sort());
      expect(tiles('B'), s.id).toEqual(at('body').sort());
    }
  });

  it('are walled at the border except where a portal opens', () => {
    for (const s of all) {
      const { w, h } = s.size;
      for (let x = 0; x < w; x++)
        for (const y of [0, h - 1]) expect('#D', `${s.id} ${x},${y}`).toContain(s.grid[y]![x]);
      for (let y = 0; y < h; y++)
        for (const x of [0, w - 1]) expect('#D', `${s.id} ${x},${y}`).toContain(s.grid[y]![x]);
    }
  });

  it('have spawns for every player around the square', () => {
    const square = scenes.overworld.spawns.filter((s) => s.id.startsWith('square_'));
    expect(square).toHaveLength(balance.players.max);
  });
});

describe('profile gating', () => {
  it('opens a portal only when both of its scenes are open', () => {
    for (const s of all) {
      for (const p of s.portals) {
        if (p.to === null) continue;
        const target = scenes[p.to as keyof typeof scenes];
        const need = Math.max(PROFILE_RANK[s.profile], PROFILE_RANK[target.profile]);
        expect(PROFILE_RANK[p.minProfile], p.id).toBe(need);
      }
    }
  });

  it('shuts the Manor Rise and the paddock below Medium', () => {
    expect(scenes.overworld.gates.map((g) => [g.id, g.minProfile])).toEqual([
      ['ov.gate_manor', 'medium'],
      ['ov.gate_paddock', 'medium'],
    ]);
  });

  for (const profile of PROFILES) {
    it(`connects every ${profile}-profile scene into one walkable world`, () => {
      const open = all.filter((s) => opensAt(s.profile, profile));
      for (const s of open) {
        // Every spawn an open portal lands on, plus the square spawns, is one walkable region.
        const landing = all.flatMap((from) =>
          from.portals.filter((p) => v1Open(p, profile) && p.to === s.id).map((p) => p.toSpawn),
        );
        const seeds = s.spawns.filter((sp) => landing.includes(sp.id) || sp.id.startsWith('square_'));
        expect(seeds.length, `${s.id} at ${profile}`).toBeGreaterThan(0);
        const reached = flood(s, profile, seeds[0]!.x, seeds[0]!.y);
        for (const sp of seeds)
          expect(reached.has(`${sp.x},${sp.y}`), `${s.id}.${sp.id} at ${profile}`).toBe(true);
        for (const p of s.portals.filter((q) => v1Open(q, profile))) {
          expect(touches(reached, p.x, p.y), `${p.id} reachable at ${profile}`).toBe(true);
        }
        for (const spot of s.spots) {
          const insideShutGate = !touches(flood(s, 'large', seeds[0]!.x, seeds[0]!.y), spot.x, spot.y);
          if (!insideShutGate)
            expect(touches(reached, spot.x, spot.y), `${spot.id} at ${profile}`).toBe(true);
        }
      }
      // Every open scene is reachable from its map's hub through open portals, over that map's scenes.
      for (const id of MAP_IDS) {
        const map = maps[id];
        const seen = new Set<string>([map.hub]);
        const queue: string[] = [map.hub];
        while (queue.length) {
          const s = scenes[queue.shift()! as keyof typeof scenes];
          for (const p of s.portals) {
            if (v1Open(p, profile) && !seen.has(p.to!)) {
              seen.add(p.to!);
              queue.push(p.to!);
            }
          }
        }
        const inMap = open.filter((s) => (map.scenes as readonly string[]).includes(s.id));
        expect([...seen].sort(), id).toEqual(inMap.map((s) => s.id).sort());
      }
    });
  }

  it('keeps Medium content behind the gates at Small', () => {
    const ow = scenes.overworld;
    const square = ow.spawns.find((s) => s.id === 'square_0')!;
    const small = flood(ow, 'small', square.x, square.y);
    const medium = flood(ow, 'medium', square.x, square.y);
    for (const id of ['manor_front', 'manor_back', 'balcony_drop', 'barn', 'barn_loft_drop']) {
      const sp = ow.spawns.find((s) => s.id === id)!;
      expect(small.has(`${sp.x},${sp.y}`), id).toBe(false);
      expect(medium.has(`${sp.x},${sp.y}`), id).toBe(true);
    }
  });
});

describe('forest (WORLD 4.3, GDD 3.6)', () => {
  const forest = scenes.forest;
  const gate = forest.spawns.find((s) => s.id === 'gate')!;

  it('has three wolf loops on open ground outside the gate clearing', () => {
    expect(forest.paths.filter((p) => p.kind === 'wolfLoop')).toHaveLength(balance.wolves.count);
    for (const loop of forest.paths) {
      const pts = [...loop.points, loop.points[0]!];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        expect(a.x === b.x || a.y === b.y, `${loop.id} runs orthogonally`).toBe(true);
        const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        for (let t = 0; t <= steps; t++) {
          const x = a.x + Math.sign(b.x - a.x) * t;
          const y = a.y + Math.sign(b.y - a.y) * t;
          expect(forest.grid[y]![x], `${loop.id} at ${x},${y}`).toBe('.');
          expect(Math.hypot(x - gate.x, y - gate.y), `${loop.id} clears the gate`).toBeGreaterThan(
            balance.wolves.gateClearingTiles,
          );
        }
      }
    }
  });

  it('keeps the gate clearing free of trees', () => {
    const r = balance.wolves.gateClearingTiles;
    forest.grid.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const inside = x > 0 && y > 0 && x < forest.size.w - 1 && y < forest.size.h - 1;
        if (inside && Math.hypot(x - gate.x, y - gate.y) <= r) expect(ch, `${x},${y}`).not.toBe('#');
      }),
    );
  });
});

describe('quick-mode bakery (GDD 3.11)', () => {
  it("has 10 plates, the dead's 3 loaves and the ledger", () => {
    const kinds = scenes.bakery.props.map((p) => p.kind);
    expect(kinds.filter((k) => k === 'plate')).toHaveLength(balance.players.max);
    expect(kinds.filter((k) => k === 'deadLoaf')).toHaveLength(3);
    expect(kinds).toContain('ledger');
  });
});

describe("Crumb's Ovens' station rooms (A116, A118)", () => {
  const rooms = ['crumb_cold', 'crumb_mixing', 'crumb_oven', 'crumb_proofing'] as const;
  it('are small lit house interiors on Hollowmere, each with one door back to the bakery', () => {
    for (const id of rooms) {
      const s = scenes[id];
      expect([s.profile, s.kind, biomeOf(s), s.dark], id).toEqual(['small', 'interior', 'house', false]);
      expect(maps.hollowmere.scenes, id).toContain(id);
      expect(
        s.portals.map((p) => p.to),
        id,
      ).toEqual(['bakery']);
      expect(
        scenes.bakery.portals.filter((p) => p.to === id),
        id,
      ).toHaveLength(1);
    }
  });
  it('hold one spawn, one hiding spot, one body spot and a light each', () => {
    for (const id of rooms) {
      const s = scenes[id];
      expect(s.spawns, id).toHaveLength(1);
      expect(s.spots.map((p) => p.kind).sort(), id).toEqual(['body', 'hide']);
      expect(s.lights?.length, id).toBeGreaterThan(0);
    }
  });
  it('stand their station prop on a solid footprint, as a work station of the routines', () => {
    const station = {
      crumb_cold: 'coldShelves',
      crumb_mixing: 'doughMixer',
      crumb_oven: 'brickOven',
      crumb_proofing: 'proofingCabinet',
    };
    for (const id of rooms) {
      const s = scenes[id];
      expect(
        s.props.map((p) => p.kind),
        id,
      ).toEqual([station[id]]);
      expect(routines.activities.work?.kinds, id).toContain(station[id]);
      const f = s.props[0]!.footprint!;
      for (let y = f.y; y < f.y + f.h; y++)
        for (let x = f.x; x < f.x + f.w; x++) {
          expect(s.grid[y]![x], `${id} ${x},${y}`).toBe('#');
          expect(s.material?.[y]![x], `${id} ${x},${y}`).toBe('P');
        }
    }
  });
});
