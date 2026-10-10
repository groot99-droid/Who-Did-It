import { describe, expect, it } from 'vitest';
import {
  BUILD_VERSION,
  CHAR_CELL_PX,
  GameState,
  Player,
  Settings,
  TILE_PX,
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
    expect(s.schemaVersion).toBe(1);
    expect(s.settings).toBeInstanceOf(Settings);
    expect(s.settings.mode).toBe(0);
    const p = new Player();
    p.name = 'Ada';
    s.players.set('a', p);
    expect(s.players.get('a')?.name).toBe('Ada');
  });
});
