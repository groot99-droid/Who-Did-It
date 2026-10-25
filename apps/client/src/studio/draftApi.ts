// Round 9 (9T, docs/round9/admin-studio.md 3): Walk it. A scene is up to about 1 MB of JSON, far over the room socket's
// 4 KB message cap, so the draft goes up by `POST /studio/draft` (S5) and is cleared by the socket message
// `studio.draft {scene: null}`. The types mirror `StudioDraftRequest` of `studioHttp.ts` until S5 merges.
import type { StudioLink } from '../admin/StudioNet';
import { SERVER_URL } from '../health';
import { SaveError } from './saveApi';

export interface DraftApi {
  /** Queues `scene` as the draft of the connected Studio room `roomId`; a 422 carries the save route's problems. */
  upload(roomId: string, scene: unknown): Promise<void>;
}

export function createDraftApi(
  token: string,
  deps: { serverUrl?: string; fetch?: typeof fetch } = {},
): DraftApi {
  const url = `${deps.serverUrl ?? SERVER_URL}/studio/draft`;
  const f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return {
    async upload(roomId, scene) {
      const res = await f(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ roomId, scene }),
      });
      if (res.ok) return;
      const json = (await res.json().catch(() => ({}))) as { error?: string; problems?: string[] };
      throw new SaveError(res.status, json.error ?? `HTTP ${res.status}`, json.problems ?? []);
    },
  };
}

/** Mock mode has no server: the draft is accepted and the Studio draws it from the scene it holds. */
export const mockDraftApi: DraftApi = { upload: () => Promise.resolve() };

/** Drops the room's draft so it serves the committed scene again (the shared payload type arrives with S5). */
export function clearDraft(link: StudioLink): void {
  (link.send as (type: string, payload: unknown) => void)('studio.draft', { scene: null });
}

/** The snapshot's `draft` flag: absent or false means the committed scene (the shared type arrives with S5). */
export const draftOn = (snap: object): boolean => (snap as { draft?: boolean }).draft === true;
