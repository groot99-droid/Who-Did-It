import type { NetworkService } from '../../net/NetworkService';
import { h, type Screen } from '../dom';
import { STORY_COPY as C } from './copy';
import {
  cardButton,
  closeCard,
  emptyStory,
  markFinished,
  onCard,
  onGoals,
  summaryRows,
  type StoryCard,
  type StoryGoals,
  type StoryState,
} from './model';
import './story.css';

/**
 * The story layer (docs/story/README.md 3, docs/round9/phases.md 8): one full-screen chapter card at a time over the
 * world, and the goals strip while the world is up. It listens to the private `story.card` and `story.goals` on the
 * network bus and answers a card with `story.continue`. All words come from the messages; the chrome is `copy.ts`.
 */

/** Which card element: the title card names the chapter, a beat speaks, the end card sums up. */
export function cardEl(
  card: StoryCard,
  onContinue: () => void,
): { el: HTMLElement; button: HTMLButtonElement } {
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'wdi-glass-btn wdi-glass-btn--primary wdi-story__go',
      'data-testid': 'story-continue',
    },
    C[cardButton(card)],
  );
  btn.addEventListener('click', onContinue);
  const rows = summaryRows(card);
  const body = h(
    'div',
    { class: 'wdi-story__body' },
    ...card.lines.map((line) => h('p', { class: 'wdi-story__line', 'data-testid': 'story-line' }, line)),
  );
  const root = h(
    'section',
    {
      class: `wdi-story wdi-story--${card.kind}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'story-card-title',
      'data-testid': 'story-card',
      'data-kind': card.kind,
      'data-chapter': card.chapterId,
    },
    h(
      'div',
      { class: 'wdi-story__panel wdi-glass-panel' },
      card.portrait
        ? h(
            'div',
            { class: 'wdi-story__portrait', 'data-portrait': card.portrait, 'aria-hidden': 'true' },
            card.portrait.charAt(0),
          )
        : null,
      card.title
        ? h(
            'h2',
            { id: 'story-card-title', class: 'wdi-story__title', 'data-testid': 'story-title' },
            card.title,
          )
        : null,
      body,
      card.goal
        ? h(
            'p',
            { class: 'wdi-story__goal', 'data-testid': 'story-goal' },
            h('b', {}, `${C['story.card.goal']}: `),
            card.goal,
          )
        : null,
      rows.length > 0
        ? h(
            'div',
            { class: 'wdi-story__summary', 'data-testid': 'story-summary' },
            h('p', { class: 'wdi-eyebrow' }, C['story.card.summary']),
            h('dl', {}, ...rows.flatMap((r) => [h('dt', {}, r.label), h('dd', {}, String(r.value))])),
          )
        : null,
      card.next
        ? h(
            'p',
            { class: 'wdi-story__next', 'data-testid': 'story-next' },
            h('b', {}, `${C['story.card.upNext']}: `),
            card.next,
          )
        : null,
      btn,
    ),
  );
  return { el: root, button: btn };
}

/** The strip of goals: what is asked and what is done, small enough to sit over the corner of a phone. */
export function goalsEl(goals: StoryGoals): HTMLElement {
  const next = goals.goals.find((g) => !g.done)?.id;
  return h(
    'aside',
    { class: 'wdi-story-goals wdi-glass', 'data-testid': 'story-goals', 'data-chapter': goals.chapterId },
    h('p', { class: 'wdi-eyebrow' }, C['story.goals.title']),
    h(
      'ul',
      {},
      ...goals.goals.map((g) =>
        h(
          'li',
          {
            class: `${g.done ? 'is-done' : ''}${g.id === next ? ' is-next' : ''}`.trim(),
            'data-goal': g.id,
            'data-done': String(g.done),
          },
          h('span', { class: 'wdi-story-goals__mark', 'aria-hidden': 'true' }, g.done ? '✓' : '○'),
          h('span', {}, g.text),
          g.done ? h('span', { class: 'wdi-sr-only' }, ` (${C['story.goals.done']})`) : null,
        ),
      ),
    ),
  );
}

export function mountStoryLayer(parent: HTMLElement, net: Pick<NetworkService, 'bus' | 'send'>): Screen {
  let state: StoryState = emptyStory();
  let cardNode: HTMLElement | null = null;
  let goalsNode: HTMLElement | null = null;

  const render = () => {
    cardNode?.remove();
    cardNode = null;
    goalsNode?.remove();
    goalsNode = null;
    if (state.card !== null) {
      const made = cardEl(state.card, () => {
        const chapterId = state.card?.chapterId;
        if (state.card?.kind === 'end' && chapterId) markFinished(chapterId);
        state = closeCard(state);
        render();
        net.send('story.continue', {});
      });
      cardNode = made.el;
      parent.append(cardNode);
      made.button.focus();
    } else if (state.goals !== null && state.goals.goals.length > 0) {
      goalsNode = goalsEl(state.goals);
      parent.append(goalsNode);
    }
  };
  const card = (c: StoryCard) => {
    state = onCard(state, c);
    render();
  };
  const goals = (g: StoryGoals) => {
    state = onGoals(state, g);
    if (state.card === null) render();
  };
  net.bus.on('story.card', card);
  net.bus.on('story.goals', goals);
  return {
    destroy: () => {
      net.bus.off('story.card', card);
      net.bus.off('story.goals', goals);
      cardNode?.remove();
      goalsNode?.remove();
    },
  };
}
