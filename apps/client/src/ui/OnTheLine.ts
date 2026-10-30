import balance from '@wdi/content/data/balance.json';
import { Phase } from '@wdi/shared';
import type { DeathCause } from '@wdi/shared/protocol';
import type { WorldFeed } from '../net/world';
import { NotebookPanel } from '../view/NotebookPanel';
import { loadSceneName } from '../view/sceneNames';
import { fill } from './copy';
import { M5B_COPY } from './copy/m5b';
import { WORLD_COPY as C } from './copy/world';
import { h } from './dom';
import { questRowEl, questRows } from './QuestLog';

/**
 * On the line (round 10, C1b; docs/round9/phases.md 6, UI.md 14.47 and 14.51.5): the screen of a seat that died by
 * day, in place of the ghost view, until the morning train brings it back. It shows the dark carriage, the time to the
 * train (or, on the last cycle, to the Final Night's bells), how and where the seat died, what it keeps, and its own
 * Notebook and quests read only; nothing of the world: the server sends a seat on the line no scene and no figure
 * (GDD 3.22), while its private view still syncs.
 */

/**
 * The day that follows `round` is the Final Night (`sim/FinalNight.ts` `isFinalNightRound(round + 1)`): no morning
 * train comes, the bells bring every seat on the line back as the hunt begins (GDD 3.3).
 */
export const bellsNext = (round: number): boolean => round + 1 > balance.finalNight.afterCycle;

/**
 * Seconds left before the next morning train, from the phase and the seconds left in it (one cycle at most); with
 * `toBells`, before the bells instead, which ring as the night (or a meeting's immunity) ends, with no `arriveAtS`.
 */
export function lineSecondsLeft(phase: number, phaseLeftS: number, toBells = false): number {
  const p = balance.phases;
  const arrive = toBells ? 0 : balance.train.arriveAtS;
  const left = Math.max(0, phaseLeftS);
  switch (phase) {
    case Phase.grace:
      return left + arrive;
    case Phase.day:
      return left + p.duskS + p.nightS + arrive;
    case Phase.dusk:
      return left + p.nightS + arrive;
    case Phase.night:
      return left + arrive;
    // A meeting ends the day: its phases, then immunity opens a new day and the train comes in (Phases.ts).
    case Phase.meetingDiscussion:
      return left + p.voteS + p.revealS + p.immunityS + arrive;
    case Phase.meetingVote:
      return left + p.revealS + p.immunityS + arrive;
    case Phase.reveal:
      return left + p.immunityS + arrive;
    case Phase.immunity:
      return left + arrive;
    default:
      return left;
  }
}

/** "4:05" for the top band; minutes may pass 60. */
export function lineClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const CAUSE: Partial<Record<DeathCause, keyof typeof C>> = {
  wolf: 'line.cause.wolf',
  creature: 'line.cause.creature',
  shot: 'line.cause.shot',
};

/** The centre line: how and where the seat died, from its own `killed`; the plain line when no `killed` reached it. */
export const lineCause = (cause: DeathCause | undefined, place: string | undefined): string => {
  const key = cause && CAUSE[cause];
  return key && place ? fill(C[key], { place }) : C['line.cause.other'];
};

/** The place's name before `@wdi/content` loads: the id with underscores spelled out, as `sceneNames.ts` falls back. */
const placeholder = (sceneId: string | undefined): string | undefined => sceneId?.replaceAll('_', ' ');

/** What the screen shows of the seat: its death and its private view (the Notebook and the quests, read only). */
export interface LineDeps {
  cause: DeathCause | undefined;
  /** The scene the seat fell in (`killed.sceneId`), named by `sceneNames.ts`. */
  sceneId: string | undefined;
  feed: WorldFeed;
}

export interface LineScreen {
  /** `toBells`: the next day is the Final Night, so the band counts to its bells (`line.bells`), not to a train. */
  update(secondsLeft: number, toBells?: boolean): void;
  destroy(): void;
}

const NO_GIVERS: ReadonlySet<string> = new Set();

export function mountOnTheLine(parent: HTMLElement, deps: LineDeps): LineScreen {
  const clock = h('span', { class: 'wdi-line__clock', 'data-testid': 'line-clock' });
  const cause = h(
    'p',
    { class: 'wdi-line__cause', 'data-testid': 'line-cause' },
    lineCause(deps.cause, placeholder(deps.sceneId)),
  );
  const questList = h('ul', { class: 'wdi-m5b__list', 'data-testid': 'line-quests' });
  const book = h('div', { class: 'wdi-line__book' });
  const root = h(
    'section',
    { class: 'wdi-line', 'data-testid': 'on-the-line', role: 'dialog', 'aria-label': C['line.title'] },
    h('header', { class: 'wdi-line__band' }, h('h2', {}, C['line.title']), clock),
    cause,
    h('p', { class: 'wdi-line__kept' }, C['line.kept']),
    book,
  );
  parent.append(root);
  // The book (phases.md 6): the Notebook, then the quests the seat holds; no Accept, no Take, no Hand-in, no offer.
  const notebook = new NotebookPanel(book, deps.feed, true);
  book.append(
    h(
      'section',
      { class: 'wdi-glass wdi-line__quests', 'aria-label': M5B_COPY['quest.title'] },
      h('h2', { class: 'wdi-eyebrow' }, M5B_COPY['quest.title']),
      questList,
    ),
  );
  let gone = false;
  if (deps.sceneId !== undefined) {
    void loadSceneName(deps.sceneId).then((name) => {
      if (!gone) cause.textContent = lineCause(deps.cause, name);
    });
  }
  let shownClock = '';
  let shownQuests: string | null = null;
  const drawQuests = () => {
    const rows = questRows(deps.feed.quests(), deps.feed.inventory(), NO_GIVERS);
    const sig = rows.map((r) => `${r.id}:${r.state}:${r.have}`).join('|');
    if (sig === shownQuests) return;
    shownQuests = sig;
    questList.replaceChildren(
      ...(rows.length === 0
        ? [h('li', { class: 'wdi-m5b__empty', 'data-testid': 'line-quests-empty' }, C['line.quests.none'])]
        : rows.map((r) => questRowEl(r, null))),
    );
  };
  drawQuests();
  return {
    update(secondsLeft, toBells = false) {
      const text = fill(C[toBells ? 'line.bells' : 'line.train'], { time: lineClock(secondsLeft) });
      if (text !== shownClock) {
        shownClock = text;
        clock.textContent = text;
      }
      notebook.update();
      drawQuests();
    },
    destroy() {
      gone = true;
      notebook.destroy();
      root.remove();
    },
  };
}
