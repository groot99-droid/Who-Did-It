import type { AuthContext } from '@colyseus/core';
import type { AdminJoinOptions } from '@wdi/shared';
import { genericJoinError } from '../services/matchmakeGuard';
import { PartyRoom } from './PartyRoom';

/**
 * The owner's room (round 6, docs/round6/auto-admin.md 7 and 8): a `PartyRoom` that runs an auto match, joined
 * by one seatless client with a GitHub-login token, who sees everything. Registered in `server.ts` only when
 * `adminConfig()` is non-null, so this class is unreachable in production until Session 6C sets the variables and
 * fills it. Its `onAuth` refuses with the generic join error, which never says why.
 */
export class AdminRoom extends PartyRoom {
  static override async onAuth(
    _token: unknown,
    _options: AdminJoinOptions,
    _ctx: AuthContext,
  ): Promise<boolean> {
    throw genericJoinError(); // 6C: verifyAdminToken(cfg, options.token)
  }
}
