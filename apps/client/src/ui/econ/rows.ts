import { NoteKind, Phase, TILE_PX } from '@wdi/shared';
import type { NotebookSnap, StackSnap } from '../../net/world';
import { fill } from '../copy';
import { CIVIC_COPY as C } from '../copy/civic';
import { itemList } from '../Inventory';
import { lookName } from '../portrait';

/** What a civic prop in reach lets a seat do (GDD 3.23). The holds go to the server; the others open a panel. */
export type CivicKind = 'altar' | 'mailbag' | 'rack' | 'market' | 'hq' | 'bank';

/** A civic prop of the scene this client stands in, at its tile centre in world pixels. */
export interface CivicSpot {
  kind: CivicKind;
  propId: string;
  /** The `economy.json` HQ station of an `hq` prop. */
  stationId?: string;
  x: number;
  y: number;
}

/** The ids `civicSpots` reads from `economy.json` (the altars, mailbags, racks, black markets, HQ stations). */
export interface CivicIds {
  faith: { altars: readonly string[] };
  notices: { mailbags: readonly string[]; blackMarkets: readonly string[] };
  quota: { racks: readonly string[] };
  hq: { stations: Readonly<Record<string, { props: Readonly<Record<string, string | undefined>> }>> };
}

/** The scene's civic props that the economy names; a bank counter counts by its kind. */
export function civicSpots(
  props: ReadonlyArray<{ id: string; kind: string; x: number; y: number }>,
  ids: CivicIds,
): CivicSpot[] {
  const station = new Map<string, string>();
  for (const [id, s] of Object.entries(ids.hq.stations))
    for (const prop of Object.values(s.props)) if (prop) station.set(prop, id);
  const out: CivicSpot[] = [];
  for (const p of props) {
    const at = { propId: p.id, x: (p.x + 0.5) * TILE_PX, y: (p.y + 0.5) * TILE_PX };
    if (ids.faith.altars.includes(p.id)) out.push({ kind: 'altar', ...at });
    else if (ids.notices.mailbags.includes(p.id)) out.push({ kind: 'mailbag', ...at });
    else if (ids.quota.racks.includes(p.id)) out.push({ kind: 'rack', ...at });
    else if (ids.notices.blackMarkets.includes(p.id)) out.push({ kind: 'market', ...at });
    else if (station.has(p.id)) out.push({ kind: 'hq', stationId: station.get(p.id)!, ...at });
    else if (p.kind === 'bank') out.push({ kind: 'bank', ...at });
  }
  return out;
}

const WHEN: Record<number, keyof typeof C> = {
  [Phase.dusk]: 'notice.when.dusk',
  [Phase.night]: 'notice.when.night',
  [Phase.finalNight]: 'notice.when.finalNight',
};

/** The Blackmail Notices among the own Notebook entries, oldest first, each as its one line. */
export function noticeRows(
  notebook: readonly NotebookSnap[],
  sceneName: (index: number) => string,
): Array<{ id: string; line: string }> {
  return notebook
    .filter((e) => e.note === NoteKind.notice)
    .map((e) => ({
      id: e.id,
      line: fill(C['notice.line'], {
        look: lookName(e.of ?? '') || C['notice.stranger'],
        place: sceneName(e.sceneId),
        when: C[WHEN[e.value] ?? 'notice.when.day'],
      }),
    }));
}

/** An altar purchase: whether the Faith and the purse cover it. */
export const canAfford = (price: { faith: number; scrip: number }, faith: number, purse: number): boolean =>
  faith >= price.faith && purse >= price.scrip;

export interface HqTierCost {
  scrip: number;
  materials: ReadonlyArray<{ item: string; qty: number }>;
}

/** The HQ panel's state: the bought tier, the next tier's cost line, and whether this seat may and can build it. */
export function hqOffer(
  station: { look: string; tiers: readonly HqTierCost[] },
  bought: number,
  look: string,
  purse: number,
  pockets: readonly StackSnap[],
): { tier: number; next: string | null; mine: boolean; can: boolean } {
  const tier = station.tiers[bought];
  const mine = look !== '' && look === station.look;
  if (!tier) return { tier: bought, next: null, mine, can: false };
  const held = (item: string) => pockets.reduce((n, s) => n + (s.defId === item ? s.qty : 0), 0);
  const has = tier.materials.every((m) => held(m.item) >= m.qty);
  const next = fill(C['hq.next'], { scrip: tier.scrip, materials: itemList(tier.materials) });
  return { tier: bought, next, mine, can: mine && has && purse >= tier.scrip };
}

/** The `items.json` ids of the two things the altar sells, presented at a meeting (GDD 3.23). */
export const PAPER_ITEMS = { indulgence: 'indulgence', seal: 'parishSeal' } as const;

/**
 * The meeting's papers tab: how many Indulgences and Seals this seat holds, and its notices, each with whether a burn
 * would go through (a notice naming the seat's own look burns only by spending an Indulgence).
 */
export function paperRows(
  notebook: readonly NotebookSnap[],
  pockets: readonly StackSnap[],
  look: string,
  sceneName: (index: number) => string,
): { indulgences: number; seals: number; notices: Array<{ id: string; line: string; canBurn: boolean }> } {
  const held = (item: string) => pockets.reduce((n, s) => n + (s.defId === item ? s.qty : 0), 0);
  const indulgences = held(PAPER_ITEMS.indulgence);
  const own = new Set(notebook.filter((e) => look !== '' && e.of === look).map((e) => e.id));
  const notices = noticeRows(notebook, sceneName).map((r) => ({
    ...r,
    canBurn: !own.has(r.id) || indulgences > 0,
  }));
  return { indulgences, seals: held(PAPER_ITEMS.seal), notices };
}
