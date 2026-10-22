import type Phaser from 'phaser';
import musicJson from '@wdi/content/data/music.json';
import { Phase } from '@wdi/shared';
import { DEFAULT_MAP_ID } from '../net/protocol';
import type { LobbySnapshot, NetworkService } from '../net/NetworkService';
import { REG_MUSIC } from '../scenes/registry';
import type { MusicBus } from './MusicBus';

/**
 * Picks the music class (round 6, docs/round6/cutscene-music.md 3): listens to the lobby, `phaseChange` and `gameOver`
 * on the network bus and asks the `MusicBus` for the playlist `music.json` maps the current map and class to. The
 * meeting and the quick mode's kitchen, night, rush and end come from the phase too, so no scene needs to ask.
 * Installed once by `Preload` beside the router (locked call site). The server sends no music message.
 */

export type MainClass = 'lobby' | 'day' | 'dusk' | 'night' | 'meeting' | 'finalNight' | 'gameOver';
export type OnubClass = 'kitchen' | 'night' | 'rush' | 'over';

/**
 * The class a phase plays, or `undefined` when the phase keeps whatever plays now: the role card and grace hold the
 * map's `loading` piece (or silence) until the first `day`, so the opening's speech is heard whole.
 */
export function mainClassFor(phase: number): MainClass | undefined {
  switch (phase) {
    case Phase.lobby:
      return 'lobby';
    case Phase.day:
    case Phase.dawn:
      return 'day';
    case Phase.dusk:
      return 'dusk';
    case Phase.night:
      return 'night';
    case Phase.meetingDiscussion:
    case Phase.meetingVote:
    case Phase.reveal:
    case Phase.immunity:
      return 'meeting';
    case Phase.finalNight:
      return 'finalNight';
    case Phase.gameOver:
      return 'gameOver';
    default:
      return undefined;
  }
}

/** The quick mode (GDD 3.11): Evening Prep and the crime scenes are the kitchen, the Morning Rush follows dawn. */
export function onubClassFor(phase: number): OnubClass | undefined {
  switch (phase) {
    case Phase.dusk:
    case Phase.prepReveal:
      return 'kitchen';
    case Phase.night:
      return 'night';
    case Phase.dawn:
    case Phase.meetingDiscussion:
    case Phase.meetingVote:
    case Phase.reveal:
      return 'rush';
    case Phase.gameOver:
      return 'over';
    default:
      return undefined;
  }
}

type ByMap = Record<string, Partial<Record<string, string>> | undefined>;

/** The playlist id `music.json` gives a map's class (a class it does not list is silence). */
export function playlistFor(mapId: string, cls: string, music: { byMap: ByMap } = musicJson): string | null {
  return music.byMap[mapId]?.[cls] ?? null;
}

export function onubPlaylistFor(
  cls: OnubClass,
  music: { onub: Partial<Record<string, string>> } = musicJson,
): string | null {
  return music.onub[cls] ?? null;
}

type Bus = Pick<MusicBus, 'crossfadeTo' | 'prefetch'>;

/** The director's logic, apart from Phaser so a test drives it with a fake bus and plain events. */
export class MusicConductor {
  private mapId: string = DEFAULT_MAP_ID;
  private onub = false;
  private inMatch = false;

  constructor(private readonly bus: Bus) {}

  lobby(map: string, mode: 'main' | 'onub'): void {
    this.onub = mode === 'onub';
    const picked = map !== this.mapId;
    this.mapId = map;
    // The roster also changes mid-match; only the lobby between matches plays the lobby class.
    if (this.inMatch) return;
    if (this.onub) this.bus.crossfadeTo(onubPlaylistFor('kitchen'));
    else {
      this.bus.crossfadeTo(playlistFor(this.mapId, 'lobby'));
      // The map is picked: warm the first track of its day theme while the lobby waits.
      if (picked) {
        const day = playlistFor(this.mapId, 'day');
        if (day !== null) this.bus.prefetch(day);
      }
    }
  }

  phase(phase: number): void {
    this.inMatch = phase !== Phase.lobby && phase !== Phase.gameOver;
    if (this.onub) {
      const c = onubClassFor(phase);
      if (c !== undefined) this.bus.crossfadeTo(onubPlaylistFor(c));
      else if (phase === Phase.lobby) this.bus.crossfadeTo(onubPlaylistFor('kitchen'));
      return;
    }
    const c = mainClassFor(phase);
    if (c !== undefined) this.bus.crossfadeTo(playlistFor(this.mapId, c));
  }

  gameOver(): void {
    this.phase(Phase.gameOver);
  }

  left(): void {
    this.inMatch = false;
    this.bus.crossfadeTo(null);
  }
}

export function installMusicDirector(game: Phaser.Game, net: NetworkService): () => void {
  const bus = game.registry.get(REG_MUSIC) as MusicBus | undefined;
  if (bus === undefined) return () => undefined;
  const c = new MusicConductor(bus);
  const onLobby = (s: LobbySnapshot) => c.lobby(s.settings.map, s.settings.mode);
  const onPhase = (p: { phase: number }) => c.phase(p.phase);
  const onOver = () => c.gameOver();
  const onLeft = () => c.left();
  net.bus.on('lobby', onLobby);
  net.bus.on('phaseChange', onPhase);
  net.bus.on('gameOver', onOver);
  net.bus.on('left', onLeft);
  return () => {
    net.bus.off('lobby', onLobby);
    net.bus.off('phaseChange', onPhase);
    net.bus.off('gameOver', onOver);
    net.bus.off('left', onLeft);
  };
}
