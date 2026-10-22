import type Phaser from 'phaser';
import type { NetworkService } from '../net/NetworkService';

/**
 * Picks the music class (round 6, docs/round6/cutscene-music.md 3): listens to the lobby, `phaseChange`,
 * `meetingStart` and `gameOver` on the network bus and asks the `MusicBus` for the playlist `music.json` maps the
 * current map and class to. Installed once by `Preload` beside the router (locked call site). Pre-seeded by 6Z as a
 * no-op; Session 6L fills it.
 */
export function installMusicDirector(_game: Phaser.Game, _net: NetworkService): () => void {
  return () => undefined; // 6L
}
