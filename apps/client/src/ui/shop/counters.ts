import { TILE_PX } from '@wdi/shared/constants';

/** A shop counter of the scene this client stands in, at its tile centre in world pixels. */
export interface CounterSpot {
  propId: string;
  shopId: string;
  x: number;
  y: number;
}

/**
 * The scene's counters that some `economy.json` shop names (GDD 3.23). A counter no shop names is skipped: the server
 * would refuse its hold.
 */
export function shopCounters(
  props: ReadonlyArray<{ id: string; kind: string; x: number; y: number }>,
  shops: Readonly<Record<string, { prop: string }>>,
): CounterSpot[] {
  const byProp = new Map(Object.entries(shops).map(([shopId, s]) => [s.prop, shopId]));
  const out: CounterSpot[] = [];
  for (const p of props) {
    const shopId = p.kind === 'counter' ? byProp.get(p.id) : undefined;
    if (shopId) out.push({ propId: p.id, shopId, x: (p.x + 0.5) * TILE_PX, y: (p.y + 0.5) * TILE_PX });
  }
  return out;
}
