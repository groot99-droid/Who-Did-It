import { describe, expect, it } from 'vitest';
import {
  Avatar,
  BUILD_VERSION,
  BodyState,
  CHAR_CELL_PX,
  GameState,
  EffectId,
  EffectState,
  Mob,
  Node,
  NotebookEntry,
  Player,
  Private,
  SCHEMA_VERSION,
  SceneState,
  Settings,
  TILE_PX,
  VIEW_TAG,
  pxToTiles,
  tilesToPx,
} from '../src';

describe('shared basics', () => {
  it('has a build version with a dev fallback', () => {
    expect(typeof BUILD_VERSION).toBe('string');
    expect(BUILD_VERSION.length).toBeGreaterThan(0);
  });

  it('keeps the frozen metrics', () => {
    expect(TILE_PX).toBe(64);
    expect(CHAR_CELL_PX).toBe(128);
    expect(pxToTiles(tilesToPx(3))).toBe(3);
  });

  it('builds state with defaults', () => {
    const s = new GameState();
    expect(SCHEMA_VERSION).toBe(6);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.settings).toBeInstanceOf(Settings);
    expect('mode' in s.settings).toBe(false);
    const p = new Player();
    p.name = 'Ada';
    s.players.set('a', p);
    expect(s.players.get('a')?.name).toBe('Ada');
  });

  it('adds the round-5 fields empty (deck/wire.md 1)', () => {
    expect(VIEW_TAG).toEqual({ presence: 1, priv: 2, ghost: 3, near: 4 });
    const p = new Player();
    expect(p.look).toBe('');
    const priv = new Private();
    expect([priv.sceneId, priv.avatar, priv.coverLook, priv.mateLooks.size]).toEqual([0, '', '', 0]);
    expect(new SceneState().avatars.size).toBe(0);
    const a = new Avatar();
    expect([a.lookOf, a.height, a.seat, a.statusBits]).toEqual(['', 0, '', 0]);
    const n = new NotebookEntry();
    expect([n.note, n.of]).toEqual([0, '']);
  });

  it('adds the round-6 fields empty (docs/round6/seams.md 1.1)', () => {
    const scene = new SceneState();
    expect([scene.nodes.size, scene.mobs.size]).toEqual([0, 0]);
    const node = new Node();
    expect([node.id, node.resource, node.active, node.respawnTick]).toEqual(['', '', false, 0]);
    const mob = new Mob();
    expect([mob.kind, mob.state, mob.animId]).toEqual(['', 0, 0]);
    const priv = new Private();
    expect(priv.quests.length).toBe(0);
    expect(priv.role.evolvedFrom).toBe('');
    expect(new GameState().lawStage).toBe(0);
    expect(new GameState().hq.size).toBe(0);
  });

  it('adds the round-7 profile empty (docs/round7/parties.md 2)', () => {
    expect(new Player().profile).toBe('');
    expect(new Private().vendetta).toBe('');
  });

  it('adds the round-8 body empty, own view only (docs/round8/seams.md 1)', () => {
    const priv = new Private();
    expect(priv.body).toBeInstanceOf(BodyState);
    expect([priv.body.hp, priv.body.maxHp, priv.body.stamina, priv.body.maxStamina]).toEqual([0, 0, 0, 0]);
    expect(priv.body.effects.length).toBe(0);
    const e = new EffectState();
    expect([e.id, e.untilTick, e.stacks]).toEqual([0, 0, 0]);
    // The effect ids are fixed by the contract and fit the u8 wire field.
    expect(EffectId).toEqual({
      slowed: 1,
      wounded: 2,
      bleeding: 3,
      weakened: 4,
      poisoned: 5,
      fatigued: 6,
      stunned: 7,
      dazed: 8,
      famished: 9,
      knockedOut: 10,
      indebted: 11,
      charm: 12, // reserved for 7M's well (6Z, 2026-10-24; GDD 3.22)
    });
  });
});
