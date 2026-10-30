import { readFileSync } from 'node:fs';
import { BUILD_VERSION } from '@wdi/shared';
import { describe, expect, it, vi } from 'vitest';
import { formatDataJson } from '../src/services/studioSave';
import {
  MAX_LOG_LINES,
  MAX_SCREENSHOT_BYTES,
  DRAFTS_PER_HOUR,
  type DraftSink,
  NFY_TOKEN,
  REPORTS_PER_HOUR,
  SAVES_PER_HOUR,
} from '../src/services/studioRoutes';
import { FAKE_TOKEN } from './fakeGitHub';
import { T0, bearer, harness } from './studioHttpHelpers';

// Round 10, 10X (x12): the draft route's rate-limit test sends DRAFTS_PER_HOUR scenes and the route checks each
// against the whole content set (about 3 s alone), so vitest's 5 s default timed it out on a loaded machine while
// CI passed. The budget the other route-heavy suites use; the test itself has no clock in it.
vi.setConfig({ testTimeout: 30_000 });

/** A PNG signature followed by `extra` bytes, as base64. */
const png = (extra = 16) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(extra, 7),
  ]).toString('base64');

const report = (extra: Record<string, unknown> = {}) => ({
  image: `data:image/png;base64,${png()}`,
  note: 'The bakery door | sticks.\nSecond line, *verbatim*.',
  context: { scene: 'bakery', tile: '8,9', tick: 120, overlays: ['grid', 'ids'], noclip: false },
  log: ['t1 scene bakery', 't2 noclip on'],
  ...extra,
});

describe('POST /studio/report', () => {
  it('commits the screenshot to admin-reports and opens a labelled issue with the note, context, image and build', async () => {
    const { call, gh } = harness();
    const res = await call('POST', '/studio/report', { auth: bearer(), body: report() });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: 1, url: expect.stringContaining('/issues/1') });
    const id = (res.body as { id: string }).id;
    expect(id).toMatch(/^2026-10-25\/040506-[0-9a-f]{6}$/);

    expect(gh.refs.get('admin-reports')).toBe('sha-main');
    const file = gh.files.get(`admin-reports:reports/${id}.png`);
    expect(file?.content).toBe(png());

    const issue = gh.issues[0]!;
    expect(issue.labels).toEqual(['admin-report']);
    expect(issue.title).toBe('Studio report (bakery): The bakery door | sticks.');
    expect(issue.body.startsWith(report().note)).toBe(true);
    expect(issue.body).toContain('| scene | bakery |');
    expect(issue.body).toContain('| overlays | grid, ids |');
    expect(issue.body).toContain(`reports/${id}.png?raw=true`);
    expect(issue.body).toContain('t2 noclip on');
    expect(issue.body.trimEnd().endsWith(`Build \`${BUILD_VERSION}\``)).toBe(true);
    expect(issue.body).not.toContain(FAKE_TOKEN);
  });

  it('refuses a bad or missing token with 403 before reading anything or calling GitHub', async () => {
    const { call, gh } = harness();
    for (const auth of [undefined, 'Bearer nope', bearer('stranger'), bearer('owner-login', T0 / 1000 - 1)]) {
      const res = await call('POST', '/studio/report', { auth, body: report() });
      expect(res.status, String(auth)).toBe(403);
    }
    expect(gh.calls).toEqual([]);
  });

  it('answers the NFY line with 503 when the GitHub token is not set', async () => {
    const { call } = harness(false);
    const res = await call('POST', '/studio/report', { auth: bearer(), body: report() });
    expect(res).toMatchObject({ status: 503, body: { error: NFY_TOKEN } });
    const list = await call('GET', '/studio/reports', { auth: bearer() });
    expect(list).toMatchObject({ status: 503, body: { error: NFY_TOKEN } });
  });

  it('refuses a screenshot over 4 MB, a file that is not a PNG, and bad bodies', async () => {
    const { call, gh } = harness();
    const big = await call('POST', '/studio/report', {
      auth: bearer(),
      body: report({ image: png(MAX_SCREENSHOT_BYTES) }),
    });
    expect(big.status).toBe(413);
    const cases: [unknown, number][] = [
      [report({ image: Buffer.from('GIF89a....').toString('base64') }), 422],
      [report({ note: 7 }), 422],
      [report({ note: 'x'.repeat(50_001) }), 413],
      [report({ context: { 'bad key!': 1 } }), 422],
      [report({ context: { scene: { nested: true } } }), 422],
      [report({ log: [1, 2] }), 422],
      [[1, 2], 422],
    ];
    for (const [body, status] of cases) {
      expect((await call('POST', '/studio/report', { auth: bearer(), body })).status).toBe(status);
    }
    expect((await call('POST', '/studio/report', { auth: bearer(), raw: '{not json' })).status).toBe(422);
    expect(gh.issues).toEqual([]);
  });

  it('keeps only the last 50 log lines and flattens newlines in the context', async () => {
    const { call, gh } = harness();
    const log = Array.from({ length: 80 }, (_, i) => `line ${i}`);
    await call('POST', '/studio/report', {
      auth: bearer(),
      body: report({ log, context: { scene: 'a\nb' } }),
    });
    const body = gh.issues[0]!.body;
    expect(body).toContain(`(${MAX_LOG_LINES} lines)`);
    expect(body).not.toContain('line 29\n');
    expect(body).toContain('line 79');
    expect(body).toContain('| scene | a b |');
  });

  it('allows 30 reports an hour, then 429, and refills', async () => {
    const { call, advance } = harness();
    for (let i = 0; i < REPORTS_PER_HOUR; i++) {
      expect((await call('POST', '/studio/report', { auth: bearer(), body: report() })).status).toBe(201);
    }
    expect((await call('POST', '/studio/report', { auth: bearer(), body: report() })).status).toBe(429);
    advance(120_000 + 1);
    expect((await call('POST', '/studio/report', { auth: bearer(), body: report() })).status).toBe(201);
  });

  it('answers 502 when GitHub refuses, with no detail and no token', async () => {
    const { call, gh } = harness();
    gh.fail(500);
    const res = await call('POST', '/studio/report', { auth: bearer(), body: report() });
    expect(res).toMatchObject({ status: 502, body: { error: 'GitHub refused the request' } });
    expect(JSON.stringify(res)).not.toContain(FAKE_TOKEN);
  });
});

describe('GET /studio/reports', () => {
  it('lists the admin-report issues with their state and comments, for the Inbox', async () => {
    const { call, gh } = harness();
    for (let i = 0; i < 3; i++) await call('POST', '/studio/report', { auth: bearer(), body: report() });
    gh.issues.push({ number: 4, title: 'not a report', body: '', labels: ['bug'], state: 'open' });
    gh.comment(2, 'claude', 'Fixed in #300.');
    gh.issues[2]!.state = 'closed';
    const res = await call('GET', '/studio/reports', { auth: bearer() });
    expect(res.status).toBe(200);
    const rows = (res.body as { reports: { number: number; state: string; comments: unknown[] }[] }).reports;
    expect(rows.map((r) => [r.number, r.state, r.comments.length])).toEqual([
      [3, 'fixed', 0],
      [2, 'answered', 1],
      [1, 'open', 0],
    ]);
    expect(rows[1]!.comments[0]).toMatchObject({ author: 'claude', body: 'Fixed in #300.' });
  });

  it('refuses a bad token with 403', async () => {
    const { call } = harness();
    expect((await call('GET', '/studio/reports', { auth: 'Bearer x' })).status).toBe(403);
  });
});

describe('CORS', () => {
  it('answers the preflight for the Pages origin only, and sets no-store', async () => {
    const { call } = harness();
    const ok = await call('OPTIONS', '/studio/report', { origin: 'https://groot99-droid.github.io' });
    expect(ok.status).toBe(204);
    expect(ok.headers['Access-Control-Allow-Origin']).toBe('https://groot99-droid.github.io');
    expect(ok.headers['Access-Control-Allow-Headers']).toContain('Authorization');
    const other = await call('OPTIONS', '/studio/reports', { origin: 'https://evil.test' });
    expect(other.headers['Access-Control-Allow-Origin']).toBeUndefined();
    const res = await call('GET', '/studio/reports', {
      auth: bearer(),
      origin: 'https://groot99-droid.github.io',
    });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});

/** The bakery as its file, with one tile by the east wall made a wall (grid and material), as the editor sends it. */
function editedBakery(): { grid: string[]; material: string[]; portals: Array<{ id: string }> } {
  const s = JSON.parse(
    readFileSync(new URL('../../../packages/content/data/scenes/bakery.json', import.meta.url), 'utf8'),
  );
  const put = (row: string, ch: string) => row.slice(0, 16) + ch + row.slice(17);
  s.grid[6] = put(s.grid[6], '#');
  s.material[6] = put(s.material[6], 'W');
  return s;
}
const fromB64 = (b64: string | undefined) => Buffer.from(b64 ?? '', 'base64').toString('utf8');

describe('POST /studio/save', () => {
  it('re-checks the scene, commits it and its regenerated nav on a studio branch, and opens a draft PR', async () => {
    const { call, gh } = harness();
    const scene = editedBakery();
    const res = await call('POST', '/studio/save', {
      auth: bearer(),
      body: { scene, note: 'Close the east gap.' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      branch: 'studio/bakery-20261025-0405',
      number: 101,
      url: expect.stringContaining('/pull/101'),
    });
    const branch = 'studio/bakery-20261025-0405';
    expect(gh.refs.get(branch)).toBe('sha-main');
    const file = fromB64(gh.files.get(`${branch}:packages/content/data/scenes/bakery.json`)?.content);
    expect(file).toBe(formatDataJson(scene));
    const nav = JSON.parse(
      fromB64(gh.files.get(`${branch}:packages/content/data/scenes/bakery.nav.json`)?.content),
    );
    expect(nav.solid[6]).toBe('1' + '0'.repeat(15) + '11');
    const tilemap = fromB64(
      gh.files.get(`${branch}:apps/client/public/assets/scenes/bakery/tilemap.json`)?.content,
    );
    expect(JSON.parse(tilemap)).toMatchObject({ orientation: 'isometric', width: 18, height: 11 });
    const pull = gh.pulls[0]!;
    expect(pull).toMatchObject({ head: branch, base: 'main', title: 'Studio: bakery', draft: true });
    expect(pull.body.startsWith('Close the east gap.')).toBe(true);
    expect(pull.body).toContain('- grid: 1 row changed');
    expect(pull.body.trimEnd().endsWith(`Build \`${BUILD_VERSION}\``)).toBe(true);
    expect(JSON.stringify(gh.calls.map((c) => c.body))).not.toContain(FAKE_TOKEN);
  });

  it('refuses an invalid scene and a frozen-id rename with 422 and every problem, and calls no GitHub', async () => {
    const { call, gh } = harness();
    const bad = editedBakery();
    bad.grid[2] = 'Z' + bad.grid[2]!.slice(1);
    const r1 = await call('POST', '/studio/save', { auth: bearer(), body: { scene: bad } });
    expect(r1).toMatchObject({ status: 422, body: { problems: ['grid.2: grid rows use only # D S H B .'] } });
    const renamed = editedBakery();
    renamed.portals[0] = { ...renamed.portals[0]!, id: 'bk.front_door' };
    const r2 = await call('POST', '/studio/save', { auth: bearer(), body: { scene: renamed } });
    expect(r2.status).toBe(422);
    expect((r2.body as { problems: string[] }).problems).toContain(
      'frozen id removed or renamed: portals bk.door',
    );
    const nav = await call('POST', '/studio/save', {
      auth: bearer(),
      body: { scene: editedBakery(), nav: { w: 1 } },
    });
    expect(nav).toMatchObject({ status: 422, body: { error: "the editor's nav does not match the grid" } });
    expect((await call('POST', '/studio/save', { auth: bearer(), raw: '{' })).status).toBe(422);
    expect(gh.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('refuses a second save of the scene in the same minute with 409', async () => {
    const { call, gh } = harness();
    expect(
      (await call('POST', '/studio/save', { auth: bearer(), body: { scene: editedBakery() } })).status,
    ).toBe(201);
    const again = await call('POST', '/studio/save', { auth: bearer(), body: { scene: editedBakery() } });
    expect(again.status).toBe(409);
    expect(gh.pulls).toHaveLength(1);
  });

  it('is gated: 403 without the token, the NFY line without GitHub, and 20 saves an hour', async () => {
    const { call, gh, advance } = harness();
    expect(
      (await call('POST', '/studio/save', { auth: 'Bearer x', body: { scene: editedBakery() } })).status,
    ).toBe(403);
    expect(gh.calls).toEqual([]);
    const off = harness(false);
    expect(await off.call('POST', '/studio/save', { auth: bearer(), body: {} })).toMatchObject({
      status: 503,
      body: { error: NFY_TOKEN },
    });
    for (let i = 0; i < SAVES_PER_HOUR; i++) {
      expect((await call('POST', '/studio/save', { auth: bearer(), body: { scene: {} } })).status).toBe(422);
    }
    expect((await call('POST', '/studio/save', { auth: bearer(), body: { scene: {} } })).status).toBe(429);
    advance(3600_000 / SAVES_PER_HOUR);
    expect((await call('POST', '/studio/save', { auth: bearer(), body: { scene: {} } })).status).toBe(422);
  });
});

describe('POST /studio/draft', () => {
  /** A sink that records what reached the room, as `server.ts` queues it on the Studio room. */
  const sink = (answer: ReturnType<DraftSink> = 'queued') => {
    const got: Array<{ roomId: string; scene: { id: string; grid: string[] } }> = [];
    const fn: DraftSink = (roomId, scene) => {
      got.push({ roomId, scene });
      return answer;
    };
    return { got, fn };
  };

  it('checks the scene and hands it to the room without GitHub, with no write anywhere', async () => {
    const room = sink();
    const { call, gh } = harness(false, room.fn);
    const scene = editedBakery();
    const res = await call('POST', '/studio/draft', { auth: bearer(), body: { roomId: 'Ab_c-1', scene } });
    expect(res).toMatchObject({ status: 202, body: { queued: true } });
    expect(room.got).toHaveLength(1);
    expect(room.got[0]!.roomId).toBe('Ab_c-1');
    expect(room.got[0]!.scene.grid[6]).toBe(scene.grid[6]);
    expect(gh.calls).toEqual([]);
    const same = JSON.parse(
      readFileSync(new URL('../../../packages/content/data/scenes/bakery.json', import.meta.url), 'utf8'),
    );
    expect(
      (await call('POST', '/studio/draft', { auth: bearer(), body: { roomId: 'r', scene: same } })).status,
    ).toBe(202);
  });

  it('refuses what a save refuses, with every problem, and reaches no room', async () => {
    const room = sink();
    const { call } = harness(true, room.fn);
    const colour = editedBakery();
    (colour.portals[0] as Record<string, unknown>).colour = 'red';
    const renamed = editedBakery();
    renamed.portals[0]!.id = 'bk.front';
    for (const scene of [colour, renamed]) {
      const res = await call('POST', '/studio/draft', { auth: bearer(), body: { roomId: 'r', scene } });
      expect(res.status).toBe(422);
      expect((res.body as { problems: string[] }).problems.length).toBeGreaterThan(0);
    }
    const bad = await call('POST', '/studio/draft', { auth: bearer(), body: { roomId: 'r', scene: colour } });
    expect((bad.body as { problems: string[] }).problems.join('\n')).toContain('colour');
    for (const roomId of [undefined, '', 'a/b', 'x'.repeat(65)]) {
      const res = await call('POST', '/studio/draft', {
        auth: bearer(),
        body: { roomId, scene: editedBakery() },
      });
      expect(res).toMatchObject({ status: 422, body: { error: 'bad body' } });
    }
    expect(room.got).toEqual([]);
  });

  it('answers 404 without the room, 429 when its queue is full, and is gated and limited', async () => {
    const body = { roomId: 'r', scene: editedBakery() };
    expect((await harness(true).call('POST', '/studio/draft', { auth: bearer(), body })).status).toBe(404);
    expect(
      (await harness(true, sink('no room').fn).call('POST', '/studio/draft', { auth: bearer(), body }))
        .status,
    ).toBe(404);
    expect(
      (await harness(true, sink('busy').fn).call('POST', '/studio/draft', { auth: bearer(), body })).status,
    ).toBe(429);
    const room = sink();
    const { call } = harness(true, room.fn);
    const big = await call('POST', '/studio/draft', {
      auth: bearer(),
      raw: JSON.stringify({ roomId: 'r', scene: { pad: 'x'.repeat(1024 * 1024) } }),
    });
    expect(big).toMatchObject({ status: 413, body: { error: 'too large' } });
    expect(room.got).toEqual([]);
    expect((await call('POST', '/studio/draft', { body })).status).toBe(403);
    expect((await call('POST', '/studio/draft', { auth: bearer('someone-else'), body })).status).toBe(403);
    for (let i = 1; i < DRAFTS_PER_HOUR; i++)
      expect((await call('POST', '/studio/draft', { auth: bearer(), body })).status).toBe(202);
    expect((await call('POST', '/studio/draft', { auth: bearer(), body })).status).toBe(429);
    expect(room.got).toHaveLength(DRAFTS_PER_HOUR - 1);
  });
});
