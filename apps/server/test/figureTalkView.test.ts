import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sceneKey } from '../src/sim/World';
import { figureOfHandle, figuresOf } from '../src/sim/townsfolk/figures';
import { handlesHeld, settle } from './avatarHelpers';
import { bootFlowServer, skipPhase, startParty, until } from './flowHelpers';
import { act, setPhase, teleport } from './killHelpers';
import { sleep } from './simHelpers';

// Round 10 (D9c, after x5/A353): a seat reads a figure's handle off its own view and asks it through the wire.

vi.setConfig({ testTimeout: 40_000 });

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const tileOf = (px: number) => Math.floor(px / TILE_PX);

describe('talk.ask on a handle from the seat’s own view', () => {
  it('hears the Constable answer to the asker alone', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    setPhase(m, Phase.day);
    const constable = [...figuresOf(m.room).values()].find((f) => f.kind === 'constable' && !f.dead)!;
    const [asker, other] = [m.bots[1]!, m.bots[2]!];
    teleport(m, asker, sceneKey(constable.sceneIdx), tileOf(constable.x) + 1, tileOf(constable.y));
    settle(m, asker);
    await sleep(400);
    const handle = constable.handle as string;
    expect(handlesHeld(asker)).toContain(handle); // read off the seat's own view, as the client does
    expect(figureOfHandle(m.room, handle)).toBe(constable);
    // The live Constable patrols: hold it still and stand beside it right before the ask.
    constable.act = {
      kind: 'idle',
      untilTick: m.room.state.tick + 3600,
      station: null,
      goal: { scene: sceneKey(constable.sceneIdx), x: constable.x, y: constable.y },
    };
    teleport(m, asker, sceneKey(constable.sceneIdx), tileOf(constable.x) + 1, tileOf(constable.y));
    await act(asker, 'talk.ask', { targetId: handle, ask: 'time' }, 100);
    const said = () => asker.events.filter((e) => e.type === 'chat.msg');
    const ok = await until(() => said().length > 0, 8000);
    expect(ok).toBe(true);
    expect(said()[0]!.payload).toMatchObject({ channel: 'system' });
    expect(other.events.some((e) => e.type === 'chat.msg')).toBe(false);
  });
});
