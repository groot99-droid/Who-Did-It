import { randomBytes } from 'node:crypto';
import type { Application, Request, Response } from 'express';
import type { Scene } from '@wdi/content';
import { BUILD_VERSION, type StudioDraftResponse } from '@wdi/shared';
import { type AdminConfig, verifyAdminToken } from './adminAuth';
import { type GitHub, GitHubError } from './github';
import {
  type NpcData,
  SaveRefused,
  checkDataSave,
  checkNpcDraft,
  checkSave,
  checkScene,
  isDataFile,
} from './studioSave';
import { isAllowedOrigin } from './matchmakeGuard';
import { TokenBucket } from './TokenBucket';

/**
 * The Studio's HTTP routes (round 9, docs/round9/admin-studio.md 5): `POST /studio/report` and `GET /studio/reports`.
 * `POST /studio/save` re-checks an edited scene (`studioSave.ts`) and opens a draft PR with it and its nav.
 * Since N1 (admin-studio.md 8) it also takes `{ file, json }` for the data files of the allowlist (`studioSave.ts`).
 * `POST /studio/draft` runs the same checks and hands the scene to the owner's Studio room to walk, unsaved;
 * `POST /studio/npc-draft` does the same for edited NPC data (routines, quests, looks).
 * Registered only beside the admin gate (`server.ts`); each checks the admin bearer token before anything else and
 * is rate limited. Without `WDI_ADMIN_GITHUB_TOKEN` (`github` null) they answer 503 with the NFY line, and the rest
 * of the Studio still works. The server keeps nothing: the screenshot and the issue live on GitHub.
 */

export const NFY_TOKEN = "NFY: the Studio's GitHub token is not set";
export const REPORT_LABEL = 'admin-report';
export const REPORT_BRANCH = 'admin-reports';
/** Contract limits: a screenshot over 4 MB is refused; 30 reports an hour. */
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
export const REPORTS_PER_HOUR = 30;
/** Contract limit: 20 saves an hour. */
export const SAVES_PER_HOUR = 20;
/** The largest scene file is about 21 KB; a save body past this is not read. */
const MAX_SAVE_BYTES = 1024 * 1024;
/** Inbox reads and Walk-it drafts: tooling caps, not game numbers. */
export const READS_PER_MIN = 60;
export const DRAFTS_PER_HOUR = 120;
/** The base64 of 4 MB plus the note and the context; a body past this is not read. */
const MAX_BODY_BYTES = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 256 * 1024;
/** An issue body holds 65 536 characters; the note keeps room for the context. */
export const MAX_NOTE_CHARS = 50_000;
const MAX_CONTEXT_KEYS = 40;
const MAX_VALUE_CHARS = 500;
export const MAX_LOG_LINES = 50;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Where a checked draft goes: `queued`, or why not. `server.ts` finds the room among this process's rooms only, so a
 * draft reaches the room when the route and the room share a process, as the server runs today (one process); a
 * server split over processes would have to route the draft to the room's process.
 */
export type DraftSink = (roomId: string, scene: Scene) => 'queued' | 'no room' | 'busy';

/** Where a checked NPC draft goes, as `DraftSink`. */
export type NpcDraftSink = (roomId: string, npc: NpcData) => 'queued' | 'no room' | 'busy';

export interface StudioRouteDeps {
  github: GitHub | null;
  drafts?: DraftSink;
  npcDrafts?: NpcDraftSink;
  now?: () => number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg);
  }
}

/** The request's JSON body, read up to `max` bytes (there is no body parser on this server). */
async function readJson(req: Request, max: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, 'too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(422, 'bad body');
  }
}

export interface ReportInput {
  png: Buffer;
  note: string;
  context: Array<[string, string]>;
  log: string[];
}

const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').slice(0, MAX_VALUE_CHARS);

/** The report of an untrusted body, or an `HttpError`: a PNG of at most 4 MB, a note, a flat context, log lines. */
export function parseReport(raw: unknown): ReportInput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new HttpError(422, 'bad body');
  const { image, note, context, log } = raw as Record<string, unknown>;
  if (typeof image !== 'string' || typeof note !== 'string') throw new HttpError(422, 'bad body');
  if (note.length > MAX_NOTE_CHARS) throw new HttpError(413, 'note too long');
  const png = Buffer.from(image.replace(/^data:image\/png;base64,/, ''), 'base64');
  if (png.length > MAX_SCREENSHOT_BYTES) throw new HttpError(413, 'screenshot over 4 MB');
  if (png.length < PNG_MAGIC.length || !png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new HttpError(422, 'not a png');
  }
  const rows: Array<[string, string]> = [];
  if (context !== undefined) {
    if (typeof context !== 'object' || context === null || Array.isArray(context)) {
      throw new HttpError(422, 'bad context');
    }
    const entries = Object.entries(context as Record<string, unknown>);
    if (entries.length > MAX_CONTEXT_KEYS) throw new HttpError(422, 'bad context');
    for (const [key, value] of entries) {
      if (!/^[\w.-]{1,40}$/.test(key)) throw new HttpError(422, 'bad context');
      const text = Array.isArray(value)
        ? value.every((v) => typeof v === 'string')
          ? value.join(', ')
          : null
        : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : null;
      if (text === null) throw new HttpError(422, 'bad context');
      rows.push([key, oneLine(text)]);
    }
  }
  if (log !== undefined && (!Array.isArray(log) || !log.every((l) => typeof l === 'string'))) {
    throw new HttpError(422, 'bad log');
  }
  const lines = ((log as string[] | undefined) ?? []).slice(-MAX_LOG_LINES).map(oneLine);
  return { png, note, context: rows, log: lines };
}

const cell = (s: string): string => s.replace(/\|/g, '\\|');

/** The issue body: the note verbatim, the context table, the screenshot, the log, and the build last. */
export function reportBody(input: ReportInput, imageUrl: string, build = BUILD_VERSION): string {
  const table = input.context.length
    ? ['| Key | Value |', '|---|---|', ...input.context.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`)].join(
        '\n',
      )
    : '_No context._';
  const log = input.log.length
    ? `<details><summary>Studio log (${input.log.length} lines)</summary>\n\n\`\`\`text\n${input.log
        .map((l) => l.replace(/```/g, "'''"))
        .join('\n')}\n\`\`\`\n\n</details>`
    : '';
  return [
    input.note,
    '## Context',
    table,
    '## Screenshot',
    `![screenshot](${imageUrl}?raw=true)`,
    log,
    `Build \`${build}\``,
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

/** The Inbox state of an issue: closed is fixed, an open issue with a comment is answered. */
export const reportState = (state: 'open' | 'closed', comments: number): 'open' | 'answered' | 'fixed' =>
  state === 'closed' ? 'fixed' : comments > 0 ? 'answered' : 'open';

const pad = (n: number): string => String(n).padStart(2, '0');

/** What one save writes: the files, the branch stem, the PR title, its change list and its checks paragraph. */
export interface SavePlan {
  stem: string;
  title: string;
  files: Array<{ path: string; text: string; message: string }>;
  summary: string[];
  checks: string;
}

const DATA_DIR = 'packages/content/data';

/**
 * The save of an untrusted body (admin-studio.md 5 and 8): `{ file, json }` for a file of the allowlist, or the older
 * `{ scene }`, which is `{ file: 'scenes/<id>.json', json: scene }`. Throws `SaveRefused` or a 422 `HttpError`.
 */
export function planSave(file: unknown, json: unknown, scene: unknown, nav: unknown): SavePlan {
  if (file === undefined) return planScene(scene, nav, null);
  if (scene !== undefined) throw new HttpError(422, 'bad body');
  if (isDataFile(file)) {
    if (nav !== undefined) throw new HttpError(422, 'bad body');
    const save = checkDataSave(file, json);
    return {
      stem: file.slice(0, -'.json'.length),
      title: file,
      files: [{ path: `${DATA_DIR}/${file}`, text: save.text, message: `Studio: ${file}` }],
      summary: save.summary,
      checks: `The server re-ran the \`${file}\` schema, refused unknown keys and re-ran the whole content validator with this file in place.`,
    };
  }
  const m = typeof file === 'string' ? /^scenes\/([a-z_]+)\.json$/.exec(file) : null;
  if (m === null) throw new SaveRefused(['not a file the Studio saves']);
  return planScene(json, nav, m[1]!);
}

function planScene(scene: unknown, nav: unknown, fileId: string | null): SavePlan {
  const save = checkSave(scene);
  const id = save.scene.id;
  if (fileId !== null && fileId !== id)
    throw new SaveRefused([`the file is scenes/${fileId}.json, the scene is ${id}`]);
  if (nav !== undefined && JSON.stringify(nav) !== JSON.stringify(save.nav))
    throw new SaveRefused(["the editor's nav does not match the grid"]);
  return {
    stem: id,
    title: id,
    files: [
      { path: `${DATA_DIR}/scenes/${id}.json`, text: save.sceneText, message: `Studio: ${id}` },
      { path: `${DATA_DIR}/scenes/${id}.nav.json`, text: save.navText, message: `Studio: ${id} nav` },
      {
        path: `apps/client/public/assets/scenes/${id}/tilemap.json`,
        text: save.tilemapText,
        message: `Studio: ${id} tilemap`,
      },
    ],
    summary: save.summary,
    checks:
      'The server re-ran the scene schema and the whole content validator with this scene in place, and regenerated the nav and the tilemap from the grid, as `pnpm grid:export` does.',
  };
}

export function installStudioRoutes(app: Application, cfg: AdminConfig, deps: StudioRouteDeps): void {
  const now = deps.now ?? Date.now;
  const reports = new TokenBucket(REPORTS_PER_HOUR, REPORTS_PER_HOUR / 3600, now());
  const reads = new TokenBucket(READS_PER_MIN, READS_PER_MIN / 60, now());
  const saves = new TokenBucket(SAVES_PER_HOUR, SAVES_PER_HOUR / 3600, now());
  const drafts = new TokenBucket(DRAFTS_PER_HOUR, DRAFTS_PER_HOUR / 3600, now());

  const cors = (req: Request, res: Response): void => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
    res.set('Cache-Control', 'no-store');
  };
  /** The bearer check, then the bucket: an unsigned caller never spends the owner's budget. */
  const auth = (req: Request, bucket: TokenBucket): void => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (verifyAdminToken(cfg, token, now) === null) throw new HttpError(403, 'forbidden');
    if (!bucket.take(now())) throw new HttpError(429, 'too many requests');
  };
  const gate = (req: Request, bucket: TokenBucket): GitHub => {
    auth(req, bucket);
    if (deps.github === null) throw new HttpError(503, NFY_TOKEN);
    return deps.github;
  };
  const fail = (res: Response, e: unknown): void => {
    if (e instanceof SaveRefused) {
      res.status(422).json({ error: e.message, problems: e.problems });
      return;
    }
    const status = e instanceof HttpError ? e.status : 502;
    const error = e instanceof HttpError ? e.message : 'GitHub refused the request';
    if (!(e instanceof HttpError))
      console.error('studio route failed', e instanceof Error ? e.message : 'unknown');
    res.status(status).json({ error });
  };

  for (const path of [
    '/studio/report',
    '/studio/reports',
    '/studio/save',
    '/studio/draft',
    '/studio/npc-draft',
  ]) {
    app.options(path, (req, res) => {
      cors(req, res);
      res.set({
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      });
      res.status(204).end();
    });
  }

  app.post('/studio/report', async (req, res) => {
    cors(req, res);
    try {
      const github = gate(req, reports);
      const input = parseReport(await readJson(req, MAX_BODY_BYTES));
      const d = new Date(now());
      const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      const id = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}-${randomBytes(3).toString('hex')}`;
      await github.ensureBranch(REPORT_BRANCH, await github.defaultBranch());
      const imageUrl = await github.putFile(
        REPORT_BRANCH,
        `reports/${day}/${id}.png`,
        input.png.toString('base64'),
        `Studio report ${day}/${id}`,
      );
      const scene = input.context.find(([k]) => k === 'scene')?.[1];
      const first = input.note.split('\n')[0]!.trim().slice(0, 60) || 'no note';
      const title = `Studio report${scene ? ` (${scene})` : ''}: ${first}`;
      const issue = await github.createIssue(title, reportBody(input, imageUrl), [REPORT_LABEL]);
      res.status(201).json({ id: `${day}/${id}`, number: issue.number, url: issue.url });
    } catch (e) {
      fail(res, e);
    }
  });

  app.post('/studio/save', async (req, res) => {
    cors(req, res);
    try {
      const github = gate(req, saves);
      const body = await readJson(req, MAX_SAVE_BYTES);
      const { file, json, scene, nav, note } = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;
      if (note !== undefined && typeof note !== 'string') throw new HttpError(422, 'bad body');
      if (typeof note === 'string' && note.length > MAX_NOTE_CHARS) throw new HttpError(413, 'note too long');
      const save = planSave(file, json, scene, nav);
      const d = new Date(now());
      const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
      const branch = `studio/${save.stem}-${stamp}`;
      const base = await github.defaultBranch();
      try {
        await github.createBranch(branch, base);
      } catch (e) {
        if (e instanceof GitHubError && e.status === 422)
          throw new HttpError(409, 'this file was saved this minute; try again in a minute');
        throw e;
      }
      const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');
      for (const f of save.files) await github.putFile(branch, f.path, b64(f.text), f.message);
      const prBody = [
        typeof note === 'string' && note.trim() ? note : '_No note._',
        '## Changes',
        save.summary.join('\n'),
        '## Checks',
        save.checks,
        `Build \`${BUILD_VERSION}\``,
      ].join('\n\n');
      const pull = await github.createDraftPull(branch, base, `Studio: ${save.title}`, prBody);
      res.status(201).json({ branch, number: pull.number, url: pull.url });
    } catch (e) {
      fail(res, e);
    }
  });

  // A draft needs no GitHub token: nothing is written anywhere. The room applies it inside its step.
  app.post('/studio/draft', async (req, res) => {
    cors(req, res);
    try {
      auth(req, drafts);
      const body = await readJson(req, MAX_SAVE_BYTES);
      const { roomId, scene } = (typeof body === 'object' && body !== null ? body : {}) as Record<
        string,
        unknown
      >;
      if (typeof roomId !== 'string' || !/^[\w-]{1,64}$/.test(roomId)) throw new HttpError(422, 'bad body');
      const checked = checkScene(scene);
      const sent = deps.drafts?.(roomId, checked) ?? 'no room';
      // One answer for a bad id, a party room, an empty Studio room: the route does not tell room ids apart.
      if (sent === 'no room') throw new HttpError(404, 'not found');
      if (sent === 'busy') throw new HttpError(429, 'busy');
      res.status(202).json({ queued: true } satisfies StudioDraftResponse);
    } catch (e) {
      fail(res, e);
    }
  });

  // As `/studio/draft`, for the NPC editor's preview (admin-studio.md 8): no GitHub, nothing written.
  app.post('/studio/npc-draft', async (req, res) => {
    cors(req, res);
    try {
      auth(req, drafts);
      const body = await readJson(req, MAX_SAVE_BYTES);
      const { roomId, routines, quests, looks } = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;
      if (typeof roomId !== 'string' || !/^[\w-]{1,64}$/.test(roomId)) throw new HttpError(422, 'bad body');
      const npc = checkNpcDraft({ routines, quests, looks });
      const sent = deps.npcDrafts?.(roomId, npc) ?? 'no room';
      if (sent === 'no room') throw new HttpError(404, 'not found');
      if (sent === 'busy') throw new HttpError(429, 'busy');
      res.status(202).json({ queued: true } satisfies StudioDraftResponse);
    } catch (e) {
      fail(res, e);
    }
  });

  app.get('/studio/reports', async (req, res) => {
    cors(req, res);
    try {
      const github = gate(req, reads);
      const issues = await github.listIssues(REPORT_LABEL);
      const list = await Promise.all(
        issues.map(async (i) => ({
          number: i.number,
          title: i.title,
          state: reportState(i.state, i.comments),
          url: i.url,
          createdAt: i.createdAt,
          body: i.body,
          comments: i.comments > 0 ? await github.listComments(i.number) : [],
        })),
      );
      res.json({ reports: list });
    } catch (e) {
      fail(res, e);
    }
  });
}
