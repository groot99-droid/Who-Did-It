import { describe, expect, it, vi } from 'vitest';
import { connectStudio } from './StudioNet';

describe('connectStudio', () => {
  it('creates the studio room with the build and token and forwards its messages', async () => {
    const handlers = new Map<string, (m: unknown) => void>();
    let onLeave: (code: number) => void = () => undefined;
    const room = {
      onMessage: (t: string, fn: (m: unknown) => void) => void handlers.set(t, fn),
      onLeave: (fn: (code: number) => void) => (onLeave = fn),
      send: vi.fn(),
      leave: vi.fn(),
    };
    const create = vi.fn().mockResolvedValue(room);
    const link = await connectStudio('tok', { build: 'b1', client: { create } as never });
    expect(create).toHaveBeenCalledWith('studio', { build: 'b1', token: 'tok' });
    const seen: string[] = [];
    link.bus.on('snapshot', (s) => seen.push(`snapshot:${s.tick}`));
    link.bus.on('log', (l) => seen.push(`log:${l.length}`));
    link.bus.on('refused', (m) => seen.push(`refused:${m}`));
    link.bus.on('closed', (c) => seen.push(`closed:${c.reason}`));
    handlers.get('studio.snapshot')?.({ tick: 3 });
    handlers.get('studio.log')?.({ lines: ['a', 'b'] });
    handlers.get('error')?.({ code: 422, msg: 'no such scene' });
    onLeave(1000);
    expect(seen).toEqual(['snapshot:3', 'log:2', 'refused:no such scene', 'closed:1000']);
    link.send('studio.noclip', { on: true });
    expect(room.send).toHaveBeenCalledWith('studio.noclip', { on: true });
    link.close();
    expect(room.leave).toHaveBeenCalledWith(true);
  });

  it('rejects when the room refuses the join', async () => {
    const create = vi.fn().mockRejectedValue(new Error('refused'));
    await expect(connectStudio('bad', { client: { create } as never })).rejects.toThrow('refused');
  });
});
