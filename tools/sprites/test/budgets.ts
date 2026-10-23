/**
 * The media budget figures of ASSETS 6.8, with no imports so the client's own tests can read them too (`media.ts` is
 * the budget's home and re-exports them).
 */
export const MB = 1024 * 1024;
export const BUDGET = {
  sfxBytes: 6 * MB,
  musicBytes: 12 * MB,
  musicPerMapBytes: 4 * MB,
  videoBytes: 2 * MB,
  /** The one exception (A98): the opening cinematic, streamed, outside the first load. */
  introVideoBytes: 5 * MB,
  posterBytes: 60 * 1000,
  firstLoadBytes: 12 * MB,
  siteBytes: 150 * MB,
} as const;

/**
 * The playlists that play before any map loads (the start screen, the lobby and the credits): they count toward the
 * 12 MB total and never toward a map's cap (DECISIONS A98). `MusicDirector.test.ts` reads this and `BUDGET` too.
 */
export const PRE_MATCH_PLAYLISTS: readonly string[] = ['lobby', 'trailer'];
