import { z } from 'zod';
import { GddRef, WorldId } from './common.js';

// Music (GDD 3.18, round 6, Session 6L; docs/round6/cutscene-music.md 3). Which playlist of the client's
// `audio/music/manifest.json` plays for each phase class of each map; the tracks, gains and crossfades live in that
// manifest, the mapping here. Pre-seeded by 6Z empty; 6L fills it.

/** A playlist id of `apps/client/public/assets/audio/music/manifest.json`. */
const PlaylistId = z.string().regex(/^[a-z][a-z0-9_]*$/);

/**
 * `loading` is the map's loading-screen piece (the owner's speech-and-music pieces, docs/round6/media.md 1): it starts
 * with the map's load and runs under the opening until the first phase class takes over (cutscene-music.md 2, 3).
 */
export const MUSIC_CLASSES = [
  'loading',
  'lobby',
  'day',
  'dusk',
  'night',
  'meeting',
  'finalNight',
  'gameOver',
] as const;
export const MusicClass = z.enum(MUSIC_CLASSES);
export type MusicClass = z.infer<typeof MusicClass>;

/** The quick mode's classes (GDD 3.11): the kitchen (prep), the night, the Morning Rush and the end screen. */
export const ONUB_MUSIC_CLASSES = ['kitchen', 'night', 'rush', 'over'] as const;
export const OnubMusicClass = z.enum(ONUB_MUSIC_CLASSES);

export const MusicFile = z.strictObject({
  gddRef: GddRef,
  /** Map id -> class -> playlist id; a missing class is silence. */
  byMap: z.record(WorldId, z.partialRecord(MusicClass, PlaylistId)),
  onub: z.partialRecord(OnubMusicClass, PlaylistId),
});
export type MusicFile = z.infer<typeof MusicFile>;
