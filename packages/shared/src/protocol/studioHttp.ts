// Round 9: the Studio's HTTP routes (docs/round9/admin-studio.md 5), served beside the admin gate. Every request
// carries `Authorization: Bearer <admin token>`. Errors answer `{ error }`: 403 a bad token, 413 too large, 422 a bad
// body, 429 over the limit, 502 GitHub refused, 503 the GitHub token is not set (`error` is then the NFY line), and
// for a save, 409 a save of the same scene in the same minute.

/** `POST /studio/report`: a PNG screenshot (base64, a `data:image/png;base64,` prefix allowed, at most 4 MB). */
export interface StudioReportRequest {
  image: string;
  /** Any length up to 50 000 characters, filed verbatim. */
  note: string;
  /** Flat facts for the issue's table (`scene`, `tile`, `facing`, `time`, `style`, `tick`, `build`, `overlays`, ...). */
  context?: Record<string, string | number | boolean | string[]>;
  /** The last lines of the Studio room's log (`studio.log`); only the last 50 are kept. */
  log?: string[];
}

/** 201: the issue opened for the report; `id` is `<yyyy-mm-dd>/<hhmmss>-<hex>`, the screenshot's path stem. */
export interface StudioReportResponse {
  id: string;
  number: number;
  url: string;
}

export interface StudioReportComment {
  author: string;
  body: string;
  createdAt: string;
}

/** One report of the Inbox: closed is `fixed`, an open issue with a comment is `answered`. */
export interface StudioReportRow {
  number: number;
  title: string;
  state: 'open' | 'answered' | 'fixed';
  url: string;
  createdAt: string;
  body: string;
  comments: StudioReportComment[];
}

/** `GET /studio/reports`: the `admin-report` issues, newest first, at most 50. */
export interface StudioReportsResponse {
  reports: StudioReportRow[];
}

/**
 * `POST /studio/save`: an edited scene of `SCENE_IDS`, as the JSON of its file, with keys in the file's order. The
 * server re-runs every check and regenerates the nav; `nav`, when sent, must equal what it regenerates.
 */
export interface StudioSaveRequest {
  scene: unknown;
  nav?: unknown;
  /** The owner's note for the PR body, up to 50 000 characters. */
  note?: string;
}

/** 201: the draft PR opened on `branch` (`studio/<scene>-<yyyymmdd-hhmm>`). */
export interface StudioSaveResponse {
  branch: string;
  number: number;
  url: string;
}

/** 422 of a refused save: `error` is the first problem; `problems` lists them all for the checks panel. */
export interface StudioSaveRefused {
  error: string;
  problems: string[];
}

/**
 * `POST /studio/draft` (Walk it): the edited scene for the owner's open Studio room (`room.roomId`), checked as a save
 * is (an unchanged scene is fine) and never written anywhere. A refusal is a `StudioSaveRefused` with 422; 404 when
 * the room is gone. `studio.draft {scene: null}` over the room drops it.
 */
export interface StudioDraftRequest {
  roomId: string;
  scene: unknown;
}

/** 202 of `POST /studio/draft`: queued; the room's next snapshot carries `draft: true`. */
export interface StudioDraftResponse {
  queued: true;
}
