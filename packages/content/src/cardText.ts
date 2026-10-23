// Round 8 (8M, DECISIONS A171; teardown.md 2.3): a role's text reads its numbers from the data. In roles.json a
// number in `goal`, `cardText`, `beware` or `win` is a token such as `{clues.clues.blood.params.visibleTiles}`; the
// loader fills every token before anything reads the roles, so the shipped words stay exactly as they were typed and
// can never disagree with the rules. "Data wins, card generated" (the owner, A168).

/** The role fields whose numbers are tokens. */
export const CARD_FIELDS = ['goal', 'cardText', 'beware', 'win'] as const;
export type CardField = (typeof CARD_FIELDS)[number];

/**
 * `{a.b.c}`: a dotted path into the parsed content, or a derived token (below), written as digits. A style prefix
 * writes the count in words: `{word:…}` "one", `{Word:…}` "One" (a sentence's first word), `{times:…}` "once".
 */
export const CARD_TOKEN = /\{(?:(word|Word|times):)?([A-Za-z0-9_.]+)\}/g;

/** The parsed files a token may read (the content, or the files `parseContent` has parsed so far). */
export interface CardData {
  readonly balance: { readonly byCount: Readonly<Record<string, { readonly cabalWin: string }>> };
  readonly roles: {
    readonly roles: Readonly<Record<string, { readonly abilities: readonly string[] }>>;
    readonly decks: Readonly<Record<string, { readonly cards: readonly string[] }>>;
  };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const TIMES = ['never', 'once', 'twice'];

/** A count in the words a style asks for; past ten (or two, for `times`) it stays digits. */
function styled(style: string | undefined, n: number): string {
  if (style === undefined) return String(n);
  if (style === 'times') return TIMES[n] ?? `${n} times`;
  const word = Number.isInteger(n) ? (WORDS[n] ?? String(n)) : String(n);
  return style === 'Word' ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** The party sizes whose `byCount` row plays `rule`, smallest first. */
function sizesOf(data: CardData, rule: string): number[] {
  return Object.entries(data.balance.byCount)
    .filter(([, row]) => row.cabalWin === rule)
    .map(([n]) => Number(n))
    .sort((a, b) => a - b);
}

/** The most Knife cards (roles holding `kill`) any deck deals: "Two-Killer games" (the 10-seat deck). */
function maxKillers(data: CardData): number {
  const killers = (cards: readonly string[]) =>
    cards.filter((id) => data.roles.roles[id]?.abilities.includes('kill')).length;
  return Math.max(...Object.values(data.roles.decks).map((deck) => killers(deck.cards)));
}

/**
 * The words of one token. `byCount.<rule>.from` is the smallest party size playing `rule`; `byCount.<rule>.sizes`
 * is its sizes as a run, "4-5" (or "4" alone); `decks.killers.max` is the most Killers a deck deals. Any other token
 * is a path that must end on a number, written in the `style` asked. Throws on a token that names nothing, so a typo
 * cannot ship.
 */
export function cardToken(data: CardData, path: string, style?: string): string {
  if (path === 'decks.killers.max') return styled(style, maxKillers(data));
  const rule = /^byCount\.(\w+)\.(from|sizes)$/.exec(path);
  if (rule) {
    const sizes = sizesOf(data, rule[1] as string);
    const first = sizes[0];
    const last = sizes.at(-1);
    if (first === undefined || last === undefined)
      throw new Error(`card token {${path}}: no party size plays it`);
    if (last - first !== sizes.length - 1) throw new Error(`card token {${path}}: its sizes are not one run`);
    if (rule[2] === 'from') return styled(style, first);
    return first === last ? String(first) : `${first}-${last}`;
  }
  let at: unknown = data;
  for (const key of path.split('.')) {
    at = at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined;
  }
  if (typeof at !== 'number') throw new Error(`card token {${path}}: not a number in the data`);
  return styled(style, at);
}

/** One text with its tokens filled. */
export const fillCard = (data: CardData, text: string): string =>
  text.replace(CARD_TOKEN, (_, style: string | undefined, path: string) => cardToken(data, path, style));

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
