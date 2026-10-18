import onubBalance from '@wdi/content/data/balance.onub.json';
import type { OnubClaimPayload } from '@wdi/shared/protocol';
import type { OnubFeed } from '../../net/onub';
import { ONUB_NIGHT_COPY as C } from '../copy/onubNight';
import { h } from '../dom';
import { cardName, claimableRoles, PANTRY, roleName } from './rushModel';

interface Saw {
  target: string;
  kind: 'role' | 'station';
  value: string;
}

interface Draft {
  role: string;
  station: string;
  card: string;
  saw: Saw[];
}

const blank = (): Draft => ({ role: '', station: '', card: '', saw: [] });

export interface ClaimForm {
  /** `claim-open`: opens and closes the form. */
  open: HTMLButtonElement;
  /** `claim-form`. */
  form: HTMLElement;
  /** Closes the form when the seat can no longer claim. */
  close(canClaim: boolean): void;
}

/**
 * The structured claim form of the Morning Rush and CRUST (GDD 3.11): the role you say you were dealt, optionally
 * the station and card, and up to `claims.maxSaw` sightings. `refresh` re-runs the panel's update after a change.
 */
export function createClaimForm(
  onub: OnubFeed,
  nameOf: (id: string) => string,
  refresh: () => void,
): ClaimForm {
  const open = h('button', { type: 'button', class: 'wdi-btn wdi-btn--ghost', 'data-testid': 'claim-open' });
  const form = h('div', {
    class: 'wdi-stack wdi-stack--tight wdi-claim-form',
    'data-testid': 'claim-form',
    hidden: true,
  });
  let draft = blank();
  let formOpen = false;

  const chip = (testid: string, label: string, on: boolean, click: () => void) => {
    const b = h(
      'button',
      {
        type: 'button',
        class: `wdi-btn wdi-btn--ghost${on ? ' is-selected' : ''}`,
        'aria-pressed': String(on),
        'data-testid': testid,
      },
      label,
    );
    b.addEventListener('click', click);
    return b;
  };

  const select = (label: string, options: [string, string][], value: string, change: (v: string) => void) => {
    const el = h(
      'select',
      { class: 'wdi-input', 'aria-label': label },
      h('option', { value: '' }, C['onub.claim.none']),
      ...options.map(([v, text]) =>
        h('option', { value: v, ...(v === value ? { selected: true } : {}) }, text),
      ),
    );
    el.addEventListener('change', () => change(el.value));
    return el;
  };

  const renderForm = () => {
    const deck = onub.board().deck;
    const maxSaw = onubBalance.claims.maxSaw;
    const seatOptions: [string, string][] = [
      ...onub
        .board()
        .seats.filter((id) => id !== onub.selfId)
        .map((id) => [id, nameOf(id)] as [string, string]),
      [PANTRY, C['onub.claim.saw.pantry']],
    ];
    const station = onubBalance.stations.find((s) => s.id === draft.station);
    const post = h(
      'button',
      { type: 'button', class: 'wdi-btn', 'data-testid': 'claim-post', disabled: draft.role === '' },
      C['onub.claim.post'],
    );
    post.addEventListener('click', () => {
      const payload: OnubClaimPayload = { roleId: draft.role };
      if (draft.station !== '') payload.stationId = draft.station;
      if (draft.card !== '') payload.cardId = draft.card;
      const saw = draft.saw.filter((s) => s.target !== '' && s.value !== '');
      if (saw.length > 0)
        payload.saw = saw.map((s) => ({
          targetId: s.target,
          ...(s.kind === 'role' ? { roleId: s.value } : { stationId: s.value }),
        }));
      onub.claim(payload);
      formOpen = false;
      draft = blank();
      refreshForm();
    });
    const add = h(
      'button',
      {
        type: 'button',
        class: 'wdi-btn wdi-btn--ghost',
        'data-testid': 'claim-saw-add',
        hidden: draft.saw.length >= maxSaw,
      },
      C['onub.claim.saw.add'],
    );
    add.addEventListener('click', () => {
      draft.saw.push({ target: '', kind: 'role', value: '' });
      refreshForm();
    });
    const sawRows = draft.saw.map((s, i) => {
      const values: [string, string][] =
        s.kind === 'role'
          ? claimableRoles(deck).map((r) => [r, roleName(r)])
          : onubBalance.stations.map((st) => [st.id, st.name]);
      const remove = h(
        'button',
        { type: 'button', class: 'wdi-btn wdi-btn--ghost' },
        C['onub.claim.saw.remove'],
      );
      remove.addEventListener('click', () => {
        draft.saw.splice(i, 1);
        refreshForm();
      });
      return h(
        'div',
        { class: 'wdi-row wdi-row--wrap', 'data-testid': `claim-saw-${i}` },
        select(C['onub.claim.saw.target'], seatOptions, s.target, (v) => (s.target = v)),
        select(
          C['onub.claim.saw.kind'],
          [
            ['role', C['onub.claim.saw.role']],
            ['station', C['onub.claim.saw.station']],
          ],
          s.kind,
          (v) => {
            s.kind = v === 'station' ? 'station' : 'role';
            s.value = '';
            refreshForm();
          },
        ),
        select(C['onub.claim.saw.value'], values, s.value, (v) => (s.value = v)),
        remove,
      );
    });
    const cardsRow =
      station === undefined
        ? []
        : [
            h('p', { class: 'wdi-eyebrow' }, C['onub.claim.card']),
            h(
              'div',
              { class: 'wdi-row wdi-row--wrap' },
              ...[...station.good, ...station.sabotage].map((c) =>
                chip(`claim-card-${c}`, cardName(c), draft.card === c, () => {
                  draft.card = draft.card === c ? '' : c;
                  refreshForm();
                }),
              ),
            ),
          ];
    form.replaceChildren(
      h('p', { class: 'wdi-eyebrow' }, C['onub.claim.role']),
      h(
        'div',
        { class: 'wdi-row wdi-row--wrap' },
        ...claimableRoles(deck).map((r) =>
          chip(`claim-role-${r}`, roleName(r), draft.role === r, () => {
            draft.role = draft.role === r ? '' : r;
            refreshForm();
          }),
        ),
      ),
      h('p', { class: 'wdi-eyebrow' }, C['onub.claim.station']),
      h(
        'div',
        { class: 'wdi-row wdi-row--wrap' },
        ...onubBalance.stations.map((s) =>
          chip(`claim-station-${s.id}`, s.name, draft.station === s.id, () => {
            draft.station = draft.station === s.id ? '' : s.id;
            draft.card = '';
            refreshForm();
          }),
        ),
      ),
      ...cardsRow,
      h('p', { class: 'wdi-eyebrow' }, C['onub.claim.saw']),
      ...sawRows,
      add,
      post,
    );
  };

  const refreshForm = () => {
    form.hidden = !formOpen;
    if (formOpen) renderForm();
    refresh();
  };
  open.addEventListener('click', () => {
    formOpen = !formOpen;
    if (formOpen) {
      const mine = onub.claims().find((c) => c.from === onub.selfId);
      if (mine !== undefined)
        draft = {
          role: mine.roleId,
          station: mine.stationId,
          card: mine.cardId,
          saw: mine.saw.map((s) =>
            s.roleId !== ''
              ? { target: s.targetId, kind: 'role', value: s.roleId }
              : { target: s.targetId, kind: 'station', value: s.stationId },
          ),
        };
    }
    refreshForm();
  });

  return {
    open,
    form,
    close(canClaim) {
      if (canClaim || !formOpen) return;
      formOpen = false;
      form.hidden = true;
    },
  };
}
