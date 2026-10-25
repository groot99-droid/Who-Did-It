import { describe, expect, it } from 'vitest';
import type { StudioSnapshot } from '../admin/StudioNet';
import { arrowBarbs, circleOf } from './annotate';
import { createReportApi, ReportError } from './reportApi';
import { contextOf, facingOf, requestOf } from './reportContext';
import { failureOf } from './ReportPanel';

const snap = {
  tick: 120,
  sceneId: 'bakery',
  profile: 'medium',
  x: 0,
  y: 0,
  tx: 4,
  ty: 7,
  yaw: Math.PI / 2,
  moving: false,
  noclip: false,
  scale: 1,
  paused: false,
  time: { phase: 'dusk', t: 0.25 },
  spawns: [],
  items: [],
} as StudioSnapshot;
const facts = { snapshot: snap, build: 'b1', style: 'ink', overlays: new Set(['ids', 'nav']) };

describe('report context', () => {
  it('names the facing by compass word, wrapping negative yaw', () => {
    expect(facingOf(0)).toBe('east');
    expect(facingOf(Math.PI / 2)).toBe('south');
    expect(facingOf(-Math.PI / 2)).toBe('north');
    expect(facingOf(2 * Math.PI)).toBe('east');
  });

  it('carries the scene, tile, time, style, tick, build and overlays; warnings only when there are some', () => {
    const c = contextOf(facts);
    expect(c).toMatchObject({
      scene: 'bakery',
      tile: '4,7',
      facing: 'south',
      time: 'dusk 0.25',
      style: 'ink',
      tick: 120,
      build: 'b1',
    });
    expect(c.overlays).toEqual(['ids', 'nav']);
    expect('warnings' in c).toBe(false);
    expect(contextOf({ ...facts, warnings: ['gate blocked'] }).warnings).toEqual(['gate blocked']);
  });

  it('keeps only the last 50 log lines', () => {
    const log = Array.from({ length: 80 }, (_, i) => `l${i}`);
    const r = requestOf('data:image/png;base64,AA', 'note', facts, log);
    expect(r.log).toHaveLength(50);
    expect(r.log![0]).toBe('l30');
    expect(r.note).toBe('note');
  });
});

describe('annotation geometry', () => {
  it('puts both barbs behind the arrow tip, the same distance from it', () => {
    const [l, r] = arrowBarbs({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(l.x).toBeLessThan(100);
    expect(r.x).toBeLessThan(100);
    expect(l.y).toBeCloseTo(-r.y);
    expect(Math.hypot(l.x - 100, l.y)).toBeCloseTo(10);
  });

  it('draws a circle from its centre to the dragged edge', () => {
    expect(circleOf({ x: 3, y: 4 }, { x: 6, y: 8 })).toEqual({ c: { x: 3, y: 4 }, r: 5 });
  });
});

const reply = (status: number, body: unknown) =>
  (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;

describe('report api', () => {
  it('posts the report with the bearer token and returns the issue', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = ((url: string, init: RequestInit) => {
      seen = { url, init };
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'd/x', number: 9, url: 'u' }), { status: 201 }),
      );
    }) as unknown as typeof fetch;
    const api = createReportApi('tok', { serverUrl: 'http://s', fetch: f });
    const out = await api.send({ image: 'i', note: 'n' });
    expect(out.number).toBe(9);
    expect(seen!.url).toBe('http://s/studio/report');
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(seen!.init.body as string)).toEqual({ image: 'i', note: 'n' });
  });

  it('lists with a GET and no body', async () => {
    const api = createReportApi('t', { serverUrl: 'http://s', fetch: reply(200, { reports: [] }) });
    expect(await api.list()).toEqual({ reports: [] });
  });

  it('throws the route error with its status, and the NFY line reaches the owner', async () => {
    const nfy = "NFY: the Studio's GitHub token is not set";
    const api = createReportApi('t', { serverUrl: 'http://s', fetch: reply(503, { error: nfy }) });
    const err = await api.send({ image: 'i', note: 'n' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReportError);
    expect((err as ReportError).status).toBe(503);
    expect(failureOf(err)).toContain(nfy);
    expect(failureOf(new TypeError('network'))).toMatch(/did not answer/);
  });
});
