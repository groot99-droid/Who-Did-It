import { describe, expect, it, vi } from 'vitest';
import { ADMIN_TOKEN_KEY, captureToken, clearToken, connectAdmin, loginUrl, tokenFromHash } from './AdminNet';

const memory = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('token capture', () => {
  it('reads the token of the callback hash', () => {
    expect(tokenFromHash('#/admin?token=abc.def')).toBe('abc.def');
    expect(tokenFromHash('#/admin')).toBeNull();
    expect(tokenFromHash('#/admin?token=')).toBeNull();
    expect(tokenFromHash('#/join/ABCDE?token=x')).toBeNull();
  });

  it('moves it to session storage and scrubs the hash', () => {
    const store = memory();
    const scrub = vi.fn();
    expect(captureToken('#/admin?token=t1', store, scrub)).toBe('t1');
    expect(store.m.get(ADMIN_TOKEN_KEY)).toBe('t1');
    expect(scrub).toHaveBeenCalledOnce();
  });

  it('falls back to the stored token, and survives a blocked store', () => {
    const store = memory();
    store.m.set(ADMIN_TOKEN_KEY, 'old');
    const scrub = vi.fn();
    expect(captureToken('#/admin', store, scrub)).toBe('old');
    expect(scrub).not.toHaveBeenCalled();
    clearToken(store);
    expect(captureToken('#/admin', store, scrub)).toBeNull();
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(captureToken('#/admin?token=t2', blocked, scrub)).toBe('t2');
    expect(captureToken('#/admin', blocked, scrub)).toBeNull();
    expect(() => clearToken(blocked)).not.toThrow();
  });

  it('points the button at the server’s login route', () => {
    expect(loginUrl('https://srv.example')).toBe('https://srv.example/auth/github/login');
  });
});

describe('connectAdmin', () => {
  it('creates the admin room with the build and token and forwards the three messages', async () => {
    const handlers = new Map<string, (m: unknown) => void>();
    let onLeave: (code: number) => void = () => undefined;
    const room = {
      onMessage: (t: string, fn: (m: unknown) => void) => void handlers.set(t, fn),
      onLeave: (fn: (code: number) => void) => (onLeave = fn),
      send: vi.fn(),
      leave: vi.fn(),
    };
    const create = vi.fn().mockResolvedValue(room);
    const link = await connectAdmin('tok', { build: 'b1', client: { create } as never });
    expect(create).toHaveBeenCalledWith('admin', { build: 'b1', token: 'tok' });
    const seen: string[] = [];
    link.bus.on('snapshot', () => seen.push('snapshot'));
    link.bus.on('event', (e) => seen.push(`event:${e.length}`));
    link.bus.on('invariant', (f) => seen.push(`inv:${f.name}`));
    link.bus.on('closed', () => seen.push('closed'));
    handlers.get('admin.snapshot')?.({ tick: 1 });
    handlers.get('admin.event')?.({ events: [{ tick: 1, kind: 'kill' }] });
    handlers.get('admin.invariant')?.({ name: 'n', tick: 1, detail: '' });
    onLeave(1000);
    expect(seen).toEqual(['snapshot', 'event:1', 'inv:n', 'closed']);
    link.send('admin.clock', { scale: 5 });
    expect(room.send).toHaveBeenCalledWith('admin.clock', { scale: 5 });
  });

  it('rejects when the room refuses the join', async () => {
    const create = vi.fn().mockRejectedValue(new Error('refused'));
    await expect(connectAdmin('bad', { client: { create } as never })).rejects.toThrow();
  });
});
