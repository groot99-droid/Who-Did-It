import balance from '@wdi/content/data/balance.json';
import { Phase } from '@wdi/shared';
import type { DeathCause } from '@wdi/shared/protocol';
import { fill } from './copy';
import { WORLD_COPY as C } from './copy/world';
import { h } from './dom';

/**
 * On the line (round 10, C1b; docs/round9/phases.md 6, UI.md 14.47): the screen of a seat that died by day, in place
 * of the ghost view, until the morning train brings it back. It shows the dark carriage, the time to the train and
 * how the seat died, and nothing of the world: the server sends a seat on the line no scene and no figure (GDD 3.22).
 */

/** Seconds left before the next morning train, from the phase and the seconds left in it (one cycle at most). */
export function lineSecondsLeft(phase: number, phaseLeftS: number): number {
  const p = balance.phases;
  const arrive = balance.train.arriveAtS;
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

/** The centre line: how the seat died, from its own `killed`. */
export const lineCause = (cause: DeathCause | undefined): string =>
  C[(cause && CAUSE[cause]) ?? 'line.cause.other'];

export interface LineScreen {
  update(secondsLeft: number): void;
  destroy(): void;
}

export function mountOnTheLine(parent: HTMLElement, cause: DeathCause | undefined): LineScreen {
  const clock = h('span', { class: 'wdi-line__clock', 'data-testid': 'line-clock' });
  const root = h(
    'section',
    { class: 'wdi-line', 'data-testid': 'on-the-line', role: 'dialog', 'aria-label': C['line.title'] },
    h('header', { class: 'wdi-line__band' }, h('h2', {}, C['line.title']), clock),
    h('p', { class: 'wdi-line__cause' }, lineCause(cause)),
    h('p', { class: 'wdi-line__kept' }, C['line.kept']),
  );
  parent.append(root);
  let shown = '';
  return {
    update(secondsLeft) {
      const text = fill(C['line.train'], { time: lineClock(secondsLeft) });
      if (text === shown) return;
      shown = text;
      clock.textContent = text;
    },
    destroy() {
      root.remove();
    },
  };
}
