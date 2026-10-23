// Round 8 (8M, DECISIONS A171; teardown.md 2.3): a role's text reads its numbers from the data. In roles.json a
// number in `goal`, `cardText`, `beware` or `win` is a token such as `{clues.clues.blood.params.visibleTiles}`; the
// loader fills every token before anything reads the roles, so the shipped words stay exactly as they were typed and
// can never disagree with the rules. "Data wins, card generated" (the owner, A168).

/** The role fields whose numbers are tokens. */
export const CARD_FIELDS = ['goal', 'cardText', 'beware', 'win'] as const;
export type CardField = (typeof CARD_FIELDS)[number];

/** `{a.b.c}`: a dotted path into the parsed content, or a `byCount` rule token (below). */
export const CARD_TOKEN = /\{([A-Za-z0-9_.]+)\}/g;

/** The parsed files a token may read (the content, or the files `parseContent` has parsed so far). */
export interface CardData {
  readonly balance: { readonly byCount: Readonly<Record<string, { readonly cabalWin: string }>> };
}

/** The party sizes whose `byCount` row plays `rule`, smallest first. */
function sizesOf(data: CardData, rule: string): number[] {
  return Object.entries(data.balance.byCount)
    .filter(([, row]) => row.cabalWin === rule)
    .map(([n]) => Number(n))
    .sort((a, b) => a - b);
}

/**
 * The words of one token. `byCount.<rule>.from` is the smallest party size playing `rule`; `byCount.<rule>.sizes`
 * is its sizes as a run, "4-5" (or "4" alone). Any other token is a path that must end on a number. Throws on a token
 * that names nothing, so a typo cannot ship.
 */
export function cardToken(data: CardData, path: string): string {
  const rule = /^byCount\.(\w+)\.(from|sizes)$/.exec(path);
  if (rule) {
    const sizes = sizesOf(data, rule[1] as string);
    const first = sizes[0];
    const last = sizes.at(-1);
    if (first === undefined || last === undefined)
      throw new Error(`card token {${path}}: no party size plays it`);
    if (last - first !== sizes.length - 1) throw new Error(`card token {${path}}: its sizes are not one run`);
    if (rule[2] === 'from') return String(first);
    return first === last ? String(first) : `${first}-${last}`;
  }
  let at: unknown = data;
  for (const key of path.split('.')) {
    at = at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined;
  }
  if (typeof at !== 'number') throw new Error(`card token {${path}}: not a number in the data`);
  return String(at);
}

/** One text with its tokens filled. */
export const fillCard = (data: CardData, text: string): string =>
  text.replace(CARD_TOKEN, (_, path: string) => cardToken(data, path));

/** Every role of `roles` with its card fields filled from `data`; the roles file itself is not changed. */
export function fillRoles<R extends Record<CardField, string>, F extends { roles: Record<string, R> }>(
  file: F,
  data: CardData,
): F {
  const roles: Record<string, R> = {};
  for (const [id, role] of Object.entries(file.roles)) {
    const filled = { ...role };
    for (const field of CARD_FIELDS) filled[field] = fillCard(data, role[field]) as R[CardField];
    roles[id] = filled;
  }
  return { ...file, roles };
}
