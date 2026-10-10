import { describe, expect, it } from 'vitest';
import {
  abilities,
  balance,
  balanceFor,
  clues,
  content,
  items,
  metrics,
  onubRoles,
  palette,
  PLAYER_COUNTS,
  profileFor,
  roles,
  rosterFor,
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
      ...Object.values(roles.rosters),
      ...Object.values(balance.byCount),
      ...Object.values(onubRoles.roles),
    ];
    for (const r of records) expect(r.gddRef).toMatch(/^3(\.\d+)?$/);
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
    expect(metrics.maxStandingSilhouettePx).toBe(90);
    expect(metrics.overworldTiles).toEqual({ w: 64, h: 48 });
    expect(Math.round(Math.cos((metrics.camera.tiltXDeg * Math.PI) / 180) * 100) / 100).toBe(
      metrics.camera.verticalSquash,
    );
  });

  it("keeps the style token short and inside the formula's palette", () => {
    expect(style.styleToken.length).toBeLessThanOrEqual(120);
    for (const hex of style.styleFormula.match(/#[0-9A-F]{6}/g) ?? []) {
      expect(Object.values(palette.colors)).toContain(hex);
    }
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

describe('rosters (GDD 3.1)', () => {
  const cabal = (n: number) => rosterFor(n).deal.filter((r) => roles.roles[r]?.faction === 'cabal').length;
  const count = (n: number, role: string) => rosterFor(n).deal.filter((r) => r === role).length;

  it('has a row for every count from 4 to 10 that deals exactly one role per player', () => {
    for (const n of PLAYER_COUNTS) expect(rosterFor(Number(n)).deal).toHaveLength(Number(n));
    expect(() => rosterFor(3)).toThrow(RangeError);
    expect(() => rosterFor(11)).toThrow(RangeError);
  });

  it('matches the Cabal column of GDD 3.9', () => {
    expect([4, 5, 6, 7, 8, 9, 10].map(cabal)).toEqual([1, 1, 1, 2, 2, 2, 3]);
    expect(count(10, 'killer')).toBe(2);
  });

  it('always has a Detective and a Killer, and at least one Townsfolk', () => {
    for (let n = 4; n <= 10; n++) {
      expect(count(n, 'detective')).toBe(1);
      expect(count(n, 'killer')).toBeGreaterThanOrEqual(1);
      expect(count(n, 'townsfolk')).toBeGreaterThanOrEqual(1);
    }
  });

  it('adds specials at the GDD counts', () => {
    const first = (role: string) => [4, 5, 6, 7, 8, 9, 10].find((n) => count(n, role) > 0);
    expect(first('doctor')).toBe(5);
    expect(first('butler')).toBe(6);
    expect(first('accomplice')).toBe(7);
    expect(first('child')).toBe(8);
    expect(first('drifter')).toBe(10);
  });

  it('deals Townsfolk where the Ranger is planned until it ships', () => {
    expect(rosterFor(9).planned).toContain('ranger');
    expect(rosterFor(9).deal).not.toContain('ranger');
    expect(count(9, 'townsfolk')).toBe(3);
    expect(count(10, 'townsfolk')).toBe(2);
  });

  it('marks only 4 as practice', () => {
    expect(PLAYER_COUNTS.filter((n) => rosterFor(Number(n)).practice)).toEqual(['4']);
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

  it('makes a cycle of 200 s from day, dusk and night', () => {
    const { dayS, duskS, nightS } = balance.phases;
    expect(dayS + duskS + nightS).toBe(200);
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
        if (k.item === 'forgedAlibi') continue; // the Accomplice's V1.5 kit item
        expect(items.items[k.item]?.ships, `${role.id} ${k.item}`).toBe('V1');
      }
    }
  });
});

describe('role secrecy in public ids', () => {
  const roleTokens = new Set(
    [...Object.keys(roles.roles), ...Object.keys(onubRoles.roles)].map((id) => id.toLowerCase()),
  );
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
