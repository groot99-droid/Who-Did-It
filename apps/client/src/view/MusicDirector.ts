import type Phaser from 'phaser';
import musicJson from '@wdi/content/data/music.json';
import cutscenesJson from '@wdi/content/data/cutscenes/cutscenes.json';
import { Phase } from '@wdi/shared';
import { DEFAULT_MAP_ID } from '../net/protocol';
import type { LobbySnapshot, NetworkService } from '../net/NetworkService';
import { REG_CUTSCENE, REG_MUSIC } from '../scenes/registry';
import { CUTSCENE_END, type CutsceneEnd } from './cutscene/sequencer';
import type { MusicBus } from './MusicBus';

/**
 * Picks the music class (round 6, docs/round6/cutscene-music.md 3): listens to the lobby, `phaseChange` and `gameOver`
 * on the network bus and asks the `MusicBus` for the playlist `music.json` maps the current map and class to. The
 * meeting and the quick mode's kitchen, night, rush and end come from the phase too, so no scene needs to ask.
 * Installed once by `Preload` beside the router (locked call site). The server sends no music message.
 *
 * Round 7 (7A, DECISIONS A101): the map's `opening` piece starts when the opening's `cutscene` message arrives (the
 * router leaves its id under `REG_CUTSCENE`) and plays once and whole; a phase class asked for meanwhile waits, and
 * plays when the piece ends (the bus's `onFinish`) or the opening is skipped (the player's `CUTSCENE_END`).
 */

export type MainClass = 'lobby' | 'day' | 'dusk' | 'night' | 'meeting' | 'finalNight' | 'gameOver';
export type OnubClass = 'kitchen' | 'night' | 'rush' | 'over';

/**
 * The class a phase plays, or `undefined` when the phase keeps whatever plays now: the role card and grace keep the
 * `loading` piece, and then the opening's, until the first `day`.
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

/** The opening cutscene id `cutscenes.json` gives a map, or null. */
export function openingFor(
  mapId: string,
  file: { openings: Record<string, string> } = cutscenesJson,
): string | null {
  return file.openings[mapId] ?? null;
}

type Bus = Pick<MusicBus, 'crossfadeTo' | 'prefetch'>;

/** The director's logic, apart from Phaser so a test drives it with a fake bus and plain events. */
export class MusicConductor {
  private mapId: string = DEFAULT_MAP_ID;
  private onub = false;
  private inMatch = false;
  /** The opening playlist playing now, while its piece runs whole. */
  private opening: string | null = null;
  /** The class a phase asked for while the opening piece played. */
  private held: MainClass | null = null;

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
      // The map is picked: warm its opening piece and the first track of its day theme while the lobby waits.
      if (picked) {
        for (const cls of ['opening', 'day'] as const) {
          const id = playlistFor(this.mapId, cls);
          if (id !== null) this.bus.prefetch(id);
        }
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
    if (c === undefined) return;
    if (this.opening !== null && this.inMatch) {
      this.held = c;
      return;
    }
    this.opening = null;
    this.held = null;
    this.bus.crossfadeTo(playlistFor(this.mapId, c));
  }

  /** A `cutscene` message: the map's opening starts its piece; any other cutscene changes nothing. */
  cutscene(id: string): void {
    if (this.onub || id !== openingFor(this.mapId)) return;
    const pl = playlistFor(this.mapId, 'opening');
    if (pl === null) return;
    this.opening = pl;
    this.held = null;
    this.bus.crossfadeTo(pl);
  }

  /** The bus played a playlist that does not loop to its end. */
  finished(playlistId: string): void {
    if (playlistId === this.opening) this.release();
  }

  /** The player ended a cutscene; a skipped opening hands over at once. */
  cutsceneEnded(id: string, outcome: string): void {
    if (outcome === 'skipped' && this.opening !== null && id === openingFor(this.mapId)) this.release();
  }

  /** The opening piece is over: the class the phase wants now plays (the day, when grace still runs). */
  private release(): void {
    this.opening = null;
    const c = this.held ?? 'day';
    this.held = null;
    if (this.inMatch) this.bus.crossfadeTo(playlistFor(this.mapId, c));
  }

  gameOver(): void {
    this.phase(Phase.gameOver);
  }

  left(): void {
    this.inMatch = false;
    this.opening = null;
    this.held = null;
    this.bus.crossfadeTo(null);
  }
}

export function installMusicDirector(game: Phaser.Game, net: NetworkService): () => void {
  const bus = game.registry.get(REG_MUSIC) as MusicBus | undefined;
  if (bus === undefined) return () => undefined;
  const c = new MusicConductor(bus);
  const onLobby = (s: LobbySnapshot) => c.lobby(s.settings.map, 'main');
  const onPhase = (p: { phase: number }) => c.phase(p.phase);
  const onOver = () => c.gameOver();
  const onLeft = () => c.left();
  // The router sets `REG_CUTSCENE` when the opening's `cutscene` message arrives (worldRouter.ts, locked).
  const onCutsceneId = (_parent: unknown, key: string, value: unknown) => {
    if (key === REG_CUTSCENE && typeof value === 'string') c.cutscene(value);
  };
  const onCutsceneChange = (_parent: unknown, value: unknown) => onCutsceneId(_parent, REG_CUTSCENE, value);
  const onEnd = (e: CutsceneEnd) => c.cutsceneEnded(e.id, e.outcome);
  const unFinish = bus.onFinish((id) => c.finished(id));
  game.registry.events.on('setdata', onCutsceneId);
  game.registry.events.on(`changedata-${REG_CUTSCENE}`, onCutsceneChange);
  game.events.on(CUTSCENE_END, onEnd);
  net.bus.on('lobby', onLobby);
  net.bus.on('phaseChange', onPhase);
  net.bus.on('gameOver', onOver);
  net.bus.on('left', onLeft);
  return () => {
    net.bus.off('lobby', onLobby);
    net.bus.off('phaseChange', onPhase);
    net.bus.off('gameOver', onOver);
    net.bus.off('left', onLeft);
    game.registry.events.off('setdata', onCutsceneId);
    game.registry.events.off(`changedata-${REG_CUTSCENE}`, onCutsceneChange);
    game.events.off(CUTSCENE_END, onEnd);
    unFinish();
  };
}
