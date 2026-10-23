import balanceJson from '@wdi/content/data/balance.json';
import { SERVER_URL } from '../../health';
import type { PartyListing } from '../../net/protocol';
import { MAP_ROWS } from '../lobby/MapPicker';

export const LIST_REFRESH_MS: number = balanceJson.party.listRefreshS * 1000;

export type ListParties = (profile: string | null) => Promise<PartyListing[]>;

/**
 * `GET /parties?profile=CODE` (GDD 3.21). A 429 (the route's bucket is empty), a network error and a malformed
 * body all read as an empty list: the menu shows its empty state and asks again at the next refresh.
 */
export const fetchParties: ListParties = async (profile) => {
  try {
    const query = profile === null ? '' : `?profile=${encodeURIComponent(profile)}`;
    const res = await fetch(`${SERVER_URL}/parties${query}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as { parties?: unknown };
    return Array.isArray(body.parties) ? (body.parties as PartyListing[]) : [];
  } catch {
    return [];
  }
};

/** The map's display name, or its id for a map this client does not know. */
export const mapName = (id: string): string => MAP_ROWS.find((m) => m.id === id)?.name ?? id;
