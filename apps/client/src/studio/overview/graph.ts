// Round 9 (9W, docs/round9/admin-studio.md 8): the Overview's pure part: the door links of a map's scenes and where
// each scene's card sits. No DOM, so it is tested.
import type { Scene } from '@wdi/content';

export const CARD = { w: 168, h: 64, gapX: 88, gapY: 24, dot: 10 } as const;

export interface Link {
  /** The scene the portal stands in, and the portal's id. */
  scene: string;
  portal: string;
  to: string;
  toSpawn: string;
}
export interface CardPos {
  id: string;
  x: number;
  y: number;
  /** Tall enough to give each door link ending or starting on it its own dot. */
  h: number;
}
export type LayoutSource = 'map' | 'auto';
export interface Layout {
  cards: CardPos[];
  /** `map` when `maps/<mapId>.json` placed every card, else `auto`. */
  source: LayoutSource;
  w: number;
  h: number;
}

/** The portals of `ids` that lead to another scene of `ids`: one link per portal, read from the scene as it stands. */
export function linksOf(ids: readonly string[], scenes: Readonly<Record<string, Scene>>): Link[] {
  const inMap = new Set(ids);
  return ids.flatMap((id) =>
    (scenes[id]?.portals ?? []).flatMap((p) =>
      p.to !== null && p.toSpawn !== null && inMap.has(p.to)
        ? [{ scene: id, portal: p.id, to: p.to, toSpawn: p.toSpawn }]
        : [],
    ),
  );
}

/** Breadth-first columns from the hub over the links taken both ways; unreached scenes go in a last column. */
function columnsOf(ids: readonly string[], hub: string, links: readonly Link[]): string[][] {
  const near = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const l of links) {
    near.get(l.scene)?.push(l.to);
    near.get(l.to)?.push(l.scene);
  }
  const first = ids.includes(hub) ? hub : ids[0];
  const seen = new Set<string>(first === undefined ? [] : [first]);
  let column = first === undefined ? [] : [first];
  const columns: string[][] = [];
  while (column.length > 0) {
    columns.push(column);
    const next: string[] = [];
    for (const id of column)
      for (const n of near.get(id) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
      }
    column = next;
  }
  const rest = ids.filter((id) => !seen.has(id));
  return rest.length > 0 ? [...columns, rest] : columns;
}

/**
 * Where the cards go. `saved` is the optional `layout` of the map file (scene id to pixel position); it is used only
 * when it places every scene, otherwise the automatic layout runs and says so.
 */
export function layoutOf(
  ids: readonly string[],
  hub: string,
  links: readonly Link[],
  saved?: Readonly<Record<string, { x: number; y: number }>>,
): Layout {
  const busy = new Map<string, [number, number]>(ids.map((id) => [id, [0, 0]]));
  for (const l of links) {
    busy.get(l.scene)![0] += 1;
    busy.get(l.to)![1] += 1;
  }
  const heightOf = (id: string) => Math.max(CARD.h, CARD.dot * Math.max(...busy.get(id)!) + 14);
  const bounds = (cards: CardPos[], source: LayoutSource): Layout => ({
    cards,
    source,
    w: Math.max(0, ...cards.map((c) => c.x + CARD.w)),
    h: Math.max(0, ...cards.map((c) => c.y + c.h)),
  });
  if (saved !== undefined && ids.every((id) => saved[id] !== undefined)) {
    return bounds(
      ids.map((id) => ({ id, x: saved[id]!.x, y: saved[id]!.y, h: heightOf(id) })),
      'map',
    );
  }
  const columns = columnsOf(ids, hub, links);
  const tall = (col: string[]) => col.reduce((sum, id) => sum + heightOf(id) + CARD.gapY, -CARD.gapY);
  const tallest = Math.max(0, ...columns.map(tall));
  const cards = columns.flatMap((col, i) => {
    let y = (tallest - tall(col)) / 2;
    return col.map((id) => {
      const card = { id, x: i * (CARD.w + CARD.gapX), y, h: heightOf(id) };
      y += card.h + CARD.gapY;
      return card;
    });
  });
  return bounds(cards, 'auto');
}

/** A dot's offset from a card's middle: `index` of `count` dots on one side, spaced by `CARD.dot`. */
export const dotOffset = (index: number, count: number): number => (index - (count - 1) / 2) * CARD.dot;

/**
 * The edge between two cards, from the facing side of each so a link never crosses its own card. `out` is the link's
 * place among the links leaving `from`, `into` its place among those arriving at `to`, each as `[index, count]`.
 */
export function edgeOf(
  from: CardPos,
  to: CardPos,
  out: readonly [number, number] = [0, 1],
  into: readonly [number, number] = [0, 1],
): { x1: number; y1: number; x2: number; y2: number } {
  const right = to.x >= from.x;
  return {
    x1: from.x + (right ? CARD.w : 0),
    y1: from.y + from.h / 2 + dotOffset(...out),
    x2: to.x + (right ? 0 : CARD.w),
    y2: to.y + to.h / 2 + dotOffset(...into),
  };
}

/** Every link with its edge, each leaving and arriving dot given its own place on the card's side. */
export function edgesOf(links: readonly Link[], at: ReadonlyMap<string, CardPos>) {
  const count = (key: (l: Link) => string) => {
    const n = new Map<string, number>();
    for (const l of links) n.set(key(l), (n.get(key(l)) ?? 0) + 1);
    return n;
  };
  const outN = count((l) => l.scene);
  const inN = count((l) => l.to);
  const outI = new Map<string, number>();
  const inI = new Map<string, number>();
  const next = (m: Map<string, number>, k: string) => {
    const i = m.get(k) ?? 0;
    m.set(k, i + 1);
    return i;
  };
  return links.map((link) => ({
    link,
    ...edgeOf(
      at.get(link.scene)!,
      at.get(link.to)!,
      [next(outI, link.scene), outN.get(link.scene)!],
      [next(inI, link.to), inN.get(link.to)!],
    ),
  }));
}
