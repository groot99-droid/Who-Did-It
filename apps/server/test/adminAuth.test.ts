import { type ColyseusTestServer, boot } from '@colyseus/testing';
import { BUILD_VERSION, JOIN_ERROR_CODE, JOIN_ERROR_MESSAGE } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Application } from 'express';
import { createServer } from '../src/server';
import {
  type AdminConfig,
  STATE_TTL_S,
  TOKEN_TTL_S,
  adminConfig,
  adminRedirect,
  installAdminAuth,
  signAdminToken,
  signState,
  verifyAdminToken,
  verifyState,
} from '../src/services/adminAuth';

const ENV = {
  WDI_ADMIN: '1',
  WDI_ADMIN_GITHUB_CLIENT_ID: 'client-id',
  WDI_ADMIN_GITHUB_CLIENT_SECRET: 'client-secret',
  WDI_ADMIN_GITHUB_LOGINS: ' Owner-Login , other ',
  WDI_ADMIN_SECRET: 'k'.repeat(44),
  WDI_ADMIN_CLIENT_URL: 'https://example.test/Who-Did-It/',
};
const cfg = adminConfig(ENV) as AdminConfig;
const T0 = 1_800_000_000_000;

describe('adminConfig', () => {
  it('is null unless WDI_ADMIN=1 and every variable is set', () => {
    expect(adminConfig({})).toBeNull();
    expect(adminConfig({ ...ENV, WDI_ADMIN: '0' })).toBeNull();
    expect(adminConfig({ ...ENV, WDI_ADMIN: 'true' })).toBeNull();
    for (const key of Object.keys(ENV).filter((k) => k !== 'WDI_ADMIN')) {
      expect(adminConfig({ ...ENV, [key]: '' }), key).toBeNull();
      const { [key]: _gone, ...rest } = ENV as Record<string, string>;
      expect(adminConfig(rest), key).toBeNull();
    }
    expect(adminConfig({ ...ENV, WDI_ADMIN_GITHUB_LOGINS: ' , ' })).toBeNull();
  });

  it('refuses a short key and a client url that is not http(s)', () => {
    expect(adminConfig({ ...ENV, WDI_ADMIN_SECRET: 'short phrase' })).toBeNull();
    expect(adminConfig({ ...ENV, WDI_ADMIN_CLIENT_URL: 'not a url' })).toBeNull();
    expect(adminConfig({ ...ENV, WDI_ADMIN_CLIENT_URL: 'javascript:alert(1)' })).toBeNull();
  });

  it('lower-cases and trims the allowlist', () => {
    expect([...cfg.logins].sort()).toEqual(['other', 'owner-login']);
  });
});

describe('the token', () => {
  const claims = { sub: 'owner-login', id: 7, exp: Math.floor(T0 / 1000) + TOKEN_TTL_S };

  it('round-trips', () => {
    const token = signAdminToken(cfg, claims);
    expect(verifyAdminToken(cfg, token, () => T0)).toEqual({ sub: 'owner-login', id: 7 });
  });

  it('refuses a tampered payload, a tampered signature and a different key', () => {
    const token = signAdminToken(cfg, claims);
    const [payload, sig] = token.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'other' })).toString('base64url');
    expect(verifyAdminToken(cfg, `${forged}.${sig}`, () => T0)).toBeNull();
    expect(verifyAdminToken(cfg, `${payload}.${sig.slice(0, -2)}AA`, () => T0)).toBeNull();
    expect(verifyAdminToken({ ...cfg, secret: 'z'.repeat(44) }, token, () => T0)).toBeNull();
  });

  it('refuses garbage of every shape', () => {
    for (const bad of ['', 'x', 'a.b', 'a.b.c', '.', undefined, null, 42, {}, 'x'.repeat(5000)]) {
      expect(verifyAdminToken(cfg, bad, () => T0)).toBeNull();
    }
  });

  it('refuses an expired token, at the second it expires', () => {
    const token = signAdminToken(cfg, claims);
    expect(verifyAdminToken(cfg, token, () => (claims.exp - 1) * 1000)).not.toBeNull();
    expect(verifyAdminToken(cfg, token, () => claims.exp * 1000)).toBeNull();
    expect(verifyAdminToken(cfg, token, () => T0 + 10 * TOKEN_TTL_S * 1000)).toBeNull();
  });

  it('checks the allowlist again, case-insensitively', () => {
    const mixed = signAdminToken(cfg, { ...claims, sub: 'OWNER-Login' });
    expect(verifyAdminToken(cfg, mixed, () => T0)).not.toBeNull();
    const stranger = signAdminToken(cfg, { ...claims, sub: 'stranger' });
    expect(verifyAdminToken(cfg, stranger, () => T0)).toBeNull();
    const narrowed = { ...cfg, logins: new Set(['other']) };
    expect(verifyAdminToken(narrowed, signAdminToken(cfg, claims), () => T0)).toBeNull();
  });

  it('is not a state, and a state is not a token', () => {
    const state = signState(cfg, () => T0);
    expect(verifyAdminToken(cfg, state, () => T0)).toBeNull();
    expect(verifyState(cfg, signAdminToken(cfg, claims), () => T0)).toBe(false);
  });
});

describe('the state', () => {
  it('is good for ten minutes and not a second longer, and never from the future', () => {
    const state = signState(cfg, () => T0);
    expect(verifyState(cfg, state, () => T0)).toBe(true);
    expect(verifyState(cfg, state, () => T0 + STATE_TTL_S * 1000)).toBe(true);
    expect(verifyState(cfg, state, () => T0 + (STATE_TTL_S + 1) * 1000)).toBe(false);
    expect(verifyState(cfg, state, () => T0 - 5000)).toBe(false);
  });

  it('is different every time and refuses a tampered one', () => {
    const a = signState(cfg, () => T0);
    expect(signState(cfg, () => T0)).not.toBe(a);
    expect(verifyState(cfg, `${a}x`, () => T0)).toBe(false);
    expect(verifyState(cfg, undefined, () => T0)).toBe(false);
  });
});

/** Just enough of Express: the handlers `installAdminAuth` registers, called with a fake request and response. */
function harness(fetchImpl: typeof fetch, now = () => T0) {
  const routes = new Map<string, (req: unknown, res: unknown) => unknown>();
  const app = { get: (path: string, fn: (req: unknown, res: unknown) => unknown) => routes.set(path, fn) };
  installAdminAuth(app as unknown as Application, cfg, { fetch: fetchImpl, now });
  const call = async (path: string, query: Record<string, unknown> = {}) => {
    const out = { status: 200, location: '', headers: {} as Record<string, string>, body: '' };
    const res = {
      status(n: number) {
        out.status = n;
        return res;
      },
      set(h: string | Record<string, string>, v?: string) {
        Object.assign(out.headers, typeof h === 'string' ? { [h]: v } : h);
        return res;
      },
      type: () => res,
      send(b: string) {
        out.body = b;
        return res;
      },
      redirect(n: number, url: string) {
        out.status = n;
        out.location = url;
        return res;
      },
    };
    await routes.get(path)!({ query }, res);
    return out;
  };
  return { call, routes };
}

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
/** A fake GitHub: `code` -> access token -> user. */
function github(user: { login: string; id: number } | null, calls: string[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('https://github.com/login/oauth/access_token')) {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body.client_id).toBe('client-id');
      expect(body.client_secret).toBe('client-secret');
      return body.code === 'good'
        ? json({ access_token: 'gho_abc' })
        : json({ error: 'bad_verification_code' });
    }
    if (u === 'https://api.github.com/user') {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer gho_abc');
      return user ? json(user) : json({}, false);
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as typeof fetch;
}

describe('the routes', () => {
  it('login redirects to GitHub with the client id, read:user and a fresh signed state', async () => {
    const { call } = harness(github(null));
    const res = await call('/auth/github/login');
    expect(res.status).toBe(302);
    const url = new URL(res.location);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('scope')).toBe('read:user');
    expect(verifyState(cfg, url.searchParams.get('state'), () => T0)).toBe(true);
    expect(res.location).not.toContain('client-secret');
  });

  it('callback with the owner signs a token and sends the browser to the client hash route', async () => {
    const calls: string[] = [];
    const { call } = harness(github({ login: 'Owner-Login', id: 99 }, calls));
    const res = await call('/auth/github/callback', { code: 'good', state: signState(cfg, () => T0) });
    expect(res.status).toBe(302);
    expect(res.location.startsWith('https://example.test/Who-Did-It/#/admin?token=')).toBe(true);
    const token = res.location.split('token=')[1];
    expect(verifyAdminToken(cfg, token, () => T0)).toEqual({ sub: 'owner-login', id: 99 });
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(calls).toHaveLength(2);
  });

  it('callback answers one 403 for every failure and never says which', async () => {
    const state = () => signState(cfg, () => T0);
    const cases: [string, typeof fetch, Record<string, unknown>][] = [
      ['a login off the allowlist', github({ login: 'stranger', id: 1 }), { code: 'good', state: state() }],
      ['a code GitHub refuses', github({ login: 'owner-login', id: 1 }), { code: 'bad', state: state() }],
      ['no user answer', github(null), { code: 'good', state: state() }],
      ['a missing code', github({ login: 'owner-login', id: 1 }), { state: state() }],
      ['a missing state', github({ login: 'owner-login', id: 1 }), { code: 'good' }],
      ['a forged state', github({ login: 'owner-login', id: 1 }), { code: 'good', state: 'a.b' }],
      ['an array state', github({ login: 'owner-login', id: 1 }), { code: 'good', state: ['a', 'b'] }],
      [
        'a fetch that throws',
        (async () => {
          throw new Error('network');
        }) as typeof fetch,
        { code: 'good', state: state() },
      ],
    ];
    const bodies = new Set<string>();
    for (const [name, f, query] of cases) {
      const res = await harness(f).call('/auth/github/callback', query);
      expect(res.status, name).toBe(403);
      expect(res.location, name).toBe('');
      bodies.add(res.body);
    }
    expect(bodies.size).toBe(1);
  });

  it('callback refuses a stale state without calling GitHub', async () => {
    const calls: string[] = [];
    const stale = signState(cfg, () => T0 - (STATE_TTL_S + 1) * 1000);
    const res = await harness(github({ login: 'owner-login', id: 1 }, calls)).call('/auth/github/callback', {
      code: 'good',
      state: stale,
    });
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('callback drops a flood before it reaches GitHub', async () => {
    const calls: string[] = [];
    const { call } = harness(github({ login: 'stranger', id: 1 }, calls));
    for (let i = 0; i < 30; i++) {
      const res = await call('/auth/github/callback', { code: 'good', state: signState(cfg, () => T0) });
      expect(res.status).toBe(403);
    }
    expect(calls.length).toBe(40); // 20 callbacks got through, two GitHub calls each
  });
});

describe('adminRedirect', () => {
  it('replaces any hash on the client url', () => {
    expect(adminRedirect({ ...cfg, clientUrl: 'http://localhost:5173/Who-Did-It/#/old' }, 't0k')).toBe(
      'http://localhost:5173/Who-Did-It/#/admin?token=t0k',
    );
  });
});

describe('the registration gate (server.ts)', () => {
  let colyseus: ColyseusTestServer;
  beforeAll(async () => {
    for (const key of Object.keys(ENV)) delete process.env[key];
    colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
  });
  afterAll(async () => colyseus.shutdown());

  it('has no admin room without the variables: create fails like any room that does not exist', async () => {
    const token = signAdminToken(cfg, {
      sub: 'owner-login',
      id: 1,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const err = await colyseus.sdk
      .create('admin', { build: BUILD_VERSION, token })
      .then(() => null)
      .catch((e: { code?: number; message?: string }) => ({ code: e.code, message: e.message }));
    expect(err).toEqual({ code: JOIN_ERROR_CODE, message: JOIN_ERROR_MESSAGE });
  });

  it('has no login routes without the variables', async () => {
    for (const path of ['/auth/github/login', '/auth/github/callback?code=x&state=y']) {
      const res = await fetch(`http://localhost:2568${path}`, { redirect: 'manual' });
      expect(res.status, path).toBe(404);
    }
  });
});
