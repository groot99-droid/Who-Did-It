// Round 9 (9W, N3): the NPC editor's live preview. The edited routines go up by `POST /studio/npc-draft` (9V's wire,
// checked like a save and never written) and are cleared by the socket message `studio.npcDraft {npc: null}`.
import { STUDIO_C2S, type StudioNpcDraftRequest, type StudioSaveRefused } from '@wdi/shared/protocol';
import type { StudioLink } from '../../admin/StudioNet';
import { SERVER_URL } from '../../health';
import { SaveError } from '../saveApi';

export interface NpcDraftApi {
  /** Queues the edited NPC files as the draft of the connected Studio room `roomId`; a 422 carries the problems. */
  upload(roomId: string, files: Omit<StudioNpcDraftRequest, 'roomId'>): Promise<void>;
}

export function createNpcDraftApi(
  token: string,
  deps: { serverUrl?: string; fetch?: typeof fetch } = {},
): NpcDraftApi {
  const url = `${deps.serverUrl ?? SERVER_URL}/studio/npc-draft`;
  const f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return {
    async upload(roomId, files) {
      const res = await f(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ roomId, ...files } satisfies StudioNpcDraftRequest),
      });
      if (res.ok) return;
      const json = (await res.json().catch(() => ({}))) as Partial<StudioSaveRefused>;
      throw new SaveError(res.status, json.error ?? `HTTP ${res.status}`, json.problems ?? []);
    },
  };
}

/** Mock mode has no server: the draft is accepted and nothing else happens. */
export const mockNpcDraftApi: NpcDraftApi = { upload: () => Promise.resolve() };

/** Drops the room's NPC draft so its stand-ins use the committed files again. */
export function clearNpcDraft(link: StudioLink): void {
  link.send(STUDIO_C2S.npcDraft, { npc: null });
}
