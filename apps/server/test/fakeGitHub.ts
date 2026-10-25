/**
 * An in-memory GitHub REST API for the Studio's client (round 9): refs, contents, issues and comments of one
 * repository, served through an injectable `fetch`. It records every call with its Authorization header, so a test
 * can check where the token went. The token used in tests is made up.
 */
export const FAKE_TOKEN = 'fake-token-for-tests';

export interface FakeCall {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

export function fakeGitHub(repo = 'groot99-droid/Who-Did-It') {
  const refs = new Map<string, string>([['main', 'sha-main']]);
  const files = new Map<string, { sha: string; content: string }>();
  const issues: Array<{
    number: number;
    title: string;
    body: string;
    labels: string[];
    state: 'open' | 'closed';
  }> = [];
  const comments = new Map<number, Array<{ user: { login: string }; body: string; created_at: string }>>();
  const calls: FakeCall[] = [];
  let failWith: number | null = null;
  let n = 0;

  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    const prefix = `/repos/${repo}`;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const path = decodeURIComponent(u.pathname.slice(prefix.length));
    calls.push({
      method,
      path: u.pathname.slice(prefix.length) + u.search,
      auth: headers.Authorization ?? null,
      body,
    });
    if (failWith !== null) return reply(failWith, { message: 'nope' });
    if (u.origin !== 'https://api.github.com' || !u.pathname.startsWith(prefix)) return reply(404, {});
    if (headers.Authorization !== `Bearer ${FAKE_TOKEN}`) return reply(401, { message: 'Bad credentials' });

    if (method === 'GET' && path === '') return reply(200, { default_branch: 'main' });
    const ref = /^\/git\/ref\/heads\/(.+)$/.exec(path);
    if (method === 'GET' && ref) {
      const sha = refs.get(ref[1]!);
      return sha ? reply(200, { object: { sha } }) : reply(404, {});
    }
    if (method === 'POST' && path === '/git/refs') {
      const name = String(body.ref).replace('refs/heads/', '');
      if (refs.has(name)) return reply(422, { message: 'Reference already exists' });
      refs.set(name, body.sha);
      return reply(201, {});
    }
    const content = /^\/contents\/(.+)$/.exec(path);
    if (content) {
      const branch = method === 'GET' ? (u.searchParams.get('ref') ?? 'main') : body.branch;
      const key = `${branch}:${content[1]}`;
      if (method === 'GET') {
        const file = files.get(key);
        return file ? reply(200, { sha: file.sha }) : reply(404, {});
      }
      if (!refs.has(branch)) return reply(404, {});
      const existing = files.get(key);
      if (existing && body.sha !== existing.sha) return reply(409, { message: 'sha mismatch' });
      if (!existing && body.sha !== undefined) return reply(422, {});
      files.set(key, { sha: `blob-${++n}`, content: body.content });
      const html = `https://github.com/${repo}/blob/${branch}/${content[1]}`;
      return reply(existing ? 200 : 201, { content: { html_url: html } });
    }
    if (method === 'POST' && path === '/issues') {
      const number = issues.length + 1;
      issues.push({ number, title: body.title, body: body.body, labels: body.labels, state: 'open' });
      return reply(201, { number, html_url: `https://github.com/${repo}/issues/${number}` });
    }
    if (method === 'GET' && path === '/issues') {
      const label = u.searchParams.get('labels');
      const rows = issues
        .filter((i) => label === null || i.labels.includes(label))
        .reverse()
        .map((i) => ({
          number: i.number,
          title: i.title,
          body: i.body,
          state: i.state,
          html_url: `https://github.com/${repo}/issues/${i.number}`,
          created_at: '2026-10-25T00:00:00Z',
          comments: comments.get(i.number)?.length ?? 0,
        }));
      return reply(200, rows);
    }
    const thread = /^\/issues\/(\d+)\/comments$/.exec(path);
    if (method === 'GET' && thread) return reply(200, comments.get(Number(thread[1])) ?? []);
    return reply(404, {});
  }) as typeof fetch;

  return {
    fetch: fetchImpl,
    refs,
    files,
    issues,
    calls,
    comment(issue: number, login: string, text: string) {
      const list = comments.get(issue) ?? [];
      list.push({ user: { login }, body: text, created_at: '2026-10-25T01:00:00Z' });
      comments.set(issue, list);
    },
    /** Every later call answers this status (null to stop). */
    fail(status: number | null) {
      failWith = status;
    },
  };
}
