import { describe, expect, it } from 'vitest';
import {
  Avatar,
  BUILD_VERSION,
  CHAR_CELL_PX,
  GameState,
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

  it('builds state with defaults and a mode field', () => {
    const s = new GameState();
    expect(SCHEMA_VERSION).toBe(2);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.settings).toBeInstanceOf(Settings);
    expect(s.settings.mode).toBe(0);
    const p = new Player();
    p.name = 'Ada';
    s.players.set('a', p);
    expect(s.players.get('a')?.name).toBe('Ada');
  });

  it('adds the round-5 fields empty (deck/wire.md 1)', () => {
    expect(VIEW_TAG).toEqual({ presence: 1, priv: 2, ghost: 3 });
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
});
