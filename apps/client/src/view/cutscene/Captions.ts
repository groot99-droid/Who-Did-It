import { h } from '../../ui/dom';

export type CaptionStyle = 'narrator' | 'title' | 'whisper';

/**
 * The caption layer of a cutscene (UI.md 14.20): one line at a time on the theme's `wdi-caption`, replaced by the next
 * and faded out when its time is up. The text is set with `textContent`; a caption is never HTML.
 */
export class Captions {
  readonly el: HTMLElement;
  private timer: number | null = null;

  constructor(parent: HTMLElement) {
    this.el = h('div', {
      class: 'wdi-caption',
      'aria-live': 'polite',
      'data-testid': 'cutscene-caption',
      hidden: true,
    });
    parent.append(this.el);
  }

  show(text: string, style: CaptionStyle, durationMs: number): void {
    this.clearTimer();
    this.el.textContent = text;
    this.el.dataset.style = style;
    this.el.hidden = false;
    this.el.classList.remove('wdi-caption--out');
    this.timer = window.setTimeout(() => this.fadeOut(), Math.max(0, durationMs));
  }

  fadeOut(): void {
    this.clearTimer();
    this.el.classList.add('wdi-caption--out');
  }

  clear(): void {
    this.clearTimer();
    this.el.hidden = true;
    this.el.textContent = '';
  }

  destroy(): void {
    this.clearTimer();
    this.el.remove();
  }

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}
