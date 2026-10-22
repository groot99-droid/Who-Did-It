import type { Application } from 'express';

/**
 * The owner's GitHub login for the admin room (round 6, docs/round6/auto-admin.md 7; ARCHITECTURE 5.11). Pure, with
 * injectable `fetch` and `now`. Pre-seeded by 6Z: `adminConfig` returns null, so nothing in `server.ts` registers
 * the `admin` room or its routes; Session 6C fills every body. Variables: `WDI_ADMIN`, `WDI_ADMIN_GITHUB_CLIENT_ID`,
 * `WDI_ADMIN_GITHUB_CLIENT_SECRET`, `WDI_ADMIN_GITHUB_LOGINS`, `WDI_ADMIN_SECRET`, `WDI_ADMIN_CLIENT_URL`.
 */
export interface AdminConfig {
  clientId: string;
  clientSecret: string;
  /** GitHub logins allowed in, lower-case. */
  logins: Set<string>;
  /** The HMAC key of the OAuth state and the admin token. */
  secret: string;
  /** Where the callback sends the browser. */
  clientUrl: string;
}

export interface AdminClaims {
  sub: string;
  id: number;
  exp: number;
}

/** An ops constant, not a game number (ARCHITECTURE 5.11): the admin token lives this long. */
export const TOKEN_TTL_S = 3600;

/** Null unless `WDI_ADMIN=1` and every variable is set; null means no admin room and no routes. */
export function adminConfig(_env: NodeJS.ProcessEnv = process.env): AdminConfig | null {
  return null; // 6C
}

export function signAdminToken(_cfg: AdminConfig, _claims: AdminClaims): string {
  throw new Error('services/adminAuth.ts signAdminToken: round 6, Session 6C');
}

export function verifyAdminToken(
  _cfg: AdminConfig,
  _token: string,
  _now: () => number = Date.now,
): Omit<AdminClaims, 'exp'> | null {
  throw new Error('services/adminAuth.ts verifyAdminToken: round 6, Session 6C');
}

export function installAdminAuth(
  _app: Application,
  _cfg: AdminConfig,
  _deps: { fetch?: typeof fetch; now?: () => number } = {},
): void {
  throw new Error('services/adminAuth.ts installAdminAuth: round 6, Session 6C');
}
