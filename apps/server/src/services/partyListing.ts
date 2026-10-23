import { matchMaker } from '@colyseus/core';
import type { PartyListing, PartyVisibility } from '@wdi/shared';
import { balance } from '@wdi/content';

/**
 * What a lobby-phase `PartyRoom` publishes through `setMetadata` (GDD 3.21, `docs/round7/parties.md` 3). `invited`
 * stays in the matchmaker's cache on the server; the route reads it and never returns it.
 */
export interface PartyMetadata extends Omit<PartyListing, 'code'> {
  invited: string[];
}

const isMetadata = (m: unknown): m is PartyMetadata =>
  typeof m === 'object' && m !== null && 'visibility' in m && 'invited' in m;

/**
 * The rows of `GET /parties`: lobby-phase rooms that are not locked, every open one and the private ones whose
 * invited list holds `profile`, newest first, at most `party.listMax`. A started room publishes no metadata
 * (cleared at Start), so it is skipped here; nothing but the `PartyListing` keys is copied out.
 */
export async function listParties(profile: string | null): Promise<PartyListing[]> {
  const rooms = await matchMaker.query({ name: 'party' });
  return rooms
    .filter((r) => !r.locked && isMetadata(r.metadata))
    .filter((r) => {
      const m = r.metadata as PartyMetadata;
      return m.visibility === 'open' || (profile !== null && m.invited.includes(profile));
    })
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .slice(0, balance.party.listMax)
    .map((r) => {
      const m = r.metadata as PartyMetadata;
      return {
        code: r.roomId,
        leader: m.leader,
        players: m.players,
        max: m.max,
        mode: m.mode,
        map: m.map,
        visibility: m.visibility satisfies PartyVisibility,
      };
    });
}
