import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Application, Response } from 'express';
import { TokenBucket } from './TokenBucket';

/**
 * The owner's GitHub login for the admin room (round 6, docs/round6/auto-admin.md 7; ARCHITECTURE 5.11). Pure, with
 * injectable `fetch` and `now`. Variables: `WDI_ADMIN`, `WDI_ADMIN_GITHUB_CLIENT_ID`, `WDI_ADMIN_GITHUB_CLIENT_SECRET`,
 * `WDI_ADMIN_GITHUB_LOGINS`, `WDI_ADMIN_SECRET`, `WDI_ADMIN_CLIENT_URL`. Their values live in the host's settings and
 * never in a file. There is no cookie and no password: GitHub says who the browser is, the allowlist decides, and the
 * answer is a signed bearer token that travels in the join options.
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

/** The OAuth `state` is good this long after `/auth/github/login` issued it. */
export const STATE_TTL_S = 600;

/** A key shorter than this is a phrase a person chose, not 32 random bytes (auto-admin.md 7). */
const MIN_SECRET_LENGTH = 32;

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const GITHUB_USER = 'https://api.github.com/user';

/** Null unless `WDI_ADMIN=1` and every variable is set; null means no admin room and no routes. */
export function adminConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig | null {
  if (env.WDI_ADMIN !== '1') return null;
  const clientId = env.WDI_ADMIN_GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.WDI_ADMIN_GITHUB_CLIENT_SECRET?.trim();
  const secret = env.WDI_ADMIN_SECRET?.trim();
  const clientUrl = env.WDI_ADMIN_CLIENT_URL?.trim();
  const logins = new Set(
    (env.WDI_ADMIN_GITHUB_LOGINS ?? '')
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0),
  );
  if (!clientId || !clientSecret || !secret || !clientUrl || logins.size === 0) return null;
  if (secret.length < MIN_SECRET_LENGTH) return null;
  try {
    const url = new URL(clientUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  return { clientId, clientSecret, logins, secret, clientUrl };
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string): string => Buffer.from(s, 'base64url').toString('utf8');

/** HMAC-SHA256 under the config's key; the purpose prefix keeps a state from ever verifying as a token. */
const mac = (cfg: AdminConfig, purpose: 'state' | 'token', body: string): string =>
  createHmac('sha256', cfg.secret).update(`${purpose}.${body}`).digest('base64url');

const sameMac = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/** `base64url(body) + '.' + HMAC`; `unseal` returns the body only when the signature holds. */
function seal(cfg: AdminConfig, purpose: 'state' | 'token', body: string): string {
  const payload = b64(body);
  return `${payload}.${mac(cfg, purpose, payload)}`;
}

function unseal(cfg: AdminConfig, purpose: 'state' | 'token', sealed: unknown): string | null {
  if (typeof sealed !== 'string' || sealed.length > 2048) return null;
  const parts = sealed.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts as [string, string];
  if (!sameMac(sig, mac(cfg, purpose, payload))) return null;
  return unb64(payload);
}

export function signAdminToken(cfg: AdminConfig, claims: AdminClaims): string {
  return seal(cfg, 'token', JSON.stringify({ sub: claims.sub, id: claims.id, exp: claims.exp }));
}

/**
 * The claims of a token this server signed that has not expired and whose login is still on the allowlist, else
 * null. The allowlist is checked here too, so taking a login off the variable locks it out within the token's life.
 * `exp` is in seconds.
 */
export function verifyAdminToken(
  cfg: AdminConfig,
  token: unknown,
  now: () => number = Date.now,
): Omit<AdminClaims, 'exp'> | null {
  const body = unseal(cfg, 'token', token);
  if (body === null) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof claims !== 'object' || claims === null) return null;
  const { sub, id, exp } = claims as Record<string, unknown>;
  if (typeof sub !== 'string' || typeof id !== 'number' || typeof exp !== 'number') return null;
  if (!(exp * 1000 > now())) return null;
  if (!cfg.logins.has(sub.toLowerCase())) return null;
  return { sub, id };
}

/** A stateless OAuth `state`: a nonce and the issue time under the key. */
export function signState(cfg: AdminConfig, now: () => number = Date.now): string {
  return seal(cfg, 'state', `${randomBytes(16).toString('hex')}.${Math.floor(now() / 1000)}`);
}

/** True for a state this key signed less than `STATE_TTL_S` ago (and not from the future). */
export function verifyState(cfg: AdminConfig, state: unknown, now: () => number = Date.now): boolean {
  const body = unseal(cfg, 'state', state);
  if (body === null) return false;
  const issued = Number(body.split('.')[1]);
  if (!Number.isInteger(issued)) return false;
  const age = Math.floor(now() / 1000) - issued;
  return age >= 0 && age <= STATE_TTL_S;
}

/** The redirect target of a good login: the client's `#/admin?token=...` (the client moves it to sessionStorage). */
export function adminRedirect(cfg: AdminConfig, token: string): string {
  const url = new URL(cfg.clientUrl);
  url.hash = `/admin?token=${token}`;
  return url.toString();
}

const refuse = (res: Response): void => {
  res.status(403).set('Cache-Control', 'no-store').type('text/plain').send('forbidden');
};

const queryString = (v: unknown): string | null => (typeof v === 'string' && v.length <= 512 ? v : null);

/**
 * `GET /auth/github/login` (302 to GitHub, `scope=read:user`) and `GET /auth/github/callback` (state, code, the user's
 * login, the allowlist, the token, 302 to the client). Every failure answers the same 403 with the same text.
 */
export function installAdminAuth(
  app: Application,
  cfg: AdminConfig,
  deps: { fetch?: typeof fetch; now?: () => number } = {},
): void {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  // Each callback costs two GitHub calls, so a flood of them (even with a valid state) is dropped here.
  const callbacks = new TokenBucket(20, 20 / 60, now());

  app.get('/auth/github/login', (_req, res) => {
    const url = new URL(GITHUB_AUTHORIZE);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('scope', 'read:user');
    url.searchParams.set('state', signState(cfg, now));
    url.searchParams.set('allow_signup', 'false');
    res.set('Cache-Control', 'no-store').redirect(302, url.toString());
  });

  app.get('/auth/github/callback', async (req, res) => {
    try {
      const code = queryString(req.query.code);
      if (code === null || !verifyState(cfg, req.query.state, now) || !callbacks.take(now())) {
        return refuse(res);
      }

      const tokenRes = await doFetch(GITHUB_TOKEN, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code }),
        signal: AbortSignal.timeout(8000),
      });
      if (!tokenRes.ok) return refuse(res);
      const accessToken = ((await tokenRes.json()) as { access_token?: unknown }).access_token;
      if (typeof accessToken !== 'string' || accessToken.length === 0) return refuse(res);

      const userRes = await doFetch(GITHUB_USER, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'who-did-it-admin',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!userRes.ok) return refuse(res);
      const user = (await userRes.json()) as { login?: unknown; id?: unknown };
      if (typeof user.login !== 'string' || typeof user.id !== 'number') return refuse(res);
      if (!cfg.logins.has(user.login.toLowerCase())) return refuse(res);

      const token = signAdminToken(cfg, {
        sub: user.login.toLowerCase(),
        id: user.id,
        exp: Math.floor(now() / 1000) + TOKEN_TTL_S,
      });
      res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      res.redirect(302, adminRedirect(cfg, token));
    } catch {
      refuse(res);
    }
  });
}
