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
  NpcLevel,
  Phase,
  SceneState,
  TICK_RATE,
  type JoinOptions,
} from '@wdi/shared';
import { balance } from '@wdi/content';
import { CommandQueue } from '../sim/Commands';
import { simOf } from '../sim/RoomSim';
import { step } from '../sim/Step';
import { SCENE_KEYS, createPlayerView } from '../sim/Visibility';
import { CodeRegistry } from '../services/CodeRegistry';
import { genericJoinError } from '../services/matchmakeGuard';
import { metrics } from '../services/Metrics';
import { registerDebugHandlers } from './handlers/debug';
import {
  isLobbyCommand,
  newSeat,
  removeNewestNpcSeat,
  runLobbyCommands,
  runLobbyPhase,
} from './handlers/lobby';
import { isNpcSeat } from '../sim/Npc';
import { registerMovement } from './handlers/movement';
import { type FixedSeeds, MatchSeeds } from '../sim/seeds';
import { clockOf, stepsThisTick } from '../sim/auto/clock';

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
  /** The match's independent random streams (`sim/seeds.ts`); replaced at every Start. */
  seeds = new MatchSeeds();
  /**
   * Room memory only, tests only: the seed words the test helper `fixSeeds` stores, read by every Start's
   * `new MatchSeeds(...)`. Always undefined in production; no message or debug handler sets it.
   */
  fixedSeeds: FixedSeeds | undefined = undefined;
  /** The last tick's wall time per step, for the clock's budget (round 6, `sim/auto/clock.ts`). */
  private lastStepMs = 0;
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
    state.settings.npcDifficulty = NpcLevel[balance.npc.defaultDifficulty as keyof typeof NpcLevel];
    for (const key of SCENE_KEYS) state.scenes.set(key, new SceneState());
    this.setState(state);

    this.onMessage('*', (client, type, payload) => {
      // Nothing mutates state here: the step consumes the queue (ARCHITECTURE 5.6).
      if (typeof type !== 'string' || !isCommandType(type)) return;
      (isLobbyCommand(type) ? this.lobbyCommands : this.commands).push(client, type, payload);
    });

    this.setFixedTimestep((ctx) => {
      // Round 6 (docs/round6/auto-admin.md 2, locked): the clock says how many steps this tick runs; a `party` room
      // always runs one. The sample recorded is per step, so `tickP95` stays comparable at every scale.
      const n = stepsThisTick(clockOf(this), this.lastStepMs);
      if (n === 0) return;
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        step(this, ctx);
        runLobbyCommands(this);
        runLobbyPhase(this);
      }
      this.lastStepMs = (performance.now() - t0) / n;
      metrics.recordTick(this.lastStepMs);
    }, TICK_RATE);

    registerMovement(this);
    if (process.env.WDI_DEBUG === '1') registerDebugHandlers(this);
    metrics.addRoom(1);
  }

  override onJoin(client: Client, options: JoinOptions) {
    const name = cleanName(options.name);
    if (name === null) throw genericJoinError();
    // A seat reserved just before Start would otherwise join after the deal with no role and no card.
    if (this.state.phase !== Phase.lobby) throw genericJoinError();

    // A human joining a full party takes an NPC seat (GDD 3.12).
    if (this.state.players.size >= MAX_PLAYERS) removeNewestNpcSeat(this);
    newSeat(this, client.sessionId, name);
    if (this.state.leaderId === '') this.state.leaderId = client.sessionId;

    // Only this player's own Player (so `priv` arrives) and their scene are in the view.
    client.view = createPlayerView(this, client.sessionId);
  }

  /**
   * A dropped connection (not a consented leave). In the lobby the seat survives `disconnect.deathAfterS`
   * for a reconnection (GDD 3.10); during play there is no window, so `onLeave` runs at once (M7).
   */
  override onDrop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.state.phase !== Phase.lobby) return;
    player.connected = false;
    this.passLeader(client.sessionId);
    void this.allowReconnection(client, balance.disconnect.deathAfterS).catch(() => undefined);
  }

  override onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  /** The seat is gone for good: the window lapsed, or the player left on purpose. */
  override onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (this.state.phase === Phase.lobby) {
      this.state.players.delete(client.sessionId);
      this.passLeader(client.sessionId);
      return;
    }
    // During play the seat stays and becomes a ghost with no body (A30); the next step records the death.
    player.connected = false;
    simOf(this).deaths.push({ playerId: client.sessionId, cause: 'vanished', tick: this.state.tick });
    this.passLeader(client.sessionId);
  }

  /** The leader role moves to the first connected seat when the leader drops or leaves. */
  private passLeader(leaverId: string): void {
    if (this.state.leaderId !== leaverId) return;
    for (const [id, p] of this.state.players) {
      if (id !== leaverId && p.connected && !isNpcSeat(this, id)) {
        this.state.leaderId = id;
        return;
      }
    }
    if (!this.state.players.has(leaverId)) this.state.leaderId = '';
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
