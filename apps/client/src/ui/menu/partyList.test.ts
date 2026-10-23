import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchParties } from './partyListModel';

afterEach(() => vi.unstubAllGlobals());

const stub = (res: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => res),
  );

describe('fetchParties', () => {
  it('reads the rows of GET /parties and sends the profile', async () => {
    const rows = [
      { code: 'ABCDE', leader: 'Mira', players: 2, max: 10, mode: 0, map: 'hollowmere', visibility: 'open' },
    ];
    const fn = vi.fn(async (..._args: unknown[]) => ({ ok: true, json: async () => ({ parties: rows }) }));
    vi.stubGlobal('fetch', fn);
    expect(await fetchParties('ABCD2345')).toEqual(rows);
    expect(String(fn.mock.calls[0]?.[0])).toContain('/parties?profile=ABCD2345');
  });

  it('reads a 429, a network error and a malformed body as an empty list', async () => {
    stub({ ok: false, status: 429 });
    expect(await fetchParties(null)).toEqual([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('down'))),
    );
    expect(await fetchParties(null)).toEqual([]);
    stub({ ok: true, json: async () => ({ parties: 'no' }) });
    expect(await fetchParties(null)).toEqual([]);
  });
});
