import { Readable } from 'node:stream';
import type { Application } from 'express';
import { type AdminConfig, adminConfig, signAdminToken } from '../src/services/adminAuth';
import { createGitHub } from '../src/services/github';
import { type DraftSink, type NpcDraftSink, installStudioRoutes } from '../src/services/studioRoutes';
import { FAKE_TOKEN, fakeGitHub } from './fakeGitHub';

/** The Studio's HTTP routes on a fake app with a fake GitHub, for the route tests (round 9). */
export const ENV = {
  WDI_ADMIN: '1',
  WDI_ADMIN_GITHUB_CLIENT_ID: 'client-id',
  WDI_ADMIN_GITHUB_CLIENT_SECRET: 'client-secret',
  WDI_ADMIN_GITHUB_LOGINS: 'Owner-Login',
  WDI_ADMIN_SECRET: 'k'.repeat(44),
  WDI_ADMIN_CLIENT_URL: 'https://example.test/Who-Did-It/',
};
export const cfg = adminConfig(ENV) as AdminConfig;
export const T0 = Date.UTC(2026, 9, 25, 4, 5, 6);
export const bearer = (sub = 'owner-login', exp = T0 / 1000 + 600) =>
  `Bearer ${signAdminToken(cfg, { sub, id: 1, exp })}`;

export type Out = { status: number; headers: Record<string, string>; body: unknown };

/** The routes on a fake app; a call streams its body as the request, like Node's IncomingMessage. */
export function harness(withGitHub = true, drafts?: DraftSink, npcDrafts?: NpcDraftSink) {
  const gh = fakeGitHub();
  let clock = T0;
  const routes = new Map<string, (req: unknown, res: unknown) => unknown>();
  const add = (method: string) => (path: string, fn: (req: unknown, res: unknown) => unknown) =>
    routes.set(`${method} ${path}`, fn);
  const app = { get: add('GET'), post: add('POST'), options: add('OPTIONS') };
  installStudioRoutes(app as unknown as Application, cfg, {
    github: withGitHub ? createGitHub(FAKE_TOKEN, { fetch: gh.fetch }) : null,
    ...(drafts ? { drafts } : {}),
    ...(npcDrafts ? { npcDrafts } : {}),
    now: () => clock,
  });
  const call = async (
    method: string,
    path: string,
    opts: { auth?: string | undefined; body?: unknown; raw?: string; origin?: string } = {},
  ): Promise<Out> => {
    const out: Out = { status: 200, headers: {}, body: undefined };
    const text = opts.raw ?? (opts.body === undefined ? '' : JSON.stringify(opts.body));
    const req = Object.assign(Readable.from(text ? [Buffer.from(text)] : []), {
      headers: { ...(opts.origin ? { origin: opts.origin } : {}) },
      get: (name: string) => (name.toLowerCase() === 'authorization' ? opts.auth : undefined),
    });
    const res = {
      status(n: number) {
        out.status = n;
        return res;
      },
      set(h: string | Record<string, string>, v?: string) {
        Object.assign(out.headers, typeof h === 'string' ? { [h]: v } : h);
        return res;
      },
      json(b: unknown) {
        out.body = b;
        return res;
      },
      end() {
        return res;
      },
    };
    await routes.get(`${method} ${path}`)!(req, res);
    return out;
  };
  return { call, gh, advance: (ms: number) => (clock += ms) };
}
