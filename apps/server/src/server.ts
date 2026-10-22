import { defineRoom, defineServer } from 'colyseus';
import { BUILD_VERSION } from '@wdi/shared';
import { AdminRoom } from './rooms/AdminRoom';
import { PartyRoom } from './rooms/PartyRoom';
import { adminConfig, installAdminAuth } from './services/adminAuth';
import {
  type GuardLimits,
  installCors,
  isAllowedOrigin,
  installMatchmakeGuard,
} from './services/matchmakeGuard';
import { metrics } from './services/Metrics';

export function createServer(limits: Partial<GuardLimits> = {}) {
  installCors();
  installMatchmakeGuard(limits);
  // Round 6 (docs/round6/auto-admin.md 7, Session 6C): the owner's admin room and its GitHub-login routes exist only
  // when every WDI_ADMIN_* variable is set; `adminConfig` is null otherwise and nothing below registers them.
  const admin = adminConfig();
  return defineServer({
    greet: false,
    rooms: admin
      ? { party: defineRoom(PartyRoom), admin: defineRoom(AdminRoom) }
      : { party: defineRoom(PartyRoom) },
    express: (app) => {
      if (admin) installAdminAuth(app, admin);
      // One proxy hop on Render and Railway. This only affects Express's `req.ip`; the matchmake bucket
      // derives the caller address itself (`clientIp` in matchmakeGuard.ts).
      app.set('trust proxy', 1);
      app.get('/health', (req, res) => {
        const origin = req.headers.origin;
        if (isAllowedOrigin(origin)) res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
        res.json(metrics.snapshot(BUILD_VERSION));
      });
    },
  });
}
