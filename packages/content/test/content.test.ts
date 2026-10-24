import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  abilities,
  balance,
  balanceFor,
  clues,
  content,
  deckFor,
  items,
  looks,
  LooksFile,
  metrics,
  palette,
  PLAYER_COUNTS,
  profileFor,
  roles,
  scenes,
  style,
  tasks,
  traits,
  validateContent,
} from '../src/index.js';

describe('content package', () => {
  it('validates at import with no cross-file problems', () => {
    expect(validateContent(content)).toEqual([]);
  });

  it('carries a gddRef on every rules record', () => {
    const records = [
      ...Object.values(roles.roles),
      ...Object.values(abilities.abilities),
      ...Object.values(items.items),
      ...Object.values(clues.clues),
      ...Object.values(tasks.tasks),
      ...Object.values(roles.decks),
      ...Object.values(balance.byCount),
    ];
    for (const r of records) expect(r.gddRef).toMatch(/^3(\.\d+)?$/);
  });
});

describe('looks.json villagers (round 8, DECISIONS A161)', () => {
  it('holds the plain villager and its variants, every id and atlas key under `villager`', () => {
    const family = Object.values(looks.villagers);
    expect(family.map((v) => v.id)).toEqual([
      'villager',
      'villagerelder',
      'villagergoodwife',
      'villagerlass',
      'villagerclerk',
    ]);
    for (const v of family) expect([v.bodyAtlas, v.overlayAtlas]).toEqual([`char_${v.id}`, `ovl_${v.id}`]);
  });

  it('rejects a villager entry with an unknown key, one without the plain base, and one with a card field', () => {
    const raw = structuredClone(looks);
    const extra = structuredClone(raw);
    (extra.villagers.villagerelder as Record<string, unknown>).hat = 'bowler';
    expect(LooksFile.safeParse(extra).success).toBe(false);
    const card = structuredClone(raw);
    (card.villagers.villagerelder as Record<string, unknown>).portrait = 'portrait_villagerelder';
    expect(LooksFile.safeParse(card).success).toBe(false);
    const { villager: _base, ...rest } = raw.villagers;
    expect(LooksFile.safeParse({ ...raw, villagers: rest }).success).toBe(false);
    expect(LooksFile.safeParse(raw).success).toBe(true);
  });
});

describe('palette and metrics (ASSETS 6.1, WORLD 4.2)', () => {
  it('holds the ten palette tokens', () => {
    expect(palette.colors).toEqual({
      ink: '#12141C',
      slate: '#2C3240',
      fog: '#6F7A8C',
      bone: '#D9D2C2',
      mustard: '#F2B33D',
      teal: '#2EC4B6',
      magenta: '#E04E9A',
      blood: '#B3121F',
      lantern: '#FFB457',
      moon: '#7FA8FF',
    });
  });

  it('locks the tile and character metrics', () => {
    expect(metrics.tilePx).toBe(64);
    expect(metrics.characterCellPx).toBe(128);
    expect(metrics.maxStandingSilhouettePx).toBe(112);
    expect(metrics.maxSilhouetteTiles).toBe(1.75);
    expect(metrics.characterHeadsTall).toBe(4);
    expect(metrics.overworldTiles).toEqual({ w: 64, h: 48 });
    expect(Math.round(Math.cos((metrics.camera.tiltXDeg * Math.PI) / 180) * 100) / 100).toBe(
      metrics.camera.verticalSquash,
    );
  });

  it("keeps the style token short and inside the formula's palette", () => {
    expect(style.styleToken.length).toBeLessThanOrEqual(120);
    for (const text of [style.styleFormula, ...Object.values(style.compositions)]) {
      for (const hex of text.match(/#[0-9A-F]{6}/gi) ?? []) {
        expect(Object.values(palette.colors)).toContain(hex);
      }
    }
  });
});

/** 8-bit sRGB '#RRGGBB' to OKLab [L, a, b] (Björn Ottosson, 2020), for the palette spacing check. */
function oklab(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin((n >> 16) & 0xff), lin((n >> 8) & 0xff), lin(n & 0xff)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

describe('the world palette (ASSETS 6.1)', () => {
  const ramps = Object.values(palette.world.ramps);
  const world = [...new Set(ramps.flat())];

  it('is the union of the ramps: 64 distinct colours', () => {
    expect(world).toHaveLength(64);
  });

  it('holds every token but magenta, which is in no ramp', () => {
    const { magenta, ...rest } = palette.colors;
    for (const [token, hex] of Object.entries(rest)) expect(world, token).toContain(hex);
    expect(world).not.toContain(magenta);
  });

  it('lists only ramp colours as saturated', () => {
    for (const hex of palette.world.saturated) expect(world).toContain(hex);
  });

  it('keeps every two colours at least 0.02 apart in OKLab', () => {
    const labs = world.map((hex) => [hex, oklab(hex)] as const);
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) {
        const [p, q] = [labs[i]![1], labs[j]![1]];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        expect(d, `${labs[i]![0]} ${labs[j]![0]}`).toBeGreaterThanOrEqual(0.02);
      }
    }
  });
});

describe('the style formula and the pixel finish (ASSETS 6.4, 6.11)', () => {
  const repo = fileURLToPath(new URL('../../../', import.meta.url));

  it('keys only the object and figure compositions', () => {
    const keyed = Object.entries(style.compositions)
      .filter(([, text]) => text.includes('{KEY}'))
      .map(([c]) => c);
    expect(keyed.sort()).toEqual(['figure', 'object']);
  });

  it('points every reference at an owner image on disk', () => {
    for (const refs of Object.values(style.references)) {
      for (const r of refs) expect(existsSync(repo + r.file), r.file).toBe(true);
    }
  });

  it('proposes the pixel finish for the main mode (ruling F15)', () => {
    expect(style.pixelFinish.enabled).toEqual({ main: true });
  });

  it('ships the 8-bit and low-poly art styles, 8-bit by default, HD reserved (A79)', () => {
    const a = style.artStyles;
    expect(a.default).toBe('8bit');
    expect(a.reserved).toEqual(['hd']);
    expect(a.styles.map((s) => [s.id, s.pixelFinish, s.filter, s.root])).toEqual([
      ['8bit', true, 'nearest', ''],
      ['lowpoly', false, 'linear', 'lowpoly/'],
    ]);
    for (const s of a.styles) expect(s.drawScale, s.id).toBe(metrics.iso.artScale);
  });
});

describe('traits (GDD 3.1)', () => {
  it('deals 27 unique combinations', () => {
    const combos = new Set<string>();
    for (const h of traits.axes.height.values)
      for (const s of traits.axes.scarf.values)
        for (const t of traits.axes.hat.values) combos.add(`${h.id}/${s.id}/${t.id}`);
    expect(combos.size).toBe(27);
  });

  it('scales height 0.9 / 1.0 / 1.1 and maps scarves to distinct shapes', () => {
    expect(traits.axes.height.values.map((v) => v.spriteScale)).toEqual([0.9, 1, 1.1]);
    expect(new Set(traits.axes.scarf.values.map((v) => v.nameplateShape)).size).toBe(3);
    expect(new Set(traits.axes.scarf.values.map((v) => v.tint)).size).toBe(3);
  });
});

describe('decks (GDD 3.1, 3.9)', () => {
  const cards = (n: number) => deckFor(n).cards;
  const cabal = (n: number) => cards(n).filter((r) => roles.roles[r]?.faction === 'cabal').length;
  const count = (n: number, role: string) => cards(n).filter((r) => r === role).length;

  it('has a row for every count from 4 to 10 with player count + 2 cards', () => {
    for (const n of PLAYER_COUNTS) expect(deckFor(Number(n)).cards).toHaveLength(Number(n) + 2);
    expect(() => deckFor(3)).toThrow(RangeError);
    expect(() => deckFor(11)).toThrow(RangeError);
  });

  it('holds the Cabal cards of GDD 3.9 (the Accomplice and Drifter may stay in the box)', () => {
    expect([4, 5, 6, 7, 8, 9, 10].map(cabal)).toEqual([1, 1, 1, 2, 2, 2, 2]);
    expect(count(10, 'killer')).toBe(2);
    for (let n = 4; n <= 10; n++) expect(count(n, 'killer')).toBeGreaterThanOrEqual(1);
  });

  it('adds specials at the GDD counts', () => {
    const first = (role: string) => [4, 5, 6, 7, 8, 9, 10].find((n) => count(n, role) > 0);
    expect(first('vicar')).toBe(4);
    expect(first('drifter')).toBe(5);
    expect(first('doctor')).toBe(5);
    expect(first('watchman')).toBe(6);
    expect(first('accomplice')).toBe(7);
    expect(first('herbalist')).toBe(8);
    expect(first('gamekeeper')).toBe(9);
    expect(first('tinner')).toBe(10);
  });

  it('never lists the Townsfolk class row, only its professions', () => {
    for (let n = 4; n <= 10; n++) expect(count(n, 'townsfolk')).toBe(0);
    expect(count(5, 'lamplighter') + count(5, 'baker')).toBe(2);
  });

  it('marks only 4 as practice', () => {
    expect(PLAYER_COUNTS.filter((n) => deckFor(Number(n)).practice)).toEqual(['4']);
  });

  it('gives every card at most 3 abilities and Townsfolk two bell pulls', () => {
    for (const role of Object.values(roles.roles)) expect(role.abilities.length).toBeLessThanOrEqual(3);
    expect(roles.roles.townsfolk?.bellPulls).toBe(2);
    expect(roles.roles.killer?.bellPulls).toBe(1);
  });
});

describe('balance (GDD 3.3, 3.9)', () => {
  it('copies the per-count table', () => {
    const col = <K extends keyof ReturnType<typeof balanceFor>>(k: K) =>
      [4, 5, 6, 7, 8, 9, 10].map((n) => balanceFor(n)[k]);
    expect(col('killCooldownS')).toEqual([60, 60, 35, 35, 30, 30, 40]);
    expect(col('discussionS')).toEqual([60, 60, 75, 75, 90, 90, 90]);
    expect(col('tasksEach')).toEqual([3, 3, 4, 4, 4, 4, 5]);
    expect(col('globalKillLockS')).toEqual([0, 0, 0, 0, 0, 0, 15]);
    expect(col('cabalWin')).toEqual(['villageAtMostOne', 'villageAtMostOne', ...Array(5).fill('parity')]);
  });

  it('makes a cycle of 230 s from day, dusk and night', () => {
    const { dayS, duskS, nightS } = balance.phases;
    expect(dayS + duskS + nightS).toBe(230);
  });

  it('gates the Killer Lock at 6+ players', () => {
    expect(abilities.abilities.killerLock?.minPlayers).toBe(6);
  });

  it('maps player counts to scene profiles', () => {
    expect([4, 5, 6, 7, 8, 9, 10].map(profileFor)).toEqual([
      'small',
      'small',
      'small',
      'medium',
      'medium',
      'large',
      'large',
    ]);
  });
});

describe('NPC fill (GDD 3.12)', () => {
  it('has three difficulty rows that get harsher in order', () => {
    const { easy, normal, hard } = balance.npc.difficulty;
    expect(balance.npc.defaultDifficulty).toBe('normal');
    expect(easy.killChancePer10s).toBeLessThan(normal.killChancePer10s);
    expect(normal.killChancePer10s).toBeLessThan(hard.killChancePer10s);
    expect(easy.reportDelayS).toBeGreaterThan(normal.reportDelayS);
    expect(normal.reportDelayS).toBeGreaterThan(hard.reportDelayS);
    expect(easy.plantsPerNight).toBeLessThanOrEqual(normal.plantsPerNight);
    expect(normal.plantsPerNight).toBeLessThanOrEqual(hard.plantsPerNight);
  });

  it('turns difficulty on only with enough NPC seats to fill a party', () => {
    expect(balance.npc.difficultyMinNpcs).toBeGreaterThan(0);
    expect(balance.npc.difficultyMinNpcs).toBeLessThan(balance.players.max);
  });
});

describe('items (GDD 3.5)', () => {
  it('keeps the Knife bound and lets the Magnifier drop as an Inspect station', () => {
    expect(items.items.knife).toMatchObject({ roleBound: true, onDeath: 'kept' });
    expect(items.items.magnifier).toMatchObject({ roleBound: true, onDeath: 'inspectStation' });
    expect(items.inventorySlots).toBe(5);
  });

  it('gives every V1 start kit item a V1 record', () => {
    for (const role of Object.values(roles.roles)) {
      if (role.ships !== 'V1') continue;
      for (const k of role.startKit) {
        expect(items.items[k.item]?.ships, `${role.id} ${k.item}`).toBe('V1');
      }
    }
  });
});

describe('role secrecy in public ids', () => {
  const roleTokens = new Set(Object.keys(roles.roles).map((id) => id.toLowerCase()));
  const tokens = (id: string) =>
    id
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .split(/[._/]/)
      .concat(id.toLowerCase().split(/[._/]/));

  it('never names a role in body ids, overlay passes, trait values or scene object ids', () => {
    const publicIds = [
      ...traits.bodies.map((b) => b.id),
      ...traits.overlayPasses,
      ...Object.values(traits.axes).flatMap((a) => a.values.map((v) => v.id)),
      ...Object.values(scenes).flatMap((s) => [
        s.id,
        ...s.portals.map((p) => p.id),
        ...s.spawns.map((p) => p.id),
        ...s.spots.map((p) => `${p.id}.${p.variant}`),
        ...s.props.map((p) => `${p.id}.${p.kind}`),
      ]),
    ];
    for (const id of publicIds) {
      for (const t of tokens(id)) expect(roleTokens.has(t), `${id} names role ${t}`).toBe(false);
    }
  });
});
