import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import { onubDeckProblem, type OnubDeckProblem, type OnubDeckRole } from '@wdi/shared/rules';
import type { LobbySnapshot, NetworkService } from '../../net/NetworkService';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START } from '../../net/protocol';
import { fill } from '../copy';
import { ONUB_PREP_COPY as C } from '../copy/onubPrep';
import { h } from '../dom';

export interface DeckEditor {
  /** Re-reads the lobby: the mode, the leader, the party size and `settings.onubDeck`. */
  update(s: LobbySnapshot): void;
  destroy(): void;
}

const ROLES = onubRoles.roles as Record<string, OnubDeckRole & { name: string; gloss: string }>;
const ROLE_IDS = Object.keys(ROLES);

/**
 * A stand-in of `onubDeckProblem` (5A, `rules/onub.ts`) with the same signature and the same order of checks
 * (GDD 3.11 "Decks"). `deckProblem` below uses the shared rule as soon as it is filled and falls back to this
 * until then.
 */
export function localDeckProblem(
  deck: readonly string[],
  roles: Readonly<Record<string, OnubDeckRole | undefined>>,
  size?: number,
): OnubDeckProblem | null {
  const counts = new Map<string, number>();
  for (const id of deck) {
    if (roles[id] === undefined) return 'unknownRole';
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const id of counts.keys()) if (roles[id]?.ships !== 'V1') return 'notShipped';
  for (const [id, n] of counts) if (!roles[id]?.copies.includes(n)) return 'copies';
  for (const [id, role] of Object.entries(roles))
    if (role?.required === true && !counts.has(id)) return 'missingRequired';
  if (size !== undefined && deck.length !== size) return 'size';
  return null;
}

export function deckProblem(deck: readonly string[], size?: number): OnubDeckProblem | null {
  try {
    return onubDeckProblem(deck, ROLES, size);
  } catch {
    return localDeckProblem(deck, ROLES, size);
  }
}

/** Cards a party of `players` needs: the seats (after the NPC fill) plus the Pantry's Role cards. */
export const deckSize = (players: number): number =>
  Math.max(players, MIN_PLAYERS_TO_START) + onubBalance.pantry.roles;

/** The default deck for a party size (`byCount`), clamped to the sizes the table lists. */
export function defaultDeck(players: number): string[] {
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS_TO_START, players));
  return [...onubBalance.byCount[String(n) as keyof typeof onubBalance.byCount].deck];
}

/** The deck in `roles.onub.json` order, so the same toggles always send the same list. */
export function orderedDeck(counts: ReadonlyMap<string, number>): string[] {
  return ROLE_IDS.flatMap((id) => Array<string>(counts.get(id) ?? 0).fill(id));
}

export function countsOf(deck: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** The count a role takes after one press: 0, then each allowed number of copies, then back to 0. */
export function nextCount(roleId: string, current: number): number {
  const steps = [0, ...(ROLES[roleId]?.copies ?? [])];
  return steps[(steps.indexOf(current) + 1) % steps.length] ?? 0;
}

export function toggleRole(deck: readonly string[], roleId: string): string[] {
  const counts = countsOf(deck);
  counts.set(roleId, nextCount(roleId, counts.get(roleId) ?? 0));
  return orderedDeck(counts);
}

/**
 * The quick-mode deck editor under the lobby settings (GDD 3.11 "Decks", round-5 contract 5.3): the leader
 * toggles the roles of `roles.onub.json`; a draft that passes the size-free check goes out through
 * `net.setOnubDeck`, one that does not stays local with its problem line. Everyone sees the deck and the line
 * that says why it cannot start.
 */
export function mountDeckEditor(root: HTMLElement, net: NetworkService): DeckEditor {
  const count = h('p', { class: 'wdi-glass-panel__hint', 'data-testid': 'deck-count' });
  const problem = h('p', {
    class: 'wdi-field__msg wdi-field__msg--error',
    role: 'alert',
    'data-testid': 'deck-problem',
    hidden: true,
  });
  const reset = h(
    'button',
    {
      type: 'button',
      class: 'wdi-glass-btn wdi-glass-btn--sm',
      'data-testid': 'deck-reset',
      hidden: true,
    },
    C['onub.deck.reset'],
  );
  const buttons = new Map<string, HTMLButtonElement>();
  for (const id of ROLE_IDS) {
    const role = ROLES[id]!;
    const b = h(
      'button',
      {
        type: 'button',
        class: 'wdi-glass-btn wdi-glass-btn--sm wdi-deck__role',
        'data-testid': `deck-role-${id}`,
        'aria-pressed': false,
        title: role.gloss,
      },
      role.name,
    );
    b.addEventListener('click', () => press(id));
    buttons.set(id, b);
  }
  const el = h(
    'div',
    { class: 'wdi-lobby__stack wdi-deckedit', 'data-testid': 'deck-editor', hidden: true },
    h('h3', { class: 'wdi-glass-panel__title' }, C['onub.deck.title']),
    h(
      'p',
      { class: 'wdi-glass-panel__hint' },
      fill(C['onub.deck.hint'], { pantry: onubBalance.pantry.roles }),
    ),
    h('div', { class: 'wdi-deckedit__roles' }, ...buttons.values()),
    count,
    problem,
    reset,
  );
  root.append(el);

  let snap: LobbySnapshot | null = null;
  let draft: string[] | null = null;

  const current = (): string[] => {
    if (draft !== null) return draft;
    const set = snap?.settings.onubDeck ?? [];
    return set.length > 0 ? [...set] : defaultDeck(snap?.players.length ?? MIN_PLAYERS_TO_START);
  };

  function press(id: string) {
    if (snap === null || snap.selfId !== snap.leaderId) return;
    draft = toggleRole(current(), id);
    if (deckProblem(draft) === null) net.setOnubDeck(draft);
    render();
  }
  reset.addEventListener('click', () => {
    draft = null;
    net.setOnubDeck([]);
    render();
  });

  function render() {
    if (snap === null) return;
    const leader = snap.selfId === snap.leaderId;
    const deck = current();
    const counts = countsOf(deck);
    const need = deckSize(snap.players.length);
    const why = deckProblem(deck, need);
    el.hidden = snap.settings.mode !== 'onub';
    for (const [id, b] of buttons) {
      const n = counts.get(id) ?? 0;
      b.disabled = !leader;
      b.setAttribute('aria-pressed', String(n > 0));
      b.classList.toggle('is-on', n > 0);
      b.textContent = n > 1 ? `${ROLES[id]!.name} ${fill(C['onub.deck.copies'], { n })}` : ROLES[id]!.name;
    }
    count.textContent = fill(C['onub.deck.count'], { n: deck.length, need });
    problem.hidden = why === null;
    problem.textContent = why === null ? '' : fill(C[`onub.deck.problem.${why}`], { n: deck.length, need });
    reset.hidden = !leader || (snap.settings.onubDeck.length === 0 && draft === null);
  }

  return {
    update(s) {
      snap = s;
      // The server's echo ends a draft; an unsent draft (a problem before the size) outlives it.
      if (draft !== null && s.settings.onubDeck.length > 0 && deckProblem(draft) === null) draft = null;
      render();
    },
    destroy: () => el.remove(),
  };
}
