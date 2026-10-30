// UI.md 14.51 (Session 10Y, round 10; docs/round9/failures.md 6.2, owner answer FM5). A refusal that repeats
// escalates: the second identical `NEED_*` refusal within `HINT_WINDOW_MS` appends where the missing thing is found,
// when `interactions.json` knows (`hint`). The hint is the table's, never a line written here.
import interactionsData from '@wdi/content/data/interactions.json';
import items from '@wdi/content/data/items.json';
import type { RefusalIn } from './refusals';

/** How close two identical refusals must be for the second to carry the hint (FM5: 30 s). */
export const HINT_WINDOW_MS = 30_000;

interface Row {
  hint?: string;
  modes?: readonly ({ tool?: { tag: string } | null } | null)[];
}
const TABLE = interactionsData.interactions as unknown as Record<string, Row>;
const TOOLS = items.items as Record<string, { tool?: Record<string, number> }>;

/** The first hint of an interaction that wants a tool the item is (a pickaxe's `break`): the table knows the item. */
function hintForTool(item: string): string | null {
  const tags = Object.keys(TOOLS[item]?.tool ?? {});
  if (tags.length === 0) return null;
  for (const row of Object.values(TABLE)) {
    if (!row.hint) continue;
    if (row.modes?.some((m) => m?.tool && tags.includes(m.tool.tag))) return row.hint;
  }
  return null;
}

/** The hint the table has for a refusal: the interaction's own, else one for the missing tool; null when none. */
export function hintFor(e: RefusalIn): string | null {
  const own = e.interaction ? TABLE[e.interaction]?.hint : undefined;
  if (own) return own;
  const need = (e.args as { need?: unknown } | undefined)?.need;
  return typeof need === 'string' ? hintForTool(need) : null;
}

const isNeed = (reason: unknown): reason is string =>
  typeof reason === 'string' && reason.startsWith('NEED_');

/** Remembers when each `NEED_*` refusal was last shown, so the second within the window can carry its hint. */
export class RefusalHints {
  private readonly lastAt = new Map<string, number>();

  /** The hint to append to this refusal's line, or null; `now` in ms (`performance.now()`). */
  take(e: RefusalIn, now: number): string | null {
    if (!isNeed(e.reason)) return null;
    const need = (e.args as { need?: unknown } | undefined)?.need;
    const key = `${e.reason}|${e.interaction ?? ''}|${typeof need === 'string' ? need : ''}`;
    for (const [k, at] of this.lastAt) if (now - at > HINT_WINDOW_MS) this.lastAt.delete(k);
    const prev = this.lastAt.get(key);
    this.lastAt.set(key, now);
    return prev === undefined ? null : hintFor(e);
  }
}
