import mitt from 'mitt';
import { describe, expect, it, vi } from 'vitest';
import type { NetEvents, NetworkService } from './NetworkService';
import { installWorldRouter } from './worldRouter';

type Handler = (payload: unknown) => void;

/** A room that only records `onMessage` handlers so the test can play the server. */
function fakeRoom() {
  const handlers = new Map<string, Handler[]>();
  return {
    sessionId: 'me',
    roomId: 'ABCDE',
    state: { players: new Map(), tick: 0, phase: 0, phaseEndsTick: 0 },
    onMessage: (type: string, fn: Handler) => {
      handlers.set(type, [...(handlers.get(type) ?? []), fn]);
      return () => undefined;
    },
    send: vi.fn(),
    emit: (type: string, payload: unknown) => handlers.get(type)?.forEach((fn) => fn(payload)),
    count: (type: string) => handlers.get(type)?.length ?? 0,
  };
}

function setup() {
  const active = new Set<string>();
  const calls: string[] = [];
  const game = {
    registry: { set: vi.fn() },
    scene: {
      isActive: (k: string) => active.has(k),
      isSleeping: () => false,
      isPaused: () => false,
      start: (k: string) => (active.add(k), calls.push(`start ${k}`)),
      stop: (k: string) => (active.delete(k), calls.push(`stop ${k}`)),
      sleep: (k: string) => (active.delete(k), calls.push(`sleep ${k}`)),
    },
  };
  const room = fakeRoom();
  const bus = mitt<NetEvents>();
  const net = { bus, room, code: 'ABCDE' } as unknown as NetworkService;
  const entered = vi.fn();
  bus.on('sceneEnter', entered);
  installWorldRouter(game as never, net, { mock: false });
  return { active, calls, room, entered, game };
}

const enter = { sceneId: 'overworld', spawn: 'square_0', facing: 's' };
const start = { reason: 'body', callerId: 'a', bodyOf: 'b', missing: [] };

describe('world router', () => {
  it('attaches both feeds from the room and registers sceneEnter once', () => {
    const { room } = setup();
    expect(room.count('sceneEnter')).toBe(1);
    expect(room.count('meetingStart')).toBe(1);
  });

  it('restarts the world on a sceneEnter and re-emits it on the bus', () => {
    const { room, calls, entered } = setup();
    room.emit('sceneEnter', enter);
    expect(calls).toContain('start World');
    expect(entered).toHaveBeenCalledWith(enter);
  });

  it('sleeps the world for a meeting, and only a later sceneEnter brings it back', () => {
    const { room, calls, active } = setup();
    room.emit('sceneEnter', enter);
    room.emit('meetingStart', start);
    expect(calls.slice(-2)).toEqual(['sleep World', 'start Meeting']);
    // Nothing but a sceneEnter ends the meeting: not the vote result, not a phase change.
    room.emit('voteResult', { tally: {} });
    room.emit('phaseChange', { phase: 10, endsTick: 1 });
    expect(active.has('Meeting')).toBe(true);
    room.emit('sceneEnter', enter);
    expect(active.has('Meeting')).toBe(false);
    expect(calls.at(-1)).toBe('start World');
  });

  it('shows game over, then the lobby when the phase returns', () => {
    const { room, calls, active } = setup();
    room.emit('sceneEnter', enter);
    room.emit('meetingStart', start);
    room.emit('gameOver', { winner: 1, roles: {}, summary: '' });
    expect(active.has('Meeting') || active.has('World')).toBe(false);
    expect(active.has('GameOver')).toBe(true);
    room.emit('phaseChange', { phase: 0, endsTick: 0 });
    expect(active.has('GameOver')).toBe(false);
    expect(calls.at(-1)).toBe('start Lobby');
  });
});
