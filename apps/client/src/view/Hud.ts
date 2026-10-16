import { TICK_RATE } from '@wdi/shared/constants';
import { h } from '../ui/dom';
import '../ui/theme/tokens.css';
import '../ui/theme/components.css';
import './hud.css';

export interface HudChip {
  team: string;
  goal: string;
}

export type ToastKind = 'interact' | 'hazard' | 'warm';

/** Seconds left as m:ss; the placeholder when no timer is running. */
export function formatTimer(ticksLeft: number | null): string {
  if (ticksLeft === null || ticksLeft < 0) return '--:--';
  const s = Math.ceil(ticksLeft / TICK_RATE);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Elapsed match time as m:ss from ticks (the Notebook's time column). */
export const formatClock = formatTimer;

/** One-time toast keys already shown this page load (the grace hints must not repeat per scene). */
const shownToasts = new Set<string>();

const icon = (base: string, path: string) =>
  h('img', { class: 'wdi-icon', alt: '', src: `${base}assets/ui/${path}.svg` });

/**
 * DOM overlay of the World scene on the theme's `wdi-hud` components (docs/UI.md 6): the goal chip and
 * the Notebook button top-left, the phase clock top-centre, the log and the FPS readout top-right, the
 * contextual prompt and the toasts above the touch cluster, and screen-edge cues for noise.
 */
export class Hud {
  readonly root: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly chipGoal: HTMLElement;
  private readonly chipRole: HTMLElement;
  private readonly notebookBtn: HTMLButtonElement;
  private readonly clock: HTMLElement;
  private readonly clockTime: HTMLElement;
  private readonly clockPhase: HTMLElement;
  private readonly log: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly promptKey: HTMLElement;
  private readonly fps: HTMLElement;
  private readonly timers = new Set<number>();

  constructor(
    parent: HTMLElement,
    private readonly base = import.meta.env.BASE_URL,
  ) {
    this.chipGoal = h('span', { class: 'wdi-hud-chip__goal' });
    this.chipRole = h('span', { class: 'wdi-hud-chip__role' }, 'Your goal');
    this.chip = h(
      'div',
      { class: 'wdi-hud-chip', hidden: true },
      h('span', { class: 'wdi-icon-disc' }, icon(base, 'marks/mark_notebook_tab')),
      h('span', { class: 'wdi-hud-chip__text' }, this.chipRole, this.chipGoal),
    );
    this.notebookBtn = h(
      'button',
      {
        type: 'button',
        class: 'wdi-btn wdi-btn--icon',
        'aria-label': 'Notebook (N)',
        'data-testid': 'notebook-open',
      },
      icon(base, 'marks/mark_notebook_tab'),
    );
    this.clockTime = h('span', { class: 'wdi-hud-clock__time' }, '--:--');
    this.clockPhase = h('span', { class: 'wdi-hud-clock__phase' });
    this.clock = h(
      'div',
      { class: 'wdi-hud-clock', 'data-testid': 'hud-clock' },
      this.clockTime,
      this.clockPhase,
    );
    this.log = h('div', { class: 'wdi-log', role: 'log' });
    this.fps = h('pre', { class: 'wdi-hud-fps', 'data-testid': 'hud-fps', hidden: true });
    this.promptText = h('span');
    this.promptKey = h('kbd', { class: 'wdi-kbd wdi-toast__kbd' }, 'E');
    this.promptEl = h(
      'div',
      { class: 'wdi-toast wdi-toast--interact wdi-hud-prompt', 'data-testid': 'prompt', hidden: true },
      this.promptText,
      this.promptKey,
    );
    this.toasts = h('div', { class: 'wdi-toasts', role: 'status' }, this.promptEl);
    this.root = h(
      'div',
      { class: 'wdi-root wdi-hud', 'data-testid': 'hud' },
      h('div', { class: 'wdi-hud__tl' }, this.chip, this.notebookBtn),
      h('div', { class: 'wdi-hud__tc' }, this.clock),
      h('div', { class: 'wdi-hud__tr' }, this.log, this.fps),
      this.toasts,
    );
    parent.append(this.root);
  }

  setChip(chip: HudChip | null): void {
    this.chip.hidden = chip === null;
    if (chip !== null) this.chipGoal.textContent = chip.goal;
  }

  /** The line under "Your goal"; a ghost reads "You are a ghost" here as well as in the log. */
  setGhost(on: boolean): void {
    this.chipRole.textContent = on ? 'You are a ghost' : 'Your goal';
  }

  onNotebook(handler: () => void): void {
    this.notebookBtn.addEventListener('click', handler);
  }

  setTimer(ticksLeft: number | null): void {
    const text = formatTimer(ticksLeft);
    if (this.clockTime.textContent !== text) this.clockTime.textContent = text;
  }

  /** The phase name beside the digits; `night` turns the digits moon-blue. */
  setPhase(label: string, night: boolean): void {
    if (this.clockPhase.textContent !== label) this.clockPhase.textContent = label;
    this.clock.classList.toggle('wdi-hud-clock--night', night);
  }

  /** A short line in the log, top right; it fades out by itself. */
  say(text: string, ms = 2600): void {
    const line = h('p', { class: 'wdi-log__line' }, text);
    this.log.append(line);
    while (this.log.children.length > 4) this.log.firstElementChild?.remove();
    this.later(() => line.remove(), ms);
  }

  /** A toast above the controls; `once` keys one-time hints so a World restart does not repeat them. */
  toast(text: string, kind: ToastKind, key?: string, ms = 4000, once?: string): void {
    if (once !== undefined) {
      if (shownToasts.has(once)) return;
      shownToasts.add(once);
    }
    const el = h(
      'div',
      { class: `wdi-toast wdi-toast--${kind}` },
      h('span', {}, text),
      key ? h('kbd', { class: 'wdi-kbd wdi-toast__kbd' }, key) : null,
    );
    this.toasts.insertBefore(el, this.promptEl);
    this.later(() => el.remove(), ms);
  }

  /** The contextual prompt for the nearest target; `null` hides it. */
  setPrompt(text: string | null, key = 'E'): void {
    this.promptEl.hidden = text === null;
    if (text === null) return;
    if (this.promptText.textContent !== text) this.promptText.textContent = text;
    if (this.promptKey.textContent !== key) this.promptKey.textContent = key;
  }

  /** A pulsing ring at the screen edge, `angle` radians clockwise from screen-up, `at` in 0..1 of the edge box. */
  edgeCue(x: number, y: number, angle: number, label: string, ms = 1800): void {
    const cue = h(
      'div',
      { class: 'wdi-edge-cue', 'aria-label': label, style: `left:${x}px;top:${y}px` },
      h('img', {
        class: 'wdi-icon',
        alt: '',
        src: `${this.base}assets/ui/glyphs/glyph_chevron.svg`,
        style: `transform: rotate(${angle + Math.PI}rad)`,
      }),
    );
    this.root.append(cue);
    this.later(() => cue.remove(), ms);
  }

  setFps(text: string | null): void {
    this.fps.hidden = text === null;
    if (text !== null) this.fps.textContent = text;
  }

  setHidden(hidden: boolean): void {
    this.root.hidden = hidden;
  }

  destroy(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    this.root.remove();
  }

  private later(fn: () => void, ms: number): void {
    const t = window.setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }
}
