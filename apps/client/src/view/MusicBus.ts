/**
 * Music playback (round 6, docs/round6/cutscene-music.md 3): two `<audio>` elements, a crossfade between
 * playlists of `audio/music/manifest.json`, lazy sources, a prefetch when the map is picked. Created once by
 * `Preload` under `REG_MUSIC`. Pre-seeded by 6Z as a no-op; Session 6L fills it.
 */
export class MusicBus {
  crossfadeTo(_playlistId: string | null): void {
    // 6L
  }

  prefetch(_playlistId: string): void {
    // 6L
  }

  setVolume(_v: number): void {
    // 6L
  }

  setMuted(_muted: boolean): void {
    // 6L
  }
}
