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

  matchMaker.controller.invokeMethod = async (method, roomName, clientOptions, authOptions) => {
    const ip = authOptions?.ip ?? 'unknown';
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
  };
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
