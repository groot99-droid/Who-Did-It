// Round 10, A13 (GDD 3.30; docs/round9/logic-table.md 8.6): the crafting grid's match. The grid is `size * size` cells,
// row by row, each an item id or null. A recipe with a `shape` matches the pattern wherever it sits in the grid (and
// mirrored); one without matches the set of inputs, a cell holding one unit. Server and client read the same rule: the
// client previews the product, the server decides.

export interface GridRecipe {
  id: string;
  in: ReadonlyArray<{ item: string; qty: number }>;
  shape?: ReadonlyArray<ReadonlyArray<string | null>> | undefined;
}

type Rows = ReadonlyArray<ReadonlyArray<string | null>>;

/** The cells as rows, cropped to the smallest box that holds every item; empty when the grid is empty. */
export function cropGrid(size: number, cells: ReadonlyArray<string | null>): Rows {
  const rows = Array.from({ length: size }, (_, r) => cells.slice(r * size, r * size + size));
  const used = rows.flatMap((row, r) => row.flatMap((c, i) => (c === null ? [] : [[r, i] as const])));
  if (used.length === 0) return [];
  const r0 = Math.min(...used.map(([r]) => r));
  const r1 = Math.max(...used.map(([r]) => r));
  const c0 = Math.min(...used.map(([, c]) => c));
  const c1 = Math.max(...used.map(([, c]) => c));
  return rows.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1));
}

const sameRows = (a: Rows, b: Rows): boolean =>
  a.length === b.length &&
  a.every((row, r) => row.length === b[r]?.length && row.every((c, i) => c === b[r]?.[i]));

/** The box a grid needs: its cropped height and width (0 by 0 when empty). */
export const boxOf = (size: number, cells: ReadonlyArray<string | null>): { h: number; w: number } => {
  const rows = cropGrid(size, cells);
  return { h: rows.length, w: rows[0]?.length ?? 0 };
};

/** The recipe the grid makes, or null. Shaped recipes are tried by their pattern, the rest by their inputs. */
export function matchGrid(
  recipes: ReadonlyArray<GridRecipe>,
  size: number,
  cells: ReadonlyArray<string | null>,
): string | null {
  const rows = cropGrid(size, cells);
  if (rows.length === 0) return null;
  const items = cells.filter((c): c is string => c !== null).sort();
  for (const r of recipes) {
    if (r.shape) {
      const mirrored = r.shape.map((row) => [...row].reverse());
      if (sameRows(rows, r.shape) || sameRows(rows, mirrored)) return r.id;
      continue;
    }
    const need = r.in.flatMap((i) => Array.from({ length: i.qty }, () => i.item)).sort();
    if (need.length === items.length && need.every((n, i) => n === items[i])) return r.id;
  }
  return null;
}
