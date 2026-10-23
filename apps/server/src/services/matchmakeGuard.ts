import { ServerError, matchMaker } from '@colyseus/core';
import { JOIN_ERROR_CODE, JOIN_ERROR_MESSAGE } from '@wdi/shared';
import { KeyedBuckets, TokenBucket } from './TokenBucket';

/** 30/min per forwarded IP with burst 10, plus a global cap of 300 joinById/min (ARCHITECTURE 5.3). */
export const IP_BURST = 10;
export const IP_PER_MIN = 30;
export const GLOBAL_JOIN_BY_ID_PER_MIN = 300;
export const THROTTLED_CODE = 429;

export interface GuardLimits {
  ipBurst: number;
  ipPerMin: number;
  globalPerMin: number;
}
export const DEFAULT_LIMITS: GuardLimits = {
  ipBurst: IP_BURST,
  ipPerMin: IP_PER_MIN,
  globalPerMin: GLOBAL_JOIN_BY_ID_PER_MIN,
};

export const genericJoinError = () => new ServerError(JOIN_ERROR_CODE, JOIN_ERROR_MESSAGE);

type Invoke = typeof matchMaker.controller.invokeMethod;

export interface GuardClock {
  now(): number;
}

/**
 * Wraps `matchMaker.controller.invokeMethod`, the single entry of the HTTP matchmake route:
 * rate limits by caller IP, and turns every failure into the one generic join error so a probe
 * cannot tell a missing room from a locked, full or wrong-build one.
 */
export function installMatchmakeGuard(
  limits: Partial<GuardLimits> = {},
  clock: GuardClock = { now: Date.now },
) {
  const { ipBurst, ipPerMin, globalPerMin } = { ...DEFAULT_LIMITS, ...limits };
  const perIp = new KeyedBuckets(ipBurst, ipPerMin / 60);
  const global = new TokenBucket(globalPerMin, globalPerMin / 60, clock.now());
  const original: Invoke = matchMaker.controller.invokeMethod.bind(matchMaker.controller);

  // Round 7 (GDD 3.21): `GET /parties` draws from the same per-IP bucket and has a global bucket of its own, so a
  // menu polling the list cannot use up the joinById cap.
  const listGlobal = new TokenBucket(globalPerMin, globalPerMin / 60, clock.now());
  routeGate = (ip) => perIp.take(ip, clock.now()) && listGlobal.take(clock.now());

  matchMaker.controller.invokeMethod = async (method, roomName, clientOptions, authOptions) => {
    const ip = clientIp(authOptions);
    const allowed = perIp.take(ip, clock.now()) && (method !== 'joinById' || global.take(clock.now()));
    if (!allowed) throw new ServerError(THROTTLED_CODE, 'too many requests');
    try {
      return await original(method, roomName, clientOptions, authOptions);
    } catch {
      throw genericJoinError();
    }
  };

  return () => {
    matchMaker.controller.invokeMethod = original;
    routeGate = null;
  };
}

let routeGate: ((ip: string) => boolean) | null = null;

/** True when an HTTP route (`GET /parties`) may run for this caller; always true while no guard is installed. */
export const allowRoute = (ip: string): boolean => routeGate === null || routeGate(ip);

/**
 * The address the per-IP bucket keys on. `AuthContext.ip` is the FIRST `x-forwarded-for` hop, which
 * the client can forge to get a fresh bucket per request; behind the single trusted proxy of Render or
 * Railway the real address is the LAST hop, the one the proxy appended. Express's `trust proxy` setting
 * never reaches the matchmake route, so the guard derives the key itself.
 */
export function clientIp(auth?: {
  ip?: string | undefined;
  headers?: { get(name: string): string | null | undefined } | undefined;
}): string {
  const xff = auth?.headers?.get('x-forwarded-for');
  const last = xff?.split(',').at(-1)?.trim();
  return last || auth?.ip || 'unknown';
}

const ALLOWED_ORIGINS = new Set(['https://groot99-droid.github.io']);
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export const isAllowedOrigin = (origin: string | null | undefined): origin is string =>
  !!origin && (ALLOWED_ORIGINS.has(origin) || LOCALHOST.test(origin));

/** CORS restricted to the Pages origin and localhost (ARCHITECTURE 5.10). */
export function installCors() {
  delete (matchMaker.controller.DEFAULT_CORS_HEADERS as Record<string, string>)[
    'Access-Control-Allow-Origin'
  ];
  matchMaker.controller.getCorsHeaders = (headers) => {
    const origin = headers.get('origin');
    return isAllowedOrigin(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : { Vary: 'Origin' };
  };
}
