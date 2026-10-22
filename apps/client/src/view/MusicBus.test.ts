import { describe, expect, it, vi } from 'vitest';
import { MusicBus, parseMusicManifest, type MusicElement } from './MusicBus';

class FakeEl implements MusicElement {
  src = '';
  volume = 1;
  loop = false;
  currentTime = 0;
  plays = 0;
  private ended: Array<() => void> = [];
  play = () => {
    this.plays++;
    return Promise.resolve();
  };
  pause = () => undefined;
  addEventListener = (_t: 'ended', fn: () => void) => void this.ended.push(fn);
  removeEventListener = (_t: 'ended', fn: () => void) =>
    void (this.ended = this.ended.filter((f) => f !== fn));
  removeAttribute = () => void (this.src = '');
  end() {
    for (const f of [...this.ended]) f();
  }
}

const MANIFEST = {
  tracks: [
    { key: 'a', url: 'a.ogg', gain: 1, durationS: 100, bytes: 10 },
    { key: 'b', url: 'b.ogg', gain: 0.5, durationS: 100, bytes: 10 },
    { key: 'c', url: 'c.ogg', gain: 1, durationS: 100, bytes: 10 },
  ],
  playlists: [
    { id: 'day', tracks: ['a'], crossfadeS: 2, shuffle: false },
    { id: 'night', tracks: ['b'], crossfadeS: 2, shuffle: false },
    { id: 'mix', tracks: ['a', 'c'], crossfadeS: 1, shuffle: false },
  ],
};

function setup() {
  const els: FakeEl[] = [];
  const loadManifest = vi.fn(() => Promise.resolve(MANIFEST));
  const warm = vi.fn();
  const bus = new MusicBus({
    base: '/b/',
    createElement: () => {
      const e = new FakeEl();
      els.push(e);
      return e;
    },
    loadManifest,
    warm,
    onGesture: () => undefined,
  });
  return { bus, els, loadManifest, warm };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('MusicBus', () => {
  it('fetches nothing until a playlist is asked for', () => {
    const { els, loadManifest } = setup();
    expect(els).toHaveLength(0);
    expect(loadManifest).not.toHaveBeenCalled();
  });

  it('sets a lazy source and fades the first track in', async () => {
    const { bus, els } = setup();
    bus.crossfadeTo('day');
    await flush();
    expect(els).toHaveLength(2);
    const playing = els.find((e) => e.src !== '')!;
    expect(playing.src).toBe('/b/assets/audio/music/a.ogg');
    expect(playing.plays).toBe(1);
    expect(playing.volume).toBe(0);
    bus.tick(1000);
    expect(playing.volume).toBeCloseTo(0.5);
    bus.tick(1000);
    expect(playing.volume).toBeCloseTo(1);
  });

  it('swaps the two elements on a crossfade and releases the old one when it is silent', async () => {
    const { bus, els } = setup();
    bus.crossfadeTo('day');
    await flush();
    bus.tick(2000);
    const first = els.find((e) => e.src !== '')!;
    bus.crossfadeTo('night');
    await flush();
    const second = els.find((e) => e.src.endsWith('b.ogg'))!;
    expect(second).not.toBe(first);
    bus.tick(1000);
    expect(first.volume).toBeCloseTo(0.5);
    expect(second.volume).toBeCloseTo(0.25); // half faded in, times the track gain 0.5
    bus.tick(1000);
    expect(first.src).toBe('');
    expect(second.volume).toBeCloseTo(0.5);
  });

  it('does nothing when the same playlist is asked for again', async () => {
    const { bus, els, loadManifest } = setup();
    bus.crossfadeTo('day');
    await flush();
    bus.tick(2000);
    const playing = els.find((e) => e.src !== '')!;
    bus.crossfadeTo('day');
    await flush();
    expect(playing.plays).toBe(1);
    expect(els.filter((e) => e.src !== '')).toHaveLength(1);
    expect(loadManifest).toHaveBeenCalledTimes(1);
  });

  it('follows the volume slider and the mute', async () => {
    const { bus, els } = setup();
    bus.crossfadeTo('day');
    await flush();
    bus.tick(2000);
    const playing = els.find((e) => e.src !== '')!;
    bus.setVolume(0.4);
    expect(playing.volume).toBeCloseTo(0.4);
    bus.setMuted(true);
    expect(playing.volume).toBe(0);
    bus.setMuted(false);
    expect(playing.volume).toBeCloseTo(0.4);
  });

  it('fades to silence on null and keeps silence when the playlist is unknown', async () => {
    const { bus, els } = setup();
    bus.crossfadeTo('day');
    await flush();
    bus.tick(2000);
    bus.crossfadeTo(null);
    bus.tick(2000);
    expect(els.every((e) => e.src === '')).toBe(true);
    bus.crossfadeTo('nope');
    await flush();
    expect(els.every((e) => e.src === '')).toBe(true);
  });

  it('moves to the next track of a playlist when one ends', async () => {
    const { bus, els } = setup();
    bus.crossfadeTo('mix');
    await flush();
    const first = els.find((e) => e.src.endsWith('a.ogg'))!;
    expect(bus.playingTrack).toBe('a');
    first.end();
    expect(bus.playingTrack).toBe('c');
  });

  it('prefetches the first track once', async () => {
    const { bus, warm } = setup();
    bus.prefetch('night');
    bus.prefetch('night');
    await flush();
    expect(warm).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledWith('/b/assets/audio/music/b.ogg');
  });

  it('reads a damaged manifest as empty', () => {
    expect(parseMusicManifest({ tracks: [{ key: 1 }], playlists: [{ id: 'x' }] })).toEqual({
      tracks: [],
      playlists: [],
    });
    expect(parseMusicManifest(null)).toEqual({ tracks: [], playlists: [] });
  });
});
