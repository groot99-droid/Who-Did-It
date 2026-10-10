import { Callbacks, Client, type Room as ColyseusRoom } from "@colyseus/sdk";
import mitt, { type Emitter } from "mitt";
import { BUILD_VERSION, SERVER_URL } from "../health";
import {
  type ClientMessages,
  type ClientMessageType,
  type ErrorPayload,
  type GameOverPayload,
  JOIN_FAILED_MESSAGE,
  type JoinOptions,
  type LobbyPlayer,
  type PhaseChangePayload,
  ROOM_NAME,
  type RoleRevealPayload,
  type ServerMessageType,
  type ServerMessages,
} from "./protocol";
import { deviceId, reconnectTokens } from "./storage";

/** The state schema arrives with `@wdi/shared`; until then the room is dynamically typed. */
type Room = ColyseusRoom<any, any>;

export interface LobbySnapshot {
  code: string;
  selfId: string;
  leaderId: string;
  players: LobbyPlayer[];
}

export type NetEvents = {
  lobby: LobbySnapshot;
  roleReveal: RoleRevealPayload;
  phaseChange: PhaseChangePayload;
  gameOver: GameOverPayload;
  error: ErrorPayload;
  /** The connection to the room ended; `consented` is true when the player chose to leave. */
  left: { consented: boolean };
};

/** Thrown by create/join/resume; the UI shows `JOIN_FAILED_MESSAGE` for every cause. */
export class JoinError extends Error {
  constructor() {
    super(JOIN_FAILED_MESSAGE);
    this.name = "JoinError";
  }
}

/** What the scenes depend on; `ColyseusNetwork` and the `?mock=1` `MockNetwork` implement it. */
export interface NetworkService {
  readonly bus: Emitter<NetEvents>;
  readonly code: string | null;
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
}

const SERVER_MESSAGES: readonly ServerMessageType[] = ["roleReveal", "phaseChange", "gameOver", "error"];

/** Minimal view of the room state the lobby needs; the real schema arrives with `@wdi/shared`. */
interface PlayerState {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
}

/** The slice of the `Callbacks` API the lobby uses, typed for the dynamic state above. */
interface LobbyCallbacks {
  onAdd(prop: "players", handler: (player: PlayerState, key: string) => void): () => void;
  onRemove(prop: "players", handler: (player: PlayerState, key: string) => void): () => void;
  onChange(instance: object, handler: () => void): () => void;
  listen(prop: "leaderId", handler: (value: string) => void): () => void;
}

export class ColyseusNetwork implements NetworkService {
  readonly bus: Emitter<NetEvents> = mitt<NetEvents>();
  private readonly client = new Client(SERVER_URL);
  private room: Room | null = null;
  private players = new Map<string, PlayerState>();
  private leaderId = "";
  private disposers: Array<() => void> = [];

  get code(): string | null {
    return this.room?.roomId ?? null;
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
    this.room?.send(type, payload);
  }

  async request<Res = unknown, K extends ClientMessageType = ClientMessageType>(
    type: K,
    payload: ClientMessages[K],
    timeoutMs = 5000,
  ): Promise<Res> {
    if (this.room === null) throw new Error("not connected");
    return this.room.request<ClientMessages[K], Res>(type as never, payload, { timeout: timeoutMs });
  }

  async leave(): Promise<void> {
    const room = this.room;
    if (room === null) return;
    reconnectTokens.clear(room.roomId);
    this.detach();
    await room.leave(true);
    this.bus.emit("left", { consented: true });
  }

  private async enter(connect: () => Promise<Room>): Promise<string> {
    let room: Room;
    try {
      room = await connect();
    } catch {
      throw new JoinError();
    }
    this.detach();
    this.room = room;
    reconnectTokens.set(room.roomId, room.reconnectionToken);
    this.wire(room);
    return room.roomId;
  }

  private wire(room: Room): void {
    for (const type of SERVER_MESSAGES) {
      room.onMessage(type, (payload: ServerMessages[typeof type]) => {
        if (type === "gameOver") reconnectTokens.clear(room.roomId);
        this.bus.emit(type, payload as never);
      });
    }
    room.onLeave((code) => {
      const consented = code === 1000;
      if (consented) reconnectTokens.clear(room.roomId);
      if (this.room === room) this.room = null;
      this.bus.emit("left", { consented });
    });
    room.onError((_code, message) => {
      // Transport-level problems are not game errors; surface them without any payload detail.
      this.bus.emit("error", { code: 422, msg: message ?? "connection error" });
    });

    this.players = new Map();
    this.leaderId = "";
    const cb = Callbacks.get(room) as unknown as LobbyCallbacks;
    const emit = () => this.emitLobby(room);
    this.disposers.push(
      cb.onAdd("players", (player: PlayerState, key: string) => {
        this.players.set(key, player);
        this.disposers.push(cb.onChange(player, emit));
        emit();
      }),
      cb.onRemove("players", (_player: PlayerState, key: string) => {
        this.players.delete(key);
        emit();
      }),
      cb.listen("leaderId", (value: string) => {
        this.leaderId = value;
        emit();
      }),
    );
  }

  private emitLobby(room: Room): void {
    const players: LobbyPlayer[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      connected: p.connected,
    }));
    this.bus.emit("lobby", { code: room.roomId, selfId: room.sessionId, leaderId: this.leaderId, players });
  }

  private detach(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    this.room = null;
  }
}
