import { Callbacks, Client, CloseCode, type Room as ColyseusRoom } from '@colyseus/sdk';
import mitt, { type Emitter } from 'mitt';
import { BUILD_VERSION, SERVER_URL } from '../health';
import {
  type ClientMessages,
  type ClientMessageType,
  DEFAULT_MAP_ID,
  type ErrorPayload,
  type GameOverPayload,
  gameModeId,
  GameMode,
  type GameModeId,
  JOIN_FAILED_MESSAGE,
  type JoinOptions,
  type LobbyPlayer,
  type LobbySettings,
  NpcLevel,
  npcLevelId,
  type NpcLevelId,
  type PhaseChangePayload,
  ROOM_NAME,
  type RoleRevealPayload,
  type SceneEnterPayload,
  type ServerMessages,
} from './protocol';
import { deviceId, reconnectTokens } from './storage';

/** The state schema arrives with `@wdi/shared`; until then the room is dynamically typed. */
export type Room = ColyseusRoom;

export interface LobbySnapshot {
  code: string;
  selfId: string;
  leaderId: string;
  players: LobbyPlayer[];
  settings: LobbySettings;
}

/**
 * The settings a fresh room shows before its state arrives (mode main, the default level, no NPC seats, the
 * default map).
 */
export function defaultSettings(defaultLevel: NpcLevelId = 'normal'): LobbySettings {
  return { mode: 'main', npcDifficulty: defaultLevel, npcSeats: 0, onubDeck: [], map: DEFAULT_MAP_ID };
}

export type NetEvents = {
  lobby: LobbySnapshot;
  roleReveal: RoleRevealPayload;
  phaseChange: PhaseChangePayload;
  sceneEnter: SceneEnterPayload;
  gameOver: GameOverPayload;
  error: ErrorPayload;
  /** The live room after a create, join or resume; `null` once it is gone. The router attaches its feeds here. */
  room: Room | null;
  /** The connection to the room ended; `consented` is true when the player chose to leave. */
  left: { consented: boolean };
};

/** The server messages the bus forwards as events. */
type NetMessageType = Exclude<keyof NetEvents, 'lobby' | 'left' | 'room' | 'sceneEnter'>;

/** Thrown by create/join/resume; the UI shows `JOIN_FAILED_MESSAGE` for every cause. */
export class JoinError extends Error {
  constructor() {
    super(JOIN_FAILED_MESSAGE);
    this.name = 'JoinError';
  }
}

/** What the scenes depend on; `ColyseusNetwork` and the `?mock=1` `MockNetwork` implement it. */
export interface NetworkService {
  readonly bus: Emitter<NetEvents>;
  readonly code: string | null;
  /** The connected room, or null until one is wired (always null in mock mode). */
  readonly room: Room | null;
  /** Latest roster, so a scene that mounts after the first event still renders at once. */
  readonly snapshot: LobbySnapshot | null;
  /** This player's own card, kept for the whole match so Tab can reopen it in any scene. */
  readonly roleCard: RoleRevealPayload | null;
  create(name: string): Promise<string>;
  join(code: string, name: string): Promise<string>;
  /** Re-enter a room with the stored token; resolves false when there is none or it is stale. */
  resume(code: string): Promise<boolean>;
  send<K extends ClientMessageType>(type: K, payload: ClientMessages[K]): void;
  request<Res = unknown, K extends ClientMessageType = ClientMessageType>(
    type: K,
    payload: ClientMessages[K],
    timeoutMs?: number,
  ): Promise<Res>;
  leave(): Promise<void>;
  /** Leader only (the server refuses anyone else): `lobby.settings {mode}`. */
  setMode(mode: GameModeId): void;
  /** Leader only: `lobby.settings {npcDifficulty}`; the server accepts it with enough NPC seats. */
  setNpcDifficulty(level: NpcLevelId): void;
  /** Leader only: `lobby.addNpc`. */
  addNpc(): void;
  /** Leader only: `lobby.removeNpc`; the server drops the most recently added NPC seat. */
  removeNpc(): void;
  /** Leader only: `lobby.settings {onubDeck}`, a custom quick-mode deck (`[]` for the default, GDD 3.11). */
  setOnubDeck(deck: readonly string[]): void;
  /**
   * Leader only: `lobby.settings {map}`, a map id of `MAP_IDS` (GDD 3.13). The lobby's map row calls it; the
   * server ignores the field until Session 5J reads it.
   */
  setMap(mapId: string): void;
}

// `sceneEnter` is not here: the world feed (ColyseusWorldFeed) registers it once and the router
// re-emits it on `bus` for the screens that listen (RoleReveal).
const SERVER_MESSAGES: readonly NetMessageType[] = ['roleReveal', 'phaseChange', 'gameOver', 'error'];

/** Minimal view of the room state the lobby needs; the real schema arrives with `@wdi/shared`. */
interface PlayerState {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
}

/**
 * `state.settings` as the lobby reads it (numbers: `GameMode`, `NpcLevel`, a seat count; the deck's role ids;
 * the map id).
 */
interface SettingsState {
  mode: number;
  npcDifficulty: number;
  npcSeats: number;
  onubDeck?: Iterable<string>;
  map?: string;
}

/** The slice of the `Callbacks` API the lobby uses, typed for the dynamic state above. */
interface LobbyCallbacks {
  onAdd(prop: 'players', handler: (player: PlayerState, key: string) => void): () => void;
  onRemove(prop: 'players', handler: (player: PlayerState, key: string) => void): () => void;
  onChange(instance: object, handler: () => void): () => void;
  /** A collection field of `instance` (the deck): an item added or changed. */
  onChange(instance: object, prop: 'onubDeck', handler: () => void): () => void;
  onRemove(instance: object, prop: 'onubDeck', handler: () => void): () => void;
  listen(prop: 'leaderId', handler: (value: string) => void): () => void;
  listen(prop: 'settings', handler: (value: SettingsState) => void): () => void;
}

export class ColyseusNetwork implements NetworkService {
  readonly bus: Emitter<NetEvents> = mitt<NetEvents>();
  private readonly client = new Client(SERVER_URL);
  private current: Room | null = null;
  private players = new Map<string, PlayerState>();
  private leaderId = '';
  private settings: LobbySettings = defaultSettings();
  private last: LobbySnapshot | null = null;
  private card: RoleRevealPayload | null = null;
  private disposers: Array<() => void> = [];

  get code(): string | null {
    return this.current?.roomId ?? null;
  }

  get room(): Room | null {
    return this.current;
  }

  get snapshot(): LobbySnapshot | null {
    return this.last;
  }

  get roleCard(): RoleRevealPayload | null {
    return this.card;
  }

  async create(name: string): Promise<string> {
    const options: JoinOptions = { name, build: BUILD_VERSION, deviceId: deviceId() };
    return this.enter(() => this.client.create(ROOM_NAME, options));
  }

  async join(code: string, name: string): Promise<string> {
    const options: JoinOptions = { name, build: BUILD_VERSION, deviceId: deviceId() };
    return this.enter(() => this.client.joinById(code.toUpperCase(), options));
  }

  async resume(code: string): Promise<boolean> {
    const token = reconnectTokens.get(code);
    if (token === null) return false;
    try {
      await this.enter(() => this.client.reconnect(token));
      return true;
    } catch {
      reconnectTokens.clear(code);
      return false;
    }
  }

  send<K extends ClientMessageType>(type: K, payload: ClientMessages[K]): void {
    this.current?.send(type, payload);
  }

  async request<Res = unknown, K extends ClientMessageType = ClientMessageType>(
    type: K,
    payload: ClientMessages[K],
    timeoutMs = 5000,
  ): Promise<Res> {
    if (this.current === null) throw new Error('not connected');
    return this.current.request<ClientMessages[K], Res>(type as never, payload, { timeout: timeoutMs });
  }

  setMode(mode: GameModeId): void {
    this.send('lobby.settings', { mode: GameMode[mode] });
  }

  setNpcDifficulty(level: NpcLevelId): void {
    this.send('lobby.settings', { npcDifficulty: NpcLevel[level] });
  }

  addNpc(): void {
    this.send('lobby.addNpc', {});
  }

  removeNpc(): void {
    this.send('lobby.removeNpc', {});
  }

  setOnubDeck(deck: readonly string[]): void {
    this.send('lobby.settings', { onubDeck: [...deck] });
  }

  setMap(mapId: string): void {
    this.send('lobby.settings', { map: mapId });
  }

  async leave(): Promise<void> {
    const room = this.current;
    if (room === null) return;
    reconnectTokens.clear(room.roomId);
    this.detach();
    this.bus.emit('room', null);
    await room.leave(true);
    this.bus.emit('left', { consented: true });
  }

  private async enter(connect: () => Promise<Room>): Promise<string> {
    let room: Room;
    try {
      room = await connect();
    } catch {
      throw new JoinError();
    }
    this.detach();
    this.current = room;
    reconnectTokens.set(room.roomId, room.reconnectionToken);
    this.wire(room);
    this.bus.emit('room', room);
    return room.roomId;
  }

  private wire(room: Room): void {
    for (const type of SERVER_MESSAGES) {
      room.onMessage(type, (payload: ServerMessages[typeof type]) => {
        if (type === 'gameOver') reconnectTokens.clear(room.roomId);
        if (type === 'roleReveal') this.card = payload as RoleRevealPayload;
        this.bus.emit(type, payload as never);
      });
    }
    room.onLeave((code) => {
      const consented = code === CloseCode.CONSENTED;
      if (consented) reconnectTokens.clear(room.roomId);
      if (this.current === room) {
        this.current = null;
        this.bus.emit('room', null);
      }
      this.bus.emit('left', { consented });
    });
    room.onError((_code, message) => {
      // Transport-level problems are not game errors; surface them without any payload detail.
      this.bus.emit('error', { code: 422, msg: message ?? 'connection error' });
    });

    this.players = new Map();
    this.leaderId = '';
    this.settings = defaultSettings();
    this.last = null;
    this.card = null;
    const cb = Callbacks.get(room) as unknown as LobbyCallbacks;
    const emit = () => this.emitLobby(room);
    this.disposers.push(
      cb.onAdd('players', (player: PlayerState, key: string) => {
        this.players.set(key, player);
        this.disposers.push(cb.onChange(player, emit));
        emit();
      }),
      cb.onRemove('players', (_player: PlayerState, key: string) => {
        this.players.delete(key);
        emit();
      }),
      cb.listen('leaderId', (value: string) => {
        this.leaderId = value;
        emit();
      }),
      cb.listen('settings', (value: SettingsState) => {
        const read = () => {
          this.settings = {
            mode: gameModeId(value.mode),
            npcDifficulty: npcLevelId(value.npcDifficulty),
            npcSeats: value.npcSeats,
            onubDeck: [...(value.onubDeck ?? [])],
            map: value.map || DEFAULT_MAP_ID,
          };
          emit();
        };
        // The deck is a collection: its items change without a change of `settings` itself.
        this.disposers.push(
          cb.onChange(value, read),
          cb.onChange(value, 'onubDeck', read),
          cb.onRemove(value, 'onubDeck', read),
        );
        read();
      }),
    );
    emit();
  }

  private emitLobby(room: Room): void {
    const players: LobbyPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      connected: p.connected,
    }));
    this.last = {
      code: room.roomId,
      selfId: room.sessionId,
      leaderId: this.leaderId,
      players,
      settings: this.settings,
    };
    this.bus.emit('lobby', this.last);
  }

  private detach(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    this.current = null;
    this.card = null;
  }
}
