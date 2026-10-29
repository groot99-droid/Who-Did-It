import { type AuthContext, type Client, Room } from '@colyseus/core';
import type { Scene } from '@wdi/content';
import {
  BUILD_VERSION,
  refusalFrame,
  MAX_MESSAGES_PER_SECOND,
  S2C,
  STUDIO_C2S,
  STUDIO_S2C,
  TICK_RATE,
  type StudioJoinOptions,
} from '@wdi/shared';
import { adminConfig, verifyAdminToken } from '../services/adminAuth';
import { genericJoinError } from '../services/matchmakeGuard';
import {
  MAX_STUDIO_COMMANDS,
  type StudioNpcData,
  type StudioSim,
  createStudio,
  parseStudio,
  stepStudio,
  studioSnapshot,
} from '../sim/studio/Studio';

const STUDIO_TYPES = new Set<string>(Object.values(STUDIO_C2S));

/**
 * The owner's Studio (round 9, docs/round9/admin-studio.md 1 and 2): creative mode over one scene of `@wdi/content`.
 * Registered in `server.ts` beside `admin`, only when `adminConfig()` is non-null; `onAuth` checks the build and the
 * admin token for create and every join and refuses with the generic join error. It is not a `PartyRoom`: no schema
 * state, no seats, no cards, no match, and it never reads a `party` room. One client; a leave disposes it.
 */
export class StudioRoom extends Room {
  override maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  readonly sim: StudioSim = createStudio();
  /** The one client's session id; a second is refused with the generic error, as in `AdminRoom`. */
  private ownerId: string | null = null;
  private lastStepMs = 0;

  static override async onAuth(
    _token: unknown,
    options: StudioJoinOptions | undefined,
    _ctx: AuthContext,
  ): Promise<boolean> {
    const cfg = adminConfig();
    if (!cfg || !options || options.build !== BUILD_VERSION) throw genericJoinError();
    if (verifyAdminToken(cfg, options.token) === null) throw genericJoinError();
    return true;
  }

  override onCreate() {
    this.onMessage('*', (client, type, payload) => {
      // Nothing changes here: the step applies the queue (CLAUDE.md).
      if (client.sessionId !== this.ownerId || typeof type !== 'string' || !STUDIO_TYPES.has(type)) return;
      const cmd = parseStudio(type, payload);
      if (typeof cmd === 'string') return this.refuse(client, cmd);
      if (this.sim.commands.length >= MAX_STUDIO_COMMANDS) return this.refuse(client, 'busy');
      this.sim.commands.push(cmd);
    });
    this.setFixedTimestep(() => this.tick(), TICK_RATE);
  }

  /**
   * A draft `POST /studio/draft` has checked: queued like any command, so only the step applies it. A room whose owner
   * is not connected takes none (`no room`, which the route answers as its generic 404).
   */
  queueDraft(scene: Scene): 'queued' | 'no room' | 'busy' {
    if (this.ownerId === null || !this.clients.getById(this.ownerId)) return 'no room';
    if (this.sim.commands.length >= MAX_STUDIO_COMMANDS) return 'busy';
    this.sim.commands.push({ kind: 'draft', scene });
    return 'queued';
  }

  /** NPC data `POST /studio/npc-draft` has checked, queued as `queueDraft` queues a scene. */
  queueNpcDraft(npc: StudioNpcData): 'queued' | 'no room' | 'busy' {
    if (this.ownerId === null || !this.clients.getById(this.ownerId)) return 'no room';
    if (this.sim.commands.length >= MAX_STUDIO_COMMANDS) return 'busy';
    this.sim.commands.push({ kind: 'npcDraft', npc });
    return 'queued';
  }

  private tick(): void {
    const t0 = performance.now();
    const before = this.sim.tick;
    const refusals = stepStudio(this.sim, this.lastStepMs);
    const ran = this.sim.tick - before;
    if (ran > 0) this.lastStepMs = (performance.now() - t0) / ran;
    const client = this.ownerId === null ? undefined : this.clients.getById(this.ownerId);
    if (!client) {
      this.sim.log.length = 0;
      return;
    }
    for (const why of refusals) this.refuse(client, why);
    if (this.sim.log.length > 0) client.send(STUDIO_S2C.log, { lines: this.sim.log.splice(0) });
    client.send(STUDIO_S2C.snapshot, studioSnapshot(this.sim));
  }

  private refuse(client: Client, msg: string): void {
    client.send(S2C.error, refusalFrame('BAD_REQUEST', undefined, { msg }));
  }

  override onJoin(client: Client) {
    if (this.ownerId !== null) throw genericJoinError();
    this.ownerId = client.sessionId;
  }

  /** A dropped connection is a leave: the Studio page opens a new room. */
  override onDrop() {}

  override onLeave(client: Client) {
    if (client.sessionId !== this.ownerId) return;
    this.ownerId = null;
    void this.disconnect();
  }
}
