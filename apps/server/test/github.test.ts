import { describe, expect, it } from 'vitest';
import { GitHubError, STUDIO_REPO, createGitHub, githubToken } from '../src/services/github';
import { FAKE_TOKEN, fakeGitHub } from './fakeGitHub';

describe('githubToken', () => {
  it('reads WDI_ADMIN_GITHUB_TOKEN and is null when it is unset or blank', () => {
    expect(githubToken({})).toBeNull();
    expect(githubToken({ WDI_ADMIN_GITHUB_TOKEN: '  ' })).toBeNull();
    expect(githubToken({ WDI_ADMIN_GITHUB_TOKEN: ` ${FAKE_TOKEN} ` })).toBe(FAKE_TOKEN);
  });
});

describe('the GitHub client', () => {
  it('creates a branch from another once, and leaves it alone after', async () => {
    const gh = fakeGitHub();
    const client = createGitHub(FAKE_TOKEN, { fetch: gh.fetch });
    expect(client.repo).toBe(STUDIO_REPO);
    expect(await client.defaultBranch()).toBe('main');
    await client.ensureBranch('admin-reports', 'main');
    await client.ensureBranch('admin-reports', 'main');
    expect(gh.refs.get('admin-reports')).toBe('sha-main');
    expect(gh.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    await expect(client.ensureBranch('x', 'nowhere')).rejects.toBeInstanceOf(GitHubError);
  });

  it('puts a new file, then replaces it with the existing sha', async () => {
    const gh = fakeGitHub();
    const client = createGitHub(FAKE_TOKEN, { fetch: gh.fetch });
    const url = await client.putFile('main', 'reports/a b.png', 'AAAA', 'one');
    expect(url).toBe(`https://github.com/${STUDIO_REPO}/blob/main/reports/a b.png`);
    await client.putFile('main', 'reports/a b.png', 'BBBB', 'two');
    expect(gh.files.get('main:reports/a b.png')?.content).toBe('BBBB');
  });

  it('opens issues and lists those of a label with their comments', async () => {
    const gh = fakeGitHub();
    const client = createGitHub(FAKE_TOKEN, { fetch: gh.fetch });
    expect(await client.createIssue('one', 'body', ['admin-report'])).toEqual({
      number: 1,
      url: `https://github.com/${STUDIO_REPO}/issues/1`,
    });
    await client.createIssue('other', 'body', ['bug']);
    gh.comment(1, 'claude', 'looking');
    const list = await client.listIssues('admin-report');
    expect(list.map((i) => [i.number, i.title, i.state, i.comments])).toEqual([[1, 'one', 'open', 1]]);
    expect(await client.listComments(1)).toEqual([
      { author: 'claude', body: 'looking', createdAt: '2026-10-25T01:00:00Z' },
    ]);
  });

  it('sends the token only in the Authorization header and never puts it in an error', async () => {
    const gh = fakeGitHub();
    const client = createGitHub(FAKE_TOKEN, { fetch: gh.fetch });
    await client.createIssue('t', 'b', []);
    for (const call of gh.calls) {
      expect(call.auth).toBe(`Bearer ${FAKE_TOKEN}`);
      expect(call.path).not.toContain(FAKE_TOKEN);
      expect(JSON.stringify(call.body ?? null)).not.toContain(FAKE_TOKEN);
    }
    gh.fail(500);
    const err = await client.createIssue('t', 'b', []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect((err as GitHubError).status).toBe(500);
    expect(String((err as Error).message)).not.toContain(FAKE_TOKEN);
    expect(JSON.stringify(err)).not.toContain(FAKE_TOKEN);
  });

  it('a wrong token is refused by GitHub, as a GitHubError', async () => {
    const gh = fakeGitHub();
    const err = await createGitHub('wrong', { fetch: gh.fetch })
      .defaultBranch()
      .catch((e: unknown) => e);
    expect((err as GitHubError).status).toBe(401);
  });
});
