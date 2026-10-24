import { BODY_COPY as C } from '../../ui/copy/body';
import { fill } from '../../ui/copy';
import { h } from '../../ui/dom';
import { type BodyHudModel, type OwnBodySnap, bodyHudModel } from './model';
import './body.css';

/**
 * The body panel of the World HUD (round 8, 8A; GDD 3.22, docs/UI.md 14.32): the health and stamina bars and a
 * row of effect chips, drawn from this seat's `Private.body`. The function only: the caller feeds `update()` with
 * the own body and the clock each frame (nothing is written when nothing changed), and 8H animates the classes
 * (`is-wounded`, `is-down`, `is-fatigued`, a chip's `is-timed`). Hidden while the row is empty.
 */
export interface BodyHud {
  readonly root: HTMLElement;
  update(body: OwnBodySnap | null, tick: number): void;
  /** The last model drawn (tests and 8H's motion read it). */
  model(): BodyHudModel;
  destroy(): void;
}

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
}

function bar(kind: 'health' | 'stamina', label: string): Bar {
  const fillEl = h('i', { class: 'wdi-body__fill' });
  const value = h('span', { class: 'wdi-body__value' });
  const root = h(
    'div',
    {
      class: `wdi-body__bar wdi-body__bar--${kind}`,
      role: 'meter',
      'aria-label': label,
      'aria-valuemin': 0,
      'aria-valuenow': 0,
      'aria-valuemax': 0,
      'data-testid': `body-${kind}`,
    },
    h('span', { class: 'wdi-body__track' }, fillEl),
    h('span', { class: 'wdi-body__label' }, label),
    value,
  );
  return { root, fill: fillEl, value };
}

function setBar(b: Bar, value: number, max: number, pct: number): void {
  const width = `${pct}%`;
  if (b.fill.style.width !== width) b.fill.style.width = width;
  const text = fill(C['body.value'], { value, max });
  if (b.value.textContent !== text) b.value.textContent = text;
  if (b.root.getAttribute('aria-valuenow') !== String(value))
    b.root.setAttribute('aria-valuenow', String(value));
  if (b.root.getAttribute('aria-valuemax') !== String(max)) b.root.setAttribute('aria-valuemax', String(max));
}

/** Mounts the panel into `parent`; the caller places it (the HUD's bottom-left, UI.md 14.32). */
export function mountBodyHud(parent: HTMLElement): BodyHud {
  const health = bar('health', C['body.health']);
  const stamina = bar('stamina', C['body.stamina']);
  const chips = h('ul', {
    class: 'wdi-body__effects',
    'aria-label': C['body.effects'],
    'data-testid': 'body-effects',
  });
  const root = h(
    'section',
    { class: 'wdi-body', 'aria-label': C['body.label'], 'data-testid': 'body', hidden: true },
    health.root,
    stamina.root,
    chips,
  );
  parent.append(root);

  let last: BodyHudModel = bodyHudModel(null, 0);
  let chipKey = '';

  const drawChips = (m: BodyHudModel): void => {
    // Rebuilt only when the set, its order, its stacks or a second changed.
    const key = m.effects.map((e) => `${e.key}:${e.secondsLeft ?? '-'}:${e.stacks}`).join(';');
    if (key === chipKey) return;
    chipKey = key;
    chips.replaceChildren(
      ...m.effects.map((e) =>
        h(
          'li',
          {
            class: `wdi-body__chip wdi-body__chip--${e.key}${e.secondsLeft === null ? '' : ' is-timed'}`,
            'data-effect': e.key,
          },
          h('span', { class: 'wdi-body__chip-name' }, e.label),
          e.stacks > 1
            ? h('span', { class: 'wdi-body__chip-stacks' }, fill(C['body.stacks'], { n: e.stacks }))
            : null,
          e.secondsLeft === null
            ? null
            : h('span', { class: 'wdi-body__chip-left' }, fill(C['body.left'], { s: e.secondsLeft })),
        ),
      ),
    );
    chips.hidden = m.effects.length === 0;
  };

  return {
    root,
    update(body, tick) {
      const m = bodyHudModel(body, tick);
      last = m;
      if (root.hidden !== !m.shown) root.hidden = !m.shown;
      if (!m.shown) return;
      setBar(health, m.hp, m.maxHp, m.hpPct);
      setBar(stamina, m.stamina, m.maxStamina, m.staminaPct);
      root.classList.toggle('is-wounded', m.health === 'wounded');
      root.classList.toggle('is-down', m.health === 'down');
      root.classList.toggle('is-fatigued', m.staminaState === 'fatigued');
      drawChips(m);
    },
    model: () => last,
    destroy() {
      root.remove();
    },
  };
}
