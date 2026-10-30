import { ErrorCode, S2C } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { sendRefusal } from '../src/sim/refusal';

/** A room whose one client records what it is sent. */
function fakeRoom(): { room: PartyRoom; sent: unknown[] } {
  const sent: unknown[] = [];
  const client = { send: (type: string, payload: unknown) => sent.push([type, payload]) };
  const room = {
    clients: { getById: (id: string) => (id === 'a' ? client : undefined) },
  } as unknown as PartyRoom;
  return { room, sent };
}

describe('sendRefusal (round 10, A2)', () => {
  it('sends the reason, its derived code, its args and the log message', () => {
    const { room, sent } = fakeRoom();
    sendRefusal(room, 'a', 'LOBBY_RULE', { rule: 'full' }, { msg: 'party is full' });
    expect(sent).toEqual([
      [
        S2C.error,
        { code: ErrorCode.cannot, msg: 'party is full', reason: 'LOBBY_RULE', args: { rule: 'full' } },
      ],
    ]);
  });

  it('defaults the message to the reason id and takes the wrong-phase code from it', () => {
    const { room, sent } = fakeRoom();
    sendRefusal(room, 'a', 'LOBBY_ONLY');
    expect(sent).toEqual([
      [S2C.error, { code: ErrorCode.wrongPhase, msg: 'LOBBY_ONLY', reason: 'LOBBY_ONLY' }],
    ]);
  });

  it('sends nothing to a client that has gone', () => {
    const { room, sent } = fakeRoom();
    sendRefusal(room, 'gone', 'NFY');
    expect(sent).toEqual([]);
  });
});
