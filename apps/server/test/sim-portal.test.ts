import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { balance } from '@wdi/content';
import { ErrorCode, TICK_RATE } from '@wdi/shared';
import { createServer } from '../src/server';
import { avatarMemory } from '../src/sim/Avatars';
import { simOf } from '../src/sim/RoomSim';
import { avatarsHeld, seatAvatarsHeld } from './avatarHelpers';
import { type Match, lastEvent, move, sleep, spawnOf, standAt, startMatch, stateOf } from './simHelpers';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

const front = spawnOf('overworld', 'tavern_front');
const sceneKeys = (m: Match, i: number) => [...stateOf(m.bots[i]!).scenes.keys()];
/** The seats whose avatar the bot's client holds (other than itself): the handles resolved in room memory. */
const seenPresence = (m: Match, i: number) =>
  seatAvatarsHeld(m, m.bots[i]!) // round 10, x5 (A353): the figures of the scene are held too
    .map((a) => avatarMemory(m.room).seatOf.get(a.handle) as string)
    .filter((id) => id !== m.bots[i]!.id);

describe('scene-scoped views on the wire', () => {
  let m: Match;
  beforeEach(async () => {
    m = await startMatch(colyseus, 4);
  });

  it('starts with everyone in the overworld seeing each other and only the overworld scene', () => {
    for (let i = 0; i < 4; i++) {
      expect(sceneKeys(m, i)).toEqual(['overworld']);
      expect(seenPresence(m, i)).toHaveLength(3);
    }
  });

  it('gives an outsider no avatar of the tavern and no tavern SceneState, and vice versa', async () => {
    const [a, b, c, d] = m.bots as [Match['bots'][0], Match['bots'][0], Match['bots'][0], Match['bots'][0]];
    standAt(m, a, front.x, front.y);
    a.room.send('act.enterPortal', { portalId: 'ov.tavern_front' });
    await sleep(1500); // the 0.6 s transit plus a 5 Hz reconcile and a patch

    const sceneA = lastEvent(a, 'sceneEnter');
    expect(sceneA).toMatchObject({ sceneId: 'tavern_bar', spawn: 'front' });
    expect(m.room.state.players.get(a.id)?.priv.sceneId).toBe(1);

    // The bot inside the tavern: its own scene only, nobody from the overworld.
    expect(sceneKeys(m, 0)).toEqual(['tavern_bar']);
    expect(seenPresence(m, 0)).toEqual([]);
    // The bots outside: no tavern SceneState, no avatar of the tavern bot.
    for (const i of [1, 2, 3]) {
      expect(sceneKeys(m, i)).toEqual(['overworld']);
      expect(seenPresence(m, i)).not.toContain(a.id);
      expect(seenPresence(m, i)).toHaveLength(2);
    }

    // A second bot follows: now the two inside see each other and still nobody else.
    standAt(m, b, front.x, front.y);
    b.room.send('act.enterPortal', { portalId: 'ov.tavern_front' });
    await sleep(1500);
    expect(seenPresence(m, 0)).toEqual([b.id]);
    expect(seenPresence(m, 1)).toEqual([a.id]);
    for (const i of [2, 3]) {
      expect(sceneKeys(m, i)).toEqual(['overworld']);
      expect(seenPresence(m, i).sort()).toEqual([c.id, d.id].filter((id) => id !== m.bots[i]!.id).sort());
    }

    // And back out again.
    const barFront = spawnOf('tavern_bar', 'front');
    standAt(m, a, barFront.x, barFront.y);
    a.room.send('act.enterPortal', { portalId: 'tb.front' });
    await sleep(1500);
    expect(sceneKeys(m, 0)).toEqual(['overworld']);
    expect(seenPresence(m, 0).sort()).toEqual([c.id, d.id].sort());
    expect(sceneKeys(m, 1)).toEqual(['tavern_bar']);
    expect(seenPresence(m, 1)).toEqual([]);
  }, 20000);

  it('encodes the traveller avatar to both scenes during the transit, nameplate hidden, then only to the new one', async () => {
    const [a, b] = m.bots as [Match['bots'][0], Match['bots'][0]];
    standAt(m, a, front.x, front.y);
    a.room.send('act.enterPortal', { portalId: 'ov.tavern_front' });
    await sleep(350);
    const seen = avatarsHeld(b).find((x) => avatarMemory(m.room).seatOf.get(x.handle) === a.id)?.avatar;
    expect(seen).toBeDefined();
    expect(seen!.statusBits & 1).toBe(1);
    expect(seen!.transitUntilTick).toBeGreaterThan(m.room.state.tick - 1);
    await sleep(1200);
    expect(avatarsHeld(b).some((x) => avatarMemory(m.room).seatOf.get(x.handle) === a.id)).toBe(false);
  });

  it('swings the door on both sides for the swing time and sends the noise to nearby ears only', async () => {
    const [a, b, c] = m.bots as [Match['bots'][0], Match['bots'][0], Match['bots'][0]];
    standAt(m, a, front.x, front.y);
    standAt(m, b, front.x - 2, front.y); // within the 4-tile door noise
    standAt(m, c, 4, 4); // far away
    await sleep(200);
    const tick0 = m.room.state.tick;
    a.room.send('act.enterPortal', { portalId: 'ov.tavern_front' });
    await sleep(600);
    const swing = stateOf(b).scenes.get('overworld')?.doors.get('ov.tavern_front')?.swingUntilTick ?? 0;
    expect(swing).toBeGreaterThanOrEqual(tick0 + balance.doors.swingS * TICK_RATE);
    const arrival = m.room.state.scenes.get('tavern_bar')?.doors.get('tb.front')?.swingUntilTick ?? 0;
    expect(arrival).toBeGreaterThan(tick0);
    expect(lastEvent(b, 'noise')).toMatchObject({ sceneId: 'overworld', kind: 'door' });
    expect(lastEvent(c, 'noise')).toBeUndefined();
    expect(lastEvent(a, 'noise')).toBeUndefined();
  });

  it('refuses far, unknown, boarded and busy crossings with the protocol error codes', async () => {
    const [a] = m.bots as [Match['bots'][0]];
    const code = () => (lastEvent(a, 'error') as { code: number } | undefined)?.code;

    a.room.send('act.enterPortal', { portalId: 'ov.tavern_front' }); // spawn is on the square: too far
    await sleep(200);
    expect(code()).toBe(ErrorCode.outOfRange);

    a.room.send('act.enterPortal', { portalId: 'nope' });
    await sleep(200);
    expect(code()).toBe(ErrorCode.cannot);

    const manor = spawnOf('overworld', 'manor_front'); // medium profile; a 4-player party is small
    standAt(m, a, manor.x, manor.y);
    a.room.send('act.enterPortal', { portalId: 'ov.manor_front' });
    await sleep(200);
    expect(code()).toBe(ErrorCode.closed);
    expect(m.room.state.players.get(a.id)?.priv.sceneId).toBe(0);
    expect(m.room.state.scenes.get('overworld')?.doors.get('ov.manor_front')?.state).toBe(1);

    standAt(m, a, front.x, front.y);
    a.room.send('act.enterPortal', { portalId: 'ov.tavern_front' });
    a.room.send('act.enterPortal', { portalId: 'ov.tavern_front' }); // second one lands in the transit
    await sleep(300);
    expect(m.room.state.players.get(a.id)?.priv.sceneId).toBe(1);
    expect(code()).toBe(ErrorCode.busy); // the second request landed inside the 0.6 s transit
  });

  it('clears inputs on a crossing so the traveller does not walk on out of the door', async () => {
    const [a] = m.bots as [Match['bots'][0]];
    standAt(m, a, front.x, front.y);
    move(a, 1, 0);
    a.room.send('act.enterPortal', { portalId: 'ov.tavern_front' });
    await sleep(1500);
    const p = simOf(m.room).players.get(a.id)!;
    expect(p.input).toBeNull();
  });

  it('walks the back room: bar -> back and back again', async () => {
    const [a] = m.bots as [Match['bots'][0]];
    standAt(m, a, front.x, front.y);
    a.room.send('act.enterPortal', { portalId: 'ov.tavern_front' });
    await sleep(900);
    const back = spawnOf('tavern_bar', 'back');
    standAt(m, a, back.x, back.y);
    a.room.send('act.enterPortal', { portalId: 'tb.back' });
    await sleep(900);
    expect(lastEvent(a, 'sceneEnter')).toMatchObject({ sceneId: 'tavern_back', spawn: 'door' });
    const door = spawnOf('tavern_back', 'door');
    standAt(m, a, door.x, door.y);
    a.room.send('act.enterPortal', { portalId: 'tk.door' });
    await sleep(900);
    expect(lastEvent(a, 'sceneEnter')).toMatchObject({ sceneId: 'tavern_bar', spawn: 'back' });
  }, 15000);
});
