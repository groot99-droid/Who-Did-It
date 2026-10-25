// Round 9 (9T, docs/round9/admin-studio.md 3 and 5): the Studio's save route, with an injectable `fetch`. The request
// and answer types are those of `studioHttp.ts` (S3).
import type { StudioSaveRefused, StudioSaveRequest, StudioSaveResponse } from '@wdi/shared/protocol';
import { SERVER_URL } from '../health';

export type SaveRequest = StudioSaveRequest;
export type SaveResponse = StudioSaveResponse;
export interface SaveApi {
  save(req: SaveRequest): Promise<SaveResponse>;
}

/** A refused save: `status` is 403, 409 (same scene in the same minute), 413, 422, 429, 502 or 503. */
export class SaveError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** A 422 lists every problem for the checks panel. */
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

export function createSaveApi(
  token: string,
  deps: { serverUrl?: string; fetch?: typeof fetch } = {},
): SaveApi {
  const url = `${deps.serverUrl ?? SERVER_URL}/studio/save`;
  const f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return {
    async save(req) {
      const res = await f(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(req),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<SaveResponse> & Partial<StudioSaveRefused>;
      if (!res.ok) throw new SaveError(res.status, json.error ?? `HTTP ${res.status}`, json.problems ?? []);
      return json as SaveResponse;
    },
  };
}
