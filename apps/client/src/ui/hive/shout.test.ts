import mitt from 'mitt';
import { describe, expect, it, vi } from 'vitest';
import type { WorldFeed, WorldFeedEvents } from '../../net/world';
import { bindShout } from './shout';

describe('the shout cue (8R)', () => {
  it('toasts the place of a shout, and nothing once unbound', async () => {
    const bus = mitt<WorldFeedEvents>();
    const toasts: [string, string][] = [];
    const off = bindShout({ bus } as unknown as WorldFeed, { toast: (t, k) => toasts.push([t, k]) });
    bus.emit('shout', { sceneId: 'forest', x: 10, y: 20 });
    // The scene name loads with @wdi/content on first use, which a cold import can take a while to do.
    await vi.waitFor(() => expect(toasts).toHaveLength(1), { timeout: 5000 });
    expect(toasts[0]![0]).toMatch(/^Someone is shouting for help in /);
    expect(toasts[0]![0]).not.toContain('{place}');
    expect(toasts[0]![1]).toBe('hazard');
    off();
    bus.emit('shout', { sceneId: 'forest', x: 10, y: 20 });
    await new Promise((r) => setTimeout(r, 100));
    expect(toasts).toHaveLength(1);
  });
});
