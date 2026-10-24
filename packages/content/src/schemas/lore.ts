import { z } from 'zod';
import { GddRef, Id } from './common.js';

// Round 8 (GDD 3.26; docs/round8/stations.md 5), 7M: the books, letters, ledgers and clippings the shelf reader opens.
// Every page is the owner's placeholder until the codex is done (A200 round 1); 8V draws the pages from the vault
// works later, each volume citing its vault path. Ids are frozen; titles and pages are text and may be renamed.

/** The words a page carries until it is written (owner, A200 round 1). */
export const LORE_PLACEHOLDER = 'fill later';

/** How the reader opens a volume: a book leafs, a letter unfolds as one sheet, a ledger runs in columns, a clipping is pinned. */
export const LoreKind = z.enum(['book', 'letter', 'ledger', 'clipping']);
export type LoreKind = z.infer<typeof LoreKind>;

export const LoreVolume = z.strictObject({
  id: Id,
  /** The spine's or the sheet's title. */
  title: z.string().min(1).max(40),
  kind: LoreKind,
  pages: z.array(z.string().trim().min(1)).min(1),
  /** The vault work the pages come from, `creative-writing/vault/...` in ROSW (8V, when it fills them). */
  source: z
    .string()
    .regex(/^creative-writing\/vault\/\S+\.md$/, 'a source is a vault path')
    .optional(),
});
export type LoreVolume = z.infer<typeof LoreVolume>;

export const LoreShelf = z.strictObject({
  /** What the reader's head says: the shelf, box, ledger or board, by its place. */
  title: z.string().min(1).max(40),
  volumes: z.array(LoreVolume).min(1),
});
export type LoreShelf = z.infer<typeof LoreShelf>;

/** A scene prop id, `<prefix>.<name>` (WORLD 4.3); `lore.json` keys its shelves by them. */
const PropId = z.string().regex(/^[a-z]+\.[a-z0-9_]+$/, 'a shelf is keyed by its prop id');

export const LoreFile = z.strictObject({
  gddRef: GddRef,
  shelves: z.record(PropId, LoreShelf),
});
export type LoreFile = z.infer<typeof LoreFile>;
