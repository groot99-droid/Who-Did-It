import type { AuthContext, Client } from '@colyseus/core';
import { BUILD_VERSION, type AdminJoinOptions, type JoinOptions } from '@wdi/shared';
import { DEFAULT_MAP, balance } from '@wdi/content';
import { enableAuto } from '../sim/auto/Auto';
import {
  clearAdminClient,
  createAdminView,
  markAdminClient,
  publishAdmin,
  watchAdminFeed,
} from '../sim/auto/AdminView';
import { adminConfig, verifyAdminToken } from '../services/adminAuth';
import { genericJoinError } from '../services/matchmakeGuard';
import { registerAdminHandlers } from './handlers/admin';
import { PartyRoom } from './PartyRoom';

/**
 * The owner's room (round 6, docs/round6/auto-admin.md 7 and 8): a `PartyRoom` that runs an auto match, joined by one
 * seatless client with a GitHub-login token, who sees everything. Registered in `server.ts` only when `adminConfig()`
 * is non-null. `onAuth` runs for create and for every join and refuses with the generic join error, which never says
 * why: no config, a wrong build, no token, a bad or expired token and a login off the allowlist look the same.
 */
export class AdminRoom extends PartyRoom {
  /** The one admin's session id; a second client is refused (more than one admin is out of round 6, section 9). */
  private adminId: string | null = null;

  static override async onAuth(
    _token: unknown,
    options: AdminJoinOptions | undefined,
    _ctx: AuthContext,
  ): Promise<boolean> {
    const cfg = adminConfig();
    if (!cfg || !options || options.build !== BUILD_VERSION) throw genericJoinError();
    if (verifyAdminToken(cfg, options.token) === null) throw genericJoinError();
    return true;
  }

  override async onCreate(options: JoinOptions) {
    await super.onCreate(options);
    enableAuto(this, {
      map: DEFAULT_MAP,
      seats: balance.players.max,
      difficulty: balance.npc.defaultDifficulty as 'easy' | 'normal' | 'hard',
    });
    watchAdminFeed(this);
    registerAdminHandlers(this);
  }

  /**
   * `PartyRoom.onCreate` installs its fixed step through here (and the test helpers do too): the admin room wraps it
   * so every tick ends with the snapshot for the one client.
   */
  override setFixedTimestep(...args: Parameters<PartyRoom['setFixedTimestep']>) {
    const [step, ...rest] = args;
    return super.setFixedTimestep(
      (ctx) => {
        step(ctx);
        this.publish();
      },
      ...rest,
    );
  }

  private publish(): void {
    const client = this.adminId === null ? undefined : this.clients.getById(this.adminId);
    if (!client) return;
    try {
      publishAdmin(this, client);
    } catch (e) {
      console.error('admin snapshot failed', e instanceof Error ? e.message : e);
    }
  }

  /** No seat: the client gets the god view and nothing else (the base class would seat it). */
  override onJoin(client: Client, _options: JoinOptions) {
    if (this.adminId !== null) throw genericJoinError();
    this.adminId = client.sessionId;
    markAdminClient(this, client.sessionId);
    client.view = createAdminView(this);
  }

  /** A dropped admin connection is a leave: the owner opens a new room, so nothing waits for a reconnection. */
  override onDrop(_client: Client) {}

  override onLeave(client: Client) {
    if (client.sessionId !== this.adminId) return;
    this.adminId = null;
    clearAdminClient(this);
    void this.disconnect();
  }
}
