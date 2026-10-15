import { TICK_RATE } from '@wdi/shared/constants';
import { h } from '../ui/dom';
import './hud.css';

export interface HudChip {
  team: string;
  goal: string;
}

const ICON: Record<string, string> = {
  village: 'icon_faction_village',
  cabal: 'icon_faction_cabal',
  neutral: 'icon_faction_neutral',
};

/** Seconds left as m:ss; the placeholder when no timer is running. */
export function formatTimer(ticksLeft: number | null): string {
  if (ticksLeft === null || ticksLeft < 0) return '--:--';
  const s = Math.ceil(ticksLeft / TICK_RATE);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** DOM overlay of the World scene: the role chip, the phase timer, toasts and the optional FPS readout. */
export class Hud {
  readonly root: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly chipIcon: HTMLImageElement;
  private readonly chipText: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly fps: HTMLElement;
  private toastTimer: number | null = null;

  constructor(parent: HTMLElement, base = import.meta.env.BASE_URL) {
    this.chipIcon = h('img', {
      class: 'wdi-chip-icon',
      alt: '',
      src: `${base}assets/ui/icons/${ICON.village}.svg`,
    });
    this.chipText = h('span');
    this.chip = h('div', { class: 'wdi-chip', hidden: true }, this.chipIcon, this.chipText);
    this.timer = h('div', { class: 'wdi-timer' }, '--:--');
    this.toast = h('div', { class: 'wdi-toast', role: 'status' });
    this.fps = h('div', { class: 'wdi-fps', hidden: true });
    this.root = h('div', { class: 'wdi-hud' }, this.chip, this.timer, this.toast, this.fps);
    parent.append(this.root);
  }

  setChip(chip: HudChip | null, base = import.meta.env.BASE_URL): void {
    this.chip.hidden = chip === null;
    if (chip === null) return;
    this.chipIcon.src = `${base}assets/ui/icons/${ICON[chip.team] ?? ICON.village}.svg`;
    this.chipText.textContent = chip.goal;
  }

  setTimer(ticksLeft: number | null): void {
    const text = formatTimer(ticksLeft);
    if (this.timer.textContent !== text) this.timer.textContent = text;
  }

  say(text: string, ms = 2200): void {
    this.toast.textContent = text;
    this.toast.classList.add('on');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('on'), ms);
  }

  setFps(text: string | null): void {
    this.fps.hidden = text === null;
    if (text !== null) this.fps.textContent = text;
  }

  destroy(): void {
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.root.remove();
  }
}
