import { h } from '../../ui/dom';
import { ONUB_NIGHT_COPY as C } from '../../ui/copy/onubNight';

/**
 * The sleeper's screen (GDD 3.11, "The Baking Cycle"): darkness and one caption. Every seat shows it whenever
 * its own window is not open, and it says nothing about who is awake. The narrator sits above it in
 * `NightView`, the same on every page.
 */
export class LightsOutView {
  readonly root: HTMLElement;

  constructor() {
    this.root = h(
      'div',
      { class: 'wdi-lights-out', 'data-testid': 'lights-out', role: 'status' },
      h('p', { class: 'wdi-lights-out__caption' }, C['onub.night.caption']),
    );
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
