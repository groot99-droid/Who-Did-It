import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import musicJson from '@wdi/content/data/music.json';
import cutscenesJson from '@wdi/content/data/cutscenes/cutscenes.json';
import { MAP_IDS, MUSIC_CLASSES, ONUB_MUSIC_CLASSES } from '@wdi/content';
import { Phase } from '@wdi/shared';
import {
  MusicConductor,
  mainClassFor,
  onubClassFor,
  onubPlaylistFor,
  openingFor,
  playlistFor,
} from './MusicDirector';
import { parseMusicManifest } from './MusicBus';
import { BUDGET, PRE_MATCH_PLAYLISTS } from '../../../../tools/sprites/test/budgets';

function rig(map = 'hollowmere', mode: 'main' | 'onub' = 'main') {
  const calls: Array<string | null> = [];
  const prefetched: string[] = [];
  const c = new MusicConductor({
    // The bus ignores a call for the playlist it already wants.
    crossfadeTo: (id) => void (calls.at(-1) !== id && calls.push(id)),
    prefetch: (id) => void prefetched.push(id),
  });
  c.lobby(map, mode);
  calls.length = 0;
  prefetched.length = 0;
  return { c, calls, prefetched };
}

describe('music.json and the committed manifest', () => {
  const manifest = parseMusicManifest(
    JSON.parse(
      readFileSync(new URL('../../public/assets/audio/music/manifest.json', import.meta.url), 'utf8'),
    ),
  );
  const ids = new Set(manifest.playlists.map((p) => p.id));

  it('names only playlists the manifest declares', () => {
    const used = [
      ...Object.values(musicJson.byMap).flatMap((m) => Object.values(m)),
      ...Object.values(musicJson.onub),
    ];
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(ids, id).toContain(id);
  });

  it('maps every class of every map and every quick-mode class', () => {
    for (const m of MAP_IDS)
      for (const c of MUSIC_CLASSES) expect(playlistFor(m, c), `${m}/${c}`).not.toBeNull();
    for (const c of ONUB_MUSIC_CLASSES) expect(onubPlaylistFor(c), c).not.toBeNull();
  });

  it("runs each map's opening as long as its intro track, rounded down to the second (A101)", () => {
    for (const m of MAP_IDS) {
      const pl = manifest.playlists.find((p) => p.id === playlistFor(m, 'opening'))!;
      expect(pl.loop, m).toBe(false);
      expect(pl.tracks, m).toHaveLength(1);
      const track = manifest.tracks.find((t) => t.key === pl.tracks[0])!;
      const opening = (cutscenesJson.cutscenes as Record<string, { maxS: number }>)[openingFor(m)!]!;
      expect(opening.maxS, m).toBe(Math.floor(track.durationS));
    }
  });

  it('lists only tracks that exist, and playlist ids once', () => {
    const keys = new Set(manifest.tracks.map((t) => t.key));
    for (const p of manifest.playlists) for (const k of p.tracks) expect(keys, `${p.id}/${k}`).toContain(k);
    expect(ids.size).toBe(manifest.playlists.length);
  });
});

describe('phase to class', () => {
  it('holds the loading piece through the role card and grace', () => {
    expect(mainClassFor(Phase.roleReveal)).toBeUndefined();
    expect(mainClassFor(Phase.grace)).toBeUndefined();
    expect(mainClassFor(Phase.day)).toBe('day');
  });

  it('puts every meeting phase on the meeting class', () => {
    for (const p of [Phase.meetingDiscussion, Phase.meetingVote, Phase.reveal, Phase.immunity])
      expect(mainClassFor(p)).toBe('meeting');
  });

  it('maps the quick mode to its four classes', () => {
    expect(onubClassFor(Phase.dusk)).toBe('kitchen');
    expect(onubClassFor(Phase.night)).toBe('night');
    expect(onubClassFor(Phase.meetingDiscussion)).toBe('rush');
    expect(onubClassFor(Phase.gameOver)).toBe('over');
  });
});

describe('MusicConductor', () => {
  it('plays the lobby playlist and warms the opening piece and the day theme when the map is picked', () => {
    const { c, calls, prefetched } = rig('hollowmere');
    c.lobby('blackpine', 'main');
    expect(calls).toEqual([playlistFor('blackpine', 'lobby')]);
    expect(prefetched).toEqual([playlistFor('blackpine', 'opening'), playlistFor('blackpine', 'day')]);
  });

  it('follows the phases of the chosen map', () => {
    const { c, calls } = rig('blackpine');
    c.phase(Phase.day);
    c.phase(Phase.dusk);
    c.phase(Phase.night);
    c.phase(Phase.meetingDiscussion);
    expect(calls).toEqual(['day', 'dusk', 'night', 'meeting'].map((k) => playlistFor('blackpine', k)));
  });

  it('keeps the loading piece through the role card', () => {
    const { c, calls } = rig();
    c.phase(Phase.roleReveal);
    c.phase(Phase.grace);
    expect(calls).toEqual([]);
  });

  it('starts the opening piece with the opening and holds the day until the piece ends', () => {
    const { c, calls } = rig('hollowmere');
    c.phase(Phase.roleReveal);
    c.phase(Phase.grace);
    c.cutscene(openingFor('hollowmere')!);
    expect(calls).toEqual([playlistFor('hollowmere', 'opening')]);
    c.cutsceneEnded(openingFor('hollowmere')!, 'done'); // the camera is done; the piece still plays
    c.phase(Phase.day);
    expect(calls).toHaveLength(1);
    c.finished(playlistFor('hollowmere', 'opening')!);
    expect(calls).toEqual([playlistFor('hollowmere', 'opening'), playlistFor('hollowmere', 'day')]);
  });

  it('crossfades to the day at the end of the piece even while grace still runs', () => {
    const { c, calls } = rig('blackpine');
    c.phase(Phase.grace);
    c.cutscene(openingFor('blackpine')!);
    c.finished(playlistFor('blackpine', 'opening')!);
    c.phase(Phase.day);
    expect(calls).toEqual([playlistFor('blackpine', 'opening'), playlistFor('blackpine', 'day')]);
  });

  it('crossfades at once when the opening is skipped', () => {
    const { c, calls } = rig('hollowmere');
    c.phase(Phase.grace);
    c.cutscene(openingFor('hollowmere')!);
    c.cutsceneEnded(openingFor('hollowmere')!, 'skipped');
    expect(calls).toEqual([playlistFor('hollowmere', 'opening'), playlistFor('hollowmere', 'day')]);
    c.finished(playlistFor('hollowmere', 'opening')!);
    expect(calls).toHaveLength(2);
  });

  it('ignores other cutscenes, other maps and the quick mode', () => {
    const { c, calls } = rig('hollowmere');
    c.phase(Phase.grace);
    c.cutscene('deathKnife');
    c.cutscene(openingFor('blackpine')!);
    expect(calls).toEqual([]);
    const q = rig('hollowmere', 'onub');
    q.c.cutscene(openingFor('hollowmere')!);
    expect(q.calls).toEqual([]);
  });

  it('drops the opening piece when the match ends or the room is left', () => {
    const { c, calls } = rig('hollowmere');
    c.phase(Phase.grace);
    c.cutscene(openingFor('hollowmere')!);
    c.left();
    c.finished(playlistFor('hollowmere', 'opening')!);
    expect(calls).toEqual([playlistFor('hollowmere', 'opening'), null]);
  });

  it('does not switch to the lobby class when the roster changes mid-match', () => {
    const { c, calls } = rig();
    c.phase(Phase.day);
    calls.length = 0;
    c.lobby('hollowmere', 'main');
    expect(calls).toEqual([]);
  });

  it('returns to the lobby class after the game is over and goes silent when the room is left', () => {
    const { c, calls } = rig();
    c.phase(Phase.day);
    c.gameOver();
    c.lobby('hollowmere', 'main');
    c.left();
    expect(calls).toEqual([
      playlistFor('hollowmere', 'day'),
      playlistFor('hollowmere', 'gameOver'),
      playlistFor('hollowmere', 'lobby'),
      null,
    ]);
  });

  it('plays the quick mode classes in the quick mode', () => {
    const { c, calls } = rig('hollowmere', 'onub');
    c.phase(Phase.dusk);
    c.phase(Phase.night);
    c.phase(Phase.dawn);
    expect(calls).toEqual(['kitchen', 'night', 'rush'].map((k) => onubPlaylistFor(k as 'kitchen')));
  });
});

describe('committed music files', () => {
  it('has every listed track on disk and keeps each map under its 4 MiB and the whole under 12 MiB', () => {
    const dir = new URL('../../public/assets/audio/music/', import.meta.url);
    const manifest = parseMusicManifest(JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')));
    for (const t of manifest.tracks) expect(statSync(new URL(t.url, dir)).size, t.key).toBe(t.bytes);
    const total = manifest.tracks.reduce((n, t) => n + t.bytes, 0);
    expect(total).toBeLessThanOrEqual(BUDGET.musicBytes);
    for (const [map, classes] of Object.entries(musicJson.byMap)) {
      const keys = new Set<string>();
      for (const id of [...Object.values(classes)])
        if (!PRE_MATCH_PLAYLISTS.includes(id))
          for (const k of manifest.playlists.find((p) => p.id === id)?.tracks ?? []) keys.add(k);
      const bytes = [...keys].reduce((n, k) => n + (manifest.tracks.find((t) => t.key === k)?.bytes ?? 0), 0);
      expect(bytes, map).toBeLessThanOrEqual(BUDGET.musicPerMapBytes);
    }
  });
});
