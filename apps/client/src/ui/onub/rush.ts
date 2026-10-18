import type { MeetingFeed } from '../../net/meeting';
import type { OnubFeed } from '../../net/onub';
import { renderPiles } from '../../view/onub/PilesView';
import { fill } from '../copy';
import { ONUB_NIGHT_COPY as C } from '../copy/onubNight';
import { h } from '../dom';
import { MEETING_PHASE } from '../meetingText';
import { createClaimForm } from './claim';
import { slotLabel } from './slots';
import { claimableRoles, claimLine, crustLine, outLines, PANTRY, roleName } from './rushModel';

export interface RushPanel {
  /** Re-reads both feeds; `ui/Meeting.ts` calls it with every refresh. */
  update(): void;
  destroy(): void;
}

/**
 * The quick-mode Morning Rush panel (GDD 3.11): the public board, the claims and the claim form, the Pantry vote,
 * the CRUST countdown and the Final Bake's lines. `ui/Meeting.ts` mounts it in quick mode (and hides Skip
 * there); the vote itself and the chat stay on the MeetingFeed.
 */
export function mountRush(root: HTMLElement, meeting: MeetingFeed, onub: OnubFeed): RushPanel {
  const nameOf = (id: string) =>
    meeting.roster().find((p) => p.id === id)?.name ?? onub.seats().find((s) => s.id === id)?.name ?? '?';

  // --- the board ---------------------------------------------------------------------------------
  const deckLine = h('p', { class: 'wdi-muted' });
  const clocheLine = h('p', { class: 'wdi-muted' });
  const piles = h('div', {});
  const board = h(
    'section',
    { class: 'wdi-stack wdi-stack--tight', 'data-testid': 'rush-board' },
    h('h2', { class: 'wdi-eyebrow' }, C['onub.rush.title']),
    deckLine,
    clocheLine,
    piles,
  );

  // --- the claims ---------------------------------------------------------------------------------
  const claimList = h('ul', { class: 'wdi-stack wdi-stack--tight', 'data-testid': 'rush-claims' });
  const claimForm = createClaimForm(onub, nameOf, () => update());
  const { open, form } = claimForm;

  // --- the vote, CRUST and the Final Bake -------------------------------------------------------------
  const pantryCount = h('span', {
    class: 'wdi-chip wdi-chip--vote',
    hidden: true,
    'data-testid': 'vote-count-pantry',
  });
  const votePantry = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--ghost', 'data-testid': 'vote-pantry' },
    h('span', {}, C['onub.vote.pantry']),
    pantryCount,
  );
  votePantry.addEventListener('click', () => meeting.vote(PANTRY));
  const crust = h('p', {
    class: 'wdi-display wdi-display--md',
    'aria-live': 'assertive',
    'data-testid': 'crust-countdown',
  });
  const outTitle = h('h2', { class: 'wdi-eyebrow' }, C['onub.out.title']);
  const outRole = h('div', { class: 'wdi-stack wdi-stack--tight', 'data-testid': 'reveal-role' });
  const outHop = h('p', { class: 'wdi-text', 'data-testid': 'reveal-hop' });
  const outPantry = h('p', { class: 'wdi-text', 'data-testid': 'reveal-pantry' });
  const outAbstained = h('p', { class: 'wdi-hint', 'data-testid': 'reveal-abstained' });
  const outcome = h(
    'section',
    { class: 'wdi-stack wdi-stack--tight' },
    outTitle,
    outRole,
    outHop,
    outPantry,
    outAbstained,
  );

  root.replaceChildren(
    board,
    h(
      'section',
      { class: 'wdi-stack wdi-stack--tight' },
      h('h2', { class: 'wdi-eyebrow' }, C['onub.rush.claims']),
      claimList,
      open,
      form,
    ),
    h('div', { class: 'wdi-row' }, votePantry),
    crust,
    outcome,
  );

  // --- update -------------------------------------------------------------------------------------------
  let pilesKey = '';
  let claimsKey = '';
  const setText = (node: HTMLElement, text: string) => {
    if (node.textContent !== text) node.textContent = text;
  };

  function update(): void {
    const info = meeting.meeting();
    const clock = meeting.clock();
    const phase = info.phase !== 0 ? info.phase : clock.phase;
    const result = meeting.result();
    const me = meeting.roster().find((p) => p.id === meeting.selfId);
    const talking = result === null && (phase === MEETING_PHASE.discussion || phase === MEETING_PHASE.vote);
    const bd = onub.board();

    setText(deckLine, `${C['onub.rush.deck']}: ${claimableRoles(bd.deck).map(roleName).join(', ')}`);
    const names = onub.seats();
    setText(
      clocheLine,
      bd.cloche === ''
        ? C['onub.dawn.noCloche']
        : fill(C['onub.rush.cloche'], {
            card: slotLabel(bd.cloche, (i) => names.find((s) => s.id === bd.seats[i])?.name ?? '?'),
          }),
    );
    const pk = JSON.stringify(bd);
    if (pk !== pilesKey) {
      pilesKey = pk;
      renderPiles(piles, bd, { compact: true });
    }

    const claims = onub.claims();
    const ck =
      JSON.stringify(claims) +
      meeting
        .roster()
        .map((p) => p.name)
        .join(',');
    if (ck !== claimsKey) {
      claimsKey = ck;
      claimList.replaceChildren(
        ...(claims.length === 0
          ? [h('li', { class: 'wdi-hint' }, C['onub.rush.claims.empty'])]
          : claims.map((c) =>
              h('li', { class: 'wdi-text', 'data-testid': `claim-line-${c.from}` }, claimLine(c, nameOf)),
            )),
      );
    }
    const canClaim = talking && me?.alive === true;
    open.hidden = !canClaim;
    setText(
      open,
      onub.claims().some((c) => c.from === onub.selfId) ? C['onub.claim.edit'] : C['onub.claim.open'],
    );
    claimForm.close(canClaim);

    const mine = meeting.myVote();
    votePantry.disabled = !(talking && me?.alive === true);
    votePantry.classList.toggle('is-selected', mine === PANTRY);
    votePantry.setAttribute('aria-pressed', String(mine === PANTRY));
    const pantryVotes = result?.tally[PANTRY] ?? 0;
    pantryCount.hidden = result === null || pantryVotes === 0;
    setText(pantryCount, `${pantryVotes}`);

    const ticksLeft = (clock.phaseEndsTick > 0 ? clock.phaseEndsTick : info.endsTick) - clock.tick;
    setText(crust, result === null && phase === MEETING_PHASE.vote ? crustLine(ticksLeft) : '');
    crust.hidden = crust.textContent === '';

    outcome.hidden = result === null;
    if (result !== null) {
      const lines = outLines(result, nameOf);
      outRole.replaceChildren(...lines.outs.map((l) => h('p', { class: 'wdi-text' }, l)));
      for (const [el, text] of [
        [outHop, lines.hop],
        [outPantry, lines.pantry],
        [outAbstained, lines.abstained],
      ] as const) {
        setText(el, text);
        el.hidden = text === '';
      }
    }
  }

  update();
  return {
    update,
    destroy: () => root.replaceChildren(),
  };
}
