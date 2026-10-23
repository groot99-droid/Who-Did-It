import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    failConnect: { value: false },
    lastRoom: { current: null as FakeRoom | null },
    listeners: new Map<string, (value: unknown) => void>(),
    changes: [] as Array<() => void>,
  };
});

interface FakeRoom {
  roomId: string;
  sessionId: string;
  reconnectionToken: string;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  onMessage: ReturnType<typeof vi.fn>;
  onLeave: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
}

vi.mock('@colyseus/sdk', () => {
  const makeRoom = (roomId: string): FakeRoom => {
    const room: FakeRoom = {
      roomId,
      sessionId: 'me',
      reconnectionToken: `tok-${roomId}`,
      send: vi.fn(),
      leave: vi.fn(async () => 1000),
      onMessage: vi.fn(),
      onLeave: vi.fn(),
      onError: vi.fn(),
    };
    hoisted.lastRoom.current = room;
    return room;
  };
  class Client {
    async create() {
      if (hoisted.failConnect.value) throw new Error('boom');
      return makeRoom('ABCDE');
    }
    async joinById(id: string) {
      if (hoisted.failConnect.value) throw new Error('not found');
      return makeRoom(id);
    }
    async reconnect(token: string) {
      if (hoisted.failConnect.value) throw new Error('stale');
      return makeRoom(token.replace('tok-', ''));
    }
  }
  const noop = () => () => undefined;
  return {
    Client,
    Callbacks: {
      get: () => ({
        onAdd: noop,
        onRemove: noop,
        // `onChange(instance, handler)` or, for a collection field, `onChange(instance, prop, handler)`.
        onChange: (_instance: object, a: string | (() => void), b?: () => void) => {
          const handler = typeof a === 'function' ? a : b;
          if (handler) hoisted.changes.push(handler);
          return () => undefined;
        },
        listen: (prop: string, handler: (value: unknown) => void) => {
          hoisted.listeners.set(prop, handler);
          return () => undefined;
        },
      }),
    },
  };
});

import { DEFAULT_MAP } from '@wdi/content';
import { ColyseusNetwork, JoinError } from './NetworkService';
import { DEFAULT_MAP_ID, JOIN_FAILED_MESSAGE } from './protocol';
import { reconnectTokens } from './storage';

beforeEach(() => {
  hoisted.store.clear();
  hoisted.failConnect.value = false;
  hoisted.listeners.clear();
  hoisted.changes.length = 0;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => hoisted.store.get(k) ?? null,
    setItem: (k: string, v: string) => void hoisted.store.set(k, v),
    removeItem: (k: string) => void hoisted.store.delete(k),
  });
  vi.stubGlobal('crypto', { randomUUID: () => 'device-uuid-0001' });
});

describe('ColyseusNetwork', () => {
  it('stores the reconnection token keyed by room code after create', async () => {
    const net = new ColyseusNetwork();
    await expect(net.create('Ada')).resolves.toBe('ABCDE');
    expect(reconnectTokens.get('ABCDE')).toBe('tok-ABCDE');
  });

  it('upper-cases the code on join', async () => {
    const net = new ColyseusNetwork();
    await expect(net.join('k7m2p', 'Bo')).resolves.toBe('K7M2P');
  });

  it('maps every failure to the one generic join error', async () => {
    hoisted.failConnect.value = true;
    const net = new ColyseusNetwork();
    await expect(net.join('K7M2P', 'Bo')).rejects.toBeInstanceOf(JoinError);
    await expect(net.create('Bo')).rejects.toThrow(JOIN_FAILED_MESSAGE);
  });

  it('clears the token on consented leave', async () => {
    const net = new ColyseusNetwork();
    await net.create('Ada');
    const left = vi.fn();
    net.bus.on('left', left);
    await net.leave();
    expect(reconnectTokens.get('ABCDE')).toBeNull();
    expect(left).toHaveBeenCalledWith({ consented: true });
  });

  it('resume uses the stored token and drops it when stale', async () => {
    reconnectTokens.set('ABCDE', 'tok-ABCDE');
    const net = new ColyseusNetwork();
    await expect(net.resume('ABCDE')).resolves.toBe(true);

    hoisted.failConnect.value = true;
    await expect(net.resume('ABCDE')).resolves.toBe(false);
    expect(reconnectTokens.get('ABCDE')).toBeNull();
  });

  it('resume is false without a token', async () => {
    await expect(new ColyseusNetwork().resume('ZZZZZ')).resolves.toBe(false);
  });

  it('sends typed messages through the room', async () => {
    const net = new ColyseusNetwork();
    await net.create('Ada');
    net.send('lobby.ready', { ready: true });
    expect(hoisted.lastRoom.current?.send).toHaveBeenCalledWith('lobby.ready', { ready: true });
  });

  it('exposes the room and announces it on the bus, then null when it leaves', async () => {
    const net = new ColyseusNetwork();
    expect(net.room).toBeNull();
    const seen: Array<unknown> = [];
    net.bus.on('room', (r) => seen.push(r));
    await net.create('Ada');
    expect(net.room).toBe(hoisted.lastRoom.current);
    await net.leave();
    expect(net.room).toBeNull();
    expect(seen).toEqual([hoisted.lastRoom.current, null]);
  });

  it('leaves sceneEnter to the world feed', async () => {
    const net = new ColyseusNetwork();
    await net.create('Ada');
    const types = hoisted.lastRoom.current?.onMessage.mock.calls.map((c) => c[0]);
    expect(types).not.toContain('sceneEnter');
    expect(types).toContain('gameOver');
  });

  it('clears the token when gameOver arrives', async () => {
    const net = new ColyseusNetwork();
    await net.create('Ada');
    const room = hoisted.lastRoom.current;
    const handler = room?.onMessage.mock.calls.find((c) => c[0] === 'gameOver')?.[1] as (p: unknown) => void;
    handler({ winner: 0, roles: {}, summary: '' });
    expect(reconnectTokens.get('ABCDE')).toBeNull();
  });

  it('keeps the lobby settings in sync with state.settings', async () => {
    const net = new ColyseusNetwork();
    await net.create('Ada');
    expect(net.snapshot?.settings).toEqual({
      npcDifficulty: 'normal',
      npcSeats: 0,
      map: 'hollowmere',
    });

    const settings = { npcDifficulty: 1, npcSeats: 0, map: 'hollowmere' };
    hoisted.listeners.get('settings')?.(settings);
    Object.assign(settings, {
      npcDifficulty: 2,
      npcSeats: 3,
      map: 'blackpine',
    });
    for (const change of hoisted.changes) change();
    expect(net.snapshot?.settings).toEqual({
      npcDifficulty: 'hard',
      npcSeats: 3,
      map: 'blackpine',
    });
  });

  it('starts on the default map of the content and keeps it when the state has none yet', async () => {
    expect(DEFAULT_MAP_ID).toBe(DEFAULT_MAP);
    const net = new ColyseusNetwork();
    await net.create('Ada');
    hoisted.listeners.get('settings')?.({ npcDifficulty: 1, npcSeats: 0 });
    expect(net.snapshot?.settings.map).toBe(DEFAULT_MAP);
  });

  it('sends the settings and NPC messages without naming a seat', async () => {
    const net = new ColyseusNetwork();
    await net.create('Ada');
    const send = hoisted.lastRoom.current?.send;
    net.setNpcDifficulty('easy');
    net.addNpc();
    net.removeNpc();
    net.setMap('hollowmere');
    expect(send).toHaveBeenNthCalledWith(1, 'lobby.settings', { npcDifficulty: 0 });
    expect(send).toHaveBeenNthCalledWith(2, 'lobby.addNpc', {});
    expect(send).toHaveBeenNthCalledWith(3, 'lobby.removeNpc', {});
    expect(send).toHaveBeenNthCalledWith(4, 'lobby.settings', { map: 'hollowmere' });
  });
});
