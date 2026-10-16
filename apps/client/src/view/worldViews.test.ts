import { describe, expect, it } from 'vitest';
import { parseAudioManifest } from './AudioBus';
import { formatTimer } from './Hud';
import { Lighting } from './Lighting';
import { entryText } from './NotebookPanel';
import { dirVector } from './ClueView';

describe('Lighting.darkness', () => {
  it('is 0 by day, 1 at night and eases through dusk', () => {
    expect(Lighting.darkness(3, 100)).toBe(0);
    expect(Lighting.darkness(5, 100)).toBe(1);
    expect(Lighting.darkness(4, 10_000)).toBe(0);
    expect(Lighting.darkness(4, 0)).toBe(1);
    const mid = Lighting.darkness(4, 100);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('parseAudioManifest', () => {
  it('reads the entries, sounds and bare-map shapes and ignores the rest', () => {
    expect(parseAudioManifest({ entries: [{ key: 'bell', url: 'bell.ogg', gain: 0.8 }] }).bell).toEqual({
      url: 'bell.ogg',
      gain: 0.8,
    });
    expect(parseAudioManifest({ sounds: { pickup: { url: 'p.ogg', gain: 0.5 } } }).pickup).toEqual({
      url: 'p.ogg',
      gain: 0.5,
    });
    expect(parseAudioManifest({ scream: 's.ogg', junk: 3 })).toEqual({ scream: { url: 's.ogg', gain: 1 } });
    expect(parseAudioManifest(null)).toEqual({});
  });
});

describe('Notebook text and HUD time', () => {
  it('names the clue and the trait value', () => {
    expect(entryText({ clueKind: 0, value: 2 })).toBe('Footprints, long stride: Tall');
    expect(entryText({ clueKind: 1, value: 0 })).toBe('Thread, red wool: Red scarf');
  });
  it('formats m:ss from ticks', () => {
    expect(formatTimer(null)).toBe('--:--');
    expect(formatTimer(20 * 75)).toBe('1:15');
  });
});

describe('dirVector', () => {
  it('maps the direction index clockwise from screen up', () => {
    expect(dirVector(0).y).toBeCloseTo(-1);
    expect(dirVector(2).x).toBeCloseTo(1);
    expect(dirVector(4).y).toBeCloseTo(1);
  });
});
