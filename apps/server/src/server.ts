import { defineRoom, defineServer } from 'colyseus';
import { BUILD_VERSION } from '@wdi/shared';
import { PartyRoom } from './rooms/PartyRoom';
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
  return defineServer({
    greet: false,
    rooms: { party: defineRoom(PartyRoom) },
    express: (app) => {
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
