import { type AuthContext, type Client, Room, ServerError } from '@colyseus/core';
import {
  BUILD_VERSION,
  C2S,
  GameState,
  type GameStateType,
  MAX_MESSAGES_PER_SECOND,
  MAX_PLAYERS,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PATCH_RATE_MS,
  Phase,
  Player,
  Presence,
  Private,
  Role,
  SceneState,
  Inventory,
  TICK_RATE,
  Traits,
  type JoinOptions,
} from '@wdi/shared';
import { CommandQueue } from '../sim/Commands';
import { step } from '../sim/Step';
import { SCENE_KEYS, createPlayerView } from '../sim/Visibility';
import { CodeRegistry } from '../services/CodeRegistry';
import { genericJoinError } from '../services/matchmakeGuard';
import { metrics } from '../services/Metrics';
import { registerDebugHandlers } from './handlers/debug';
import { isLobbyCommand, runLobbyCommands, runLobbyPhase } from './handlers/lobby';
import { registerMovement } from './handlers/movement';

const codeRegistries = new WeakMap<object, CodeRegistry>();

/** Names are 2-16 characters (ARCHITECTURE 5.11). */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  return name.length >= NAME_MIN_LENGTH && name.length <= NAME_MAX_LENGTH ? name : null;
}

const isCommandType = (type: string): boolean => (Object.values(C2S) as string[]).includes(type);

export class PartyRoom extends Room<{ state: GameStateType }> {
  override maxClients = MAX_PLAYERS;
  override patchRate = PATCH_RATE_MS;
  /** Hard cap (ARCHITECTURE 5.11); the per-type buckets of M7 drop rather than disconnect. */
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  readonly commands = new CommandQueue();
  /** Lobby and role-card messages; drained by `runLobbyCommands` inside the fixed step. */
  readonly lobbyCommands = new CommandQueue();
  /** Room memory only: never sent to clients, kept for reproducing a deal while debugging. */
  matchSeed = 0;
  private code = '';

  /**
   * Runs for create and every join in the matchmaker, before any seat exists. Any problem throws the same
   * generic error the join route returns for a missing or full room (ARCHITECTURE 5.3, 5.10).
   */
  static override async onAuth(
    _token: string | undefined,
    options: Partial<JoinOptions> | undefined,
    _ctx: AuthContext,
  ) {
    if (!options || options.build !== BUILD_VERSION || cleanName(options.name) === null) {
      throw genericJoinError();
    }
    if (
      typeof options.deviceId !== 'string' ||
      options.deviceId.length === 0 ||
      options.deviceId.length > 64
    ) {
      throw genericJoinError();
    }
    return true;
  }

  override async onCreate(_options: JoinOptions) {
    const registry = this.registry();
    this.code = await registry.claim();
    this.roomId = this.code;
    await this.setMatchmaking({ private: true, maxClients: MAX_PLAYERS });

    const state = new GameState();
    state.phase = Phase.lobby;
    for (const key of SCENE_KEYS) state.scenes.set(key, new SceneState());
    this.setState(state);

    this.onMessage('*', (client, type, payload) => {
      // Nothing mutates state here: the step consumes the queue (ARCHITECTURE 5.6).
      if (typeof type !== 'string' || !isCommandType(type)) return;
      (isLobbyCommand(type) ? this.lobbyCommands : this.commands).push(client, type, payload);
    });

    this.setFixedTimestep((ctx) => {
      const t0 = performance.now();
      step(this, ctx);
      runLobbyCommands(this);
      runLobbyPhase(this);
      metrics.recordTick(performance.now() - t0);
    }, TICK_RATE);

    registerMovement(this);
    if (process.env.WDI_DEBUG === '1') registerDebugHandlers(this);
    metrics.addRoom(1);
  }

  override onJoin(client: Client, options: JoinOptions) {
    const name = cleanName(options.name);
    if (name === null) throw genericJoinError();

    const player = new Player();
    player.id = client.sessionId;
    player.name = name;
    player.connected = true;
    player.traits = new Traits();
    player.presence = new Presence();
    player.priv = new Private();
    player.priv.role = new Role();
    player.priv.inventory = new Inventory();
    this.state.players.set(client.sessionId, player);
    if (this.state.leaderId === '') this.state.leaderId = client.sessionId;

    // Only this player's own Player (so `priv` arrives) and their scene are in the view.
    client.view = createPlayerView(this, client.sessionId);
  }

  override onLeave(client: Client) {
    // Lobby: a leaving player frees the seat. In-play "vanished" bodies arrive with M3.
    this.state.players.delete(client.sessionId);
    if (this.state.leaderId === client.sessionId) {
      this.state.leaderId = this.state.players.keys().next().value ?? '';
    }
  }

  override onDispose() {
    this.registry().release(this.code);
    metrics.addRoom(-1);
  }

  private registry(): CodeRegistry {
    let registry = codeRegistries.get(this.presence);
    if (!registry) {
      registry = new CodeRegistry(this.presence);
      codeRegistries.set(this.presence, registry);
    }
    return registry;
  }
}

export { ServerError };
