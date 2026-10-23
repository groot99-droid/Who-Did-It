import { describe, expect, it } from 'vitest';
import { backdropPlan, buildLine, parseLoopRow } from './backdrop';

const env = { reducedMotion: false, saveData: false, search: '' };
const row = { url: 'landing_loop.webm', poster: 'landing_loop.jpg' };
const dir = '/Who-Did-It/assets/video/';

describe('parseLoopRow', () => {
  it('finds the landing_loop row among the others', () => {
    const manifest = {
      entries: [
        { key: 'intro', url: 'intro.webm' },
        { key: 'landing_loop', ...row, bytes: 9 },
      ],
    };
    expect(parseLoopRow(manifest)).toEqual(row);
  });

  it('is null without the row, and for a damaged manifest', () => {
    expect(parseLoopRow({ entries: [{ key: 'intro', url: 'intro.webm' }] })).toBeNull();
    expect(parseLoopRow({ entries: [{ key: 'landing_loop', url: '' }] })).toBeNull();
    expect(parseLoopRow({ entries: 'no' })).toBeNull();
    expect(parseLoopRow(null)).toBeNull();
  });
});

describe('backdropPlan', () => {
  it('plays the loop over its poster by default', () => {
    expect(backdropPlan(env, row, dir)).toEqual({
      poster: `${dir}landing_loop.jpg`,
      video: `${dir}landing_loop.webm`,
      play: true,
    });
  });

  it('is the night page alone until the row ships', () => {
    expect(backdropPlan(env, null, dir)).toEqual({ poster: null, video: null, play: false });
  });

  it('keeps the video paused under reduced motion', () => {
    expect(backdropPlan({ ...env, reducedMotion: true }, row, dir)).toMatchObject({
      video: `${dir}landing_loop.webm`,
      play: false,
    });
  });

  it('never loads the video with ?video=0 or the data saver, and keeps the poster', () => {
    for (const e of [
      { ...env, search: '?mock=1&video=0' },
      { ...env, saveData: true },
    ]) {
      expect(backdropPlan(e, row, dir)).toEqual({
        poster: `${dir}landing_loop.jpg`,
        video: null,
        play: false,
      });
    }
    expect(backdropPlan({ ...env, search: '?video=1' }, row, dir).video).not.toBeNull();
  });
});

describe('buildLine', () => {
  it('replaces the canvas {ok, build} line', () => {
    expect(buildLine({ ok: true, build: 'abc123' })).toBe('build abc123');
    expect(buildLine({ ok: false, build: 'abc123' })).toBe('offline, build abc123');
  });
});
