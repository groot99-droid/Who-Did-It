import { describe, expect, it } from 'vitest';
import { createDraftApi } from './draftApi';
import { SaveError } from './saveApi';

describe('draft api', () => {
  it('posts the room id and scene with the bearer token', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const api = createDraftApi('tok', {
      serverUrl: 'http://s',
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return new Response(JSON.stringify({ queued: true }), { status: 202 });
      }) as unknown as typeof fetch,
    });
    await api.upload('room1', { id: 'a' });
    expect(seen!.url).toBe('http://s/studio/draft');
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(seen!.init.body as string)).toEqual({ roomId: 'room1', scene: { id: 'a' } });
  });

  it('throws the problems of a 422 and the status of a 404', async () => {
    const refused = createDraftApi('t', {
      fetch: (async () =>
        new Response(JSON.stringify({ error: 'bad', problems: ['one', 'two'] }), { status: 422 })) as never,
    });
    const e = await refused.upload('r', {}).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SaveError);
    expect(e).toMatchObject({ status: 422, problems: ['one', 'two'] });
    const missing = createDraftApi('t', {
      fetch: (async () => new Response('not found', { status: 404 })) as never,
    });
    await expect(missing.upload('r', {})).rejects.toMatchObject({ status: 404, message: 'HTTP 404' });
  });
});
