// Round 9 (9T, docs/round9/admin-studio.md 3): Walk it. A scene is up to about 1 MB of JSON, far over the room socket's
// 4 KB message cap, so the draft goes up by `POST /studio/draft` (S5) and is cleared by the socket message
// `studio.draft {scene: null}`.
import { STUDIO_C2S, type StudioDraftRequest, type StudioSaveRefused } from '@wdi/shared/protocol';
import type { StudioLink, StudioSnapshot } from '../admin/StudioNet';
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
        body: JSON.stringify({ roomId, scene } satisfies StudioDraftRequest),
      });
      if (res.ok) return;
      const json = (await res.json().catch(() => ({}))) as Partial<StudioSaveRefused>;
      throw new SaveError(res.status, json.error ?? `HTTP ${res.status}`, json.problems ?? []);
    },
  };
}

/** Mock mode has no server: the draft is accepted and the Studio draws it from the scene it holds. */
export const mockDraftApi: DraftApi = { upload: () => Promise.resolve() };

/** Drops the room's draft so it serves the committed scene again. */
export function clearDraft(link: StudioLink): void {
  link.send(STUDIO_C2S.draft, { scene: null });
}

/** The snapshot's `draft` flag: absent or false means the committed scene. */
export const draftOn = (snap: StudioSnapshot): boolean => snap.draft === true;
