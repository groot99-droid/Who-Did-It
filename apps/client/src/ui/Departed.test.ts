import { beforeEach, describe, expect, it } from 'vitest';
import { WORLD_COPY as C } from './copy/world';
import { mountDeparted } from './Departed';
import { type FakeNode, installFakeDom } from './main/fakeDom';

// Round 10, C4b (GDD 3.33; UI.md 14.51.7): the screen of a Hitman who boarded the Dusk Train.

const asEl = (n: FakeNode) => n as unknown as HTMLElement;

describe('mountDeparted', () => {
  let root: FakeNode;
  beforeEach(() => {
    root = installFakeDom()();
  });

  it('says he has left and won, and that a meeting still calls him', () => {
    mountDeparted(asEl(root));
    const screen = root.byTestId('departed');
    expect(screen?.getAttribute('aria-label')).toBe(C['departed.title']);
    expect(root.byTestId('departed-body')?.content).toBe(C['departed.body']);
    expect(screen?.content).toContain(C['departed.meeting']);
  });

  it('hides for a meeting and leaves with destroy', () => {
    const screen = mountDeparted(asEl(root));
    screen.setHidden(true);
    expect(root.byTestId('departed')?.hidden).toBe(true);
    screen.setHidden(false);
    expect(root.byTestId('departed')?.hidden).toBe(false);
    screen.destroy();
    expect(root.byTestId('departed')).toBeUndefined();
  });
});
