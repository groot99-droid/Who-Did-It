/**
 * The Studio's GitHub client (round 9, docs/round9/admin-studio.md 5): the REST calls the report and save routes
 * need, against one repository, with one fine-grained token. The token comes from `WDI_ADMIN_GITHUB_TOKEN` and is
 * only ever put in the `Authorization` header: no error, log line or return value carries it. `fetch` is injectable
 * so tests run against a fake GitHub.
 */

/** The repository the Studio files reports and saves into. */
export const STUDIO_REPO = 'groot99-droid/Who-Did-It';

const API = 'https://api.github.com';
const TIMEOUT_MS = 10_000;

/** A failed GitHub call: the method, the path (no query) and the status, never a header or a body. */
export class GitHubError extends Error {
  constructor(
    readonly status: number,
    what: string,
  ) {
    super(`GitHub ${what} answered ${status}`);
  }
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  url: string;
  createdAt: string;
  comments: number;
}

export interface GitHubComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface GitHub {
  readonly repo: string;
  /** The repository's default branch name. */
  defaultBranch(): Promise<string>;
  /** Creates `branch` from the head of `from`; a `GitHubError` 422 when it exists already. */
  createBranch(branch: string, from: string): Promise<void>;
  /** Creates `branch` from the head of `from` unless it exists; resolves either way. */
  ensureBranch(branch: string, from: string): Promise<void>;
  /** Creates or replaces one file on a branch from base64 content; resolves to its blob URL. */
  putFile(branch: string, path: string, base64: string, message: string): Promise<string>;
  createIssue(title: string, body: string, labels: string[]): Promise<{ number: number; url: string }>;
  /** Opens a draft pull request of `head` into `base`. */
  createDraftPull(
    head: string,
    base: string,
    title: string,
    body: string,
  ): Promise<{ number: number; url: string }>;
  /** Issues (not pull requests) carrying `label`, open and closed, newest first, at most 50. */
  listIssues(label: string): Promise<GitHubIssue[]>;
  listComments(issue: number): Promise<GitHubComment[]>;
}

/** The token of `WDI_ADMIN_GITHUB_TOKEN`, or null when it is not set. */
export function githubToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.WDI_ADMIN_GITHUB_TOKEN?.trim();
  return token ? token : null;
}

const enc = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

export function createGitHub(token: string, deps: { fetch?: typeof fetch; repo?: string } = {}): GitHub {
  const doFetch = deps.fetch ?? fetch;
  const repo = deps.repo ?? STUDIO_REPO;

  async function call<T>(method: string, path: string, body?: unknown, okMissing = false): Promise<T | null> {
    const res = await doFetch(`${API}/repos/${repo}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'who-did-it-studio',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (okMissing && res.status === 404) return null;
    if (!res.ok) throw new GitHubError(res.status, `${method} ${path.split('?')[0]}`);
    return (await res.json()) as T;
  }
  const must = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    (await call<T>(method, path, body)) as T;

  const headSha = async (branch: string): Promise<string | null> => {
    const ref = await call<{ object: { sha: string } }>(
      'GET',
      `/git/ref/heads/${enc(branch)}`,
      undefined,
      true,
    );
    return ref?.object.sha ?? null;
  };

  return {
    repo,
    async defaultBranch() {
      return (await must<{ default_branch: string }>('GET', '')).default_branch;
    },
    async createBranch(branch, from) {
      const sha = await headSha(from);
      if (sha === null) throw new GitHubError(404, `GET /git/ref/heads/${from}`);
      await must('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha });
    },
    async ensureBranch(branch, from) {
      if ((await headSha(branch)) !== null) return;
      await this.createBranch(branch, from);
    },
    async putFile(branch, path, base64, message) {
      const existing = await call<{ sha: string }>(
        'GET',
        `/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`,
        undefined,
        true,
      );
      const res = await must<{ content: { html_url: string } }>('PUT', `/contents/${enc(path)}`, {
        message,
        content: base64,
        branch,
        ...(existing ? { sha: existing.sha } : {}),
      });
      return res.content.html_url;
    },
    async createIssue(title, body, labels) {
      const res = await must<{ number: number; html_url: string }>('POST', '/issues', {
        title,
        body,
        labels,
      });
      return { number: res.number, url: res.html_url };
    },
    async createDraftPull(head, base, title, body) {
      const res = await must<{ number: number; html_url: string }>('POST', '/pulls', {
        head,
        base,
        title,
        body,
        draft: true,
      });
      return { number: res.number, url: res.html_url };
    },
    async listIssues(label) {
      const rows = await must<Array<Record<string, unknown>>>(
        'GET',
        `/issues?labels=${encodeURIComponent(label)}&state=all&sort=created&direction=desc&per_page=50`,
      );
      return rows
        .filter((r) => r.pull_request === undefined)
        .map((r) => ({
          number: r.number as number,
          title: String(r.title ?? ''),
          body: String(r.body ?? ''),
          state: r.state === 'closed' ? 'closed' : 'open',
          url: String(r.html_url ?? ''),
          createdAt: String(r.created_at ?? ''),
          comments: Number(r.comments ?? 0),
        }));
    },
    async listComments(issue) {
      const rows = await must<Array<Record<string, unknown>>>(
        'GET',
        `/issues/${issue}/comments?per_page=100`,
      );
      return rows.map((r) => ({
        author: String((r.user as { login?: unknown } | null)?.login ?? ''),
        body: String(r.body ?? ''),
        createdAt: String(r.created_at ?? ''),
      }));
    },
  };
}
