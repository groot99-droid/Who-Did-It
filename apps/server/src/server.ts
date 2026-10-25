import { defineRoom, defineServer } from 'colyseus';
import { BUILD_VERSION } from '@wdi/shared';
import { AdminRoom } from './rooms/AdminRoom';
import { PartyRoom } from './rooms/PartyRoom';
import { StudioRoom } from './rooms/StudioRoom';
import { adminConfig, installAdminAuth } from './services/adminAuth';
import {
  type GuardLimits,
  allowRoute,
  clientIp,
  THROTTLED_CODE,
  installCors,
  isAllowedOrigin,
  installMatchmakeGuard,
} from './services/matchmakeGuard';
import { metrics } from './services/Metrics';
import { listParties } from './services/partyListing';
import { cleanProfile } from './rooms/PartyRoom';

export function createServer(limits: Partial<GuardLimits> = {}) {
  installCors();
  installMatchmakeGuard(limits);
  // Round 6 (docs/round6/auto-admin.md 7, Session 6C): the owner's admin room and its GitHub-login routes exist only
  // when every WDI_ADMIN_* variable is set; `adminConfig` is null otherwise and nothing below registers them. Round 9
  // (docs/round9/admin-studio.md 1): the Studio room sits behind the same gate.
  const admin = adminConfig();
  return defineServer({
    greet: false,
    rooms: admin
      ? { party: defineRoom(PartyRoom), admin: defineRoom(AdminRoom), studio: defineRoom(StudioRoom) }
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
      // Round 7 (GDD 3.21): the party list. Same per-IP bucket and a global cap as the matchmake route; a bad
      // profile gets an empty list, not an error.
      app.get('/parties', async (req, res) => {
        const origin = req.headers.origin;
        if (isAllowedOrigin(origin)) res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
        res.set('Cache-Control', 'no-store');
        const ip = clientIp({ ip: req.ip, headers: { get: (name) => req.get(name) } });
        if (!allowRoute(ip)) {
          res.status(THROTTLED_CODE).json({ error: 'too many requests' });
          return;
        }
        const raw = req.query.profile;
        const profile = raw === undefined ? null : cleanProfile(raw);
        if (raw !== undefined && profile === null) {
          res.json({ parties: [] });
          return;
        }
        res.json({ parties: await listParties(profile) });
      });
    },
  });
}
