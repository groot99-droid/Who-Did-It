import { describe, expect, it } from 'vitest';
import musicJson from '../../../packages/content/data/music.json' with { type: 'json' };
import { artStyles, styleFile } from '../palette.ts';
import {
  BUDGET,
  MB,
  checkMusic,
  checkSfx,
  checkVideos,
  firstLoadBytes,
  readManifest,
  siteBytes,
  type MusicManifest,
  type SfxManifest,
  type VideoManifest,
} from './media.ts';

/** The media budgets of ASSETS 6.8 and docs/round6/media.md 2 and 3, over the committed manifests. */

const sfx = readManifest<SfxManifest>('audio/manifest.json') ?? { entries: [] };
const music = readManifest<MusicManifest>('audio/music/manifest.json') ?? { tracks: [], playlists: [] };
const videos = readManifest<VideoManifest>('video/manifest.json') ?? { version: 1, entries: [] };
const byMap = musicJson.byMap as Record<string, Record<string, string>>;

describe('the committed media manifests', () => {
  it('keep SFX and ambience within 6 MB', () => {
    expect(checkSfx(sfx)).toEqual([]);
  });

  it('keep music within 12 MB in all and 4 MB per map', () => {
    expect(checkMusic(music, byMap)).toEqual([]);
  });

  it('keep every video within 2 MB (the intro within 5 MB) and every poster within 60 KB', () => {
    expect(checkVideos(videos)).toEqual([]);
  });

  it('have the shape the other sessions write to', () => {
    expect(Array.isArray(videos.entries)).toBe(true);
    expect(Array.isArray(music.tracks)).toBe(true);
    expect(Array.isArray(music.playlists)).toBe(true);
  });

  // The first load is the default style's (a player's other pick is swapped in after boot, art plan 1.9).
  it('keep the first load of the default art style within 12 MB', () => {
    const style = artStyles().find((s) => s.id === styleFile.artStyles.default);
    expect(style).toBeDefined();
    expect(firstLoadBytes(style?.root ?? '')).toBeLessThanOrEqual(BUDGET.firstLoadBytes);
  });

  it('keep public/assets within 150 MB', () => {
    expect(siteBytes()).toBeLessThanOrEqual(BUDGET.siteBytes);
  });
});

describe('the checks fail on a constructed oversize entry', () => {
  const sizes: Record<string, number> = {};
  const sizeOf = (rel: string) => sizes[rel] ?? null;

  it('an SFX set over 6 MB, and a listed file that is missing', () => {
    sizes['audio/a.ogg'] = 4 * MB;
    sizes['audio/b.ogg'] = 3 * MB;
    const m = {
      entries: [
        { key: 'a', url: 'a.ogg' },
        { key: 'b', url: 'b.ogg' },
      ],
    };
    expect(checkSfx(m, sizeOf)).toHaveLength(1);
    expect(checkSfx({ entries: [{ key: 'c', url: 'c.ogg' }] }, sizeOf)).toHaveLength(1);
  });

  it('music over 4 MB for one map, though under 12 MB in all', () => {
    const m: MusicManifest = {
      tracks: [
        { key: 't1', url: 't1.ogg', bytes: 3 * MB },
        { key: 't2', url: 't2.ogg', bytes: 3 * MB, map: 'hollowmere' },
        { key: 't3', url: 't3.ogg', bytes: 3 * MB, map: 'blackpine' },
      ],
      playlists: [{ id: 'day', tracks: ['t1'] }],
    };
    expect(checkMusic(m, { blackpine: { day: 'day' } }, sizeOf)).toHaveLength(1);
    expect(checkMusic(m, { hollowmere: {} }, sizeOf)).toEqual([]);
  });

  it('music over 12 MB in all', () => {
    const tracks = [1, 2, 3, 4].map((n) => ({ key: `t${n}`, url: `t${n}.ogg`, bytes: 3.5 * MB }));
    expect(checkMusic({ tracks, playlists: [] }, {}, sizeOf)).toHaveLength(1);
  });

  it('a video over 2 MB, a poster over 60 KB, a wrong byte count', () => {
    sizes['video/big.webm'] = 2 * MB + 1;
    sizes['video/big.jpg'] = 61 * 1000;
    sizes['video/ok.webm'] = 1000;
    const big = { key: 'big', url: 'big.webm', poster: 'big.jpg', durationS: 12, bytes: 2 * MB + 1 };
    expect(checkVideos({ version: 1, entries: [big] }, sizeOf)).toHaveLength(2);
    const lie = { key: 'ok', url: 'ok.webm', durationS: 12, bytes: 5 };
    expect(checkVideos({ version: 1, entries: [lie] }, sizeOf)).toHaveLength(1);
  });

  it('the intro may be up to 5 MB, no other key may, and 5 MB + 1 fails', () => {
    sizes['video/intro.webm'] = 4.5 * MB;
    sizes['video/other.webm'] = 4.5 * MB;
    const intro = { key: 'intro', url: 'intro.webm', durationS: 23, bytes: 4.5 * MB };
    const other = { key: 'other', url: 'other.webm', durationS: 23, bytes: 4.5 * MB };
    expect(checkVideos({ version: 1, entries: [intro] }, sizeOf)).toEqual([]);
    expect(checkVideos({ version: 1, entries: [other] }, sizeOf)).toHaveLength(1);
    sizes['video/intro.webm'] = 5 * MB + 1;
    expect(checkVideos({ version: 1, entries: [{ ...intro, bytes: 5 * MB + 1 }] }, sizeOf)).toHaveLength(1);
  });
});
