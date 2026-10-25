import { describe, expect, it } from 'vitest';
import { createSaveApi, SaveError } from './saveApi';

const reply = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('save api', () => {
  it('posts the scene and note with the bearer token and returns the draft PR', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const api = createSaveApi('tok', {
      serverUrl: 'http://s',
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return reply(201, { branch: 'studio/x', number: 7, url: 'http://pr' })();
      }) as unknown as typeof fetch,
    });
    const out = await api.save({ scene: { id: 'a' }, note: 'hi' });
    expect(out).toEqual({ branch: 'studio/x', number: 7, url: 'http://pr' });
    expect(seen!.url).toBe('http://s/studio/save');
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(seen!.init.body as string)).toEqual({ scene: { id: 'a' }, note: 'hi' });
  });

  it('carries the problems list of a 422', async () => {
    const api = createSaveApi('t', {
      fetch: reply(422, { error: 'first', problems: ['first', 'second'] }) as never,
    });
    const e = await api.save({ scene: {} }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SaveError);
    expect(e).toMatchObject({ status: 422, message: 'first', problems: ['first', 'second'] });
  });

  it('reports a 409 and an answer that is not JSON', async () => {
    const a = createSaveApi('t', { fetch: reply(409, { error: 'same minute' }) as never });
    await expect(a.save({ scene: {} })).rejects.toMatchObject({ status: 409, message: 'same minute' });
    const b = createSaveApi('t', { fetch: (async () => new Response('x', { status: 502 })) as never });
    await expect(b.save({ scene: {} })).rejects.toMatchObject({ status: 502, message: 'HTTP 502' });
  });
});
