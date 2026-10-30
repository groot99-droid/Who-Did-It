import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { avatarMemory, avatarOf } from '../src/sim/Avatars';
import { gameOverExtras } from '../src/sim/Deck';
import { addStack, canAdd, count, strip } from '../src/sim/Inventory';
import { stationOf } from '../src/sim/MapSites';
import { simOf } from '../src/sim/RoomSim';
import { isOnLine } from '../src/sim/Train';
import { evaluateWin } from '../src/sim/Win';
import {
  DERRINGER_ITEM,
  forceArrival,
  hitmanGameOver,
  isDeparted,
  isTurned,
  onDeliveryArrival,
  onDuskArrival,
} from '../src/sim/vendettas/arrival';
import { handleDerringer } from '../src/sim/vendettas/dayWeapon';
import { openContract } from '../src/sim/vendettas/contract';
import { progressOf, vendettaSteps } from '../src/sim/vendettas/progress';
import { avatarsHeld } from './avatarHelpers';
import { bootFlowServer, openMeeting, until, voteAll } from './flowHelpers';
import { eventsOf, setPhase, teleport } from './killHelpers';
import { type Bot, type Match, sleep, startMatch } from './simHelpers';

/** Round 10, C4b (GDD 3.33; followup-4 2.6 b6; seams.md 3 row 21): the Derringer, the Dusk Train, the Contract. */

vi.setConfig({ testTimeout: 60_000 });

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const ROLES = { Bot0: 'killer', Bot1: 'detective', Bot2: 'townsfolk', Bot3: 'townsfolk', Bot4: 'townsfolk' };

/** A day on HollowMere with a turned human: the Hitman's bot, his mark's and a bystander's, all on the platform. */
async function hitmanDay() {
  const m = await startMatch(colyseus, 5, ROLES);
  setPhase(m, Phase.day);
  forceArrival(m.room, m.room.state.round, true);
  onDeliveryArrival(m.room, m.room.state.round);
  const botOf = (id: string) => m.bots.find((b) => b.id === id)!;
  const hitman = m.bots.find((b) => isTurned(m.room, b.id))!;
  const mark = botOf(openContract(m.room, hitman.id)!.target);
  const bystander = m.bots.find((b) => b !== hitman && b !== mark && b.id !== m.bots[0]!.id)!;
  const st = stationOf(m.room)!;
  teleport(m, hitman, 'overworld', st.x, st.y);
  teleport(m, mark, 'overworld', st.x + 2, st.y);
  teleport(m, bystander, 'overworld', st.x, st.y + 2);
  await sleep(150);
  return { m, hitman, mark, bystander };
}

const handle = (m: Match, bot: Bot) => avatarMemory(m.room).handleOf.get(bot.id)!;
const shoot = (m: Match, by: Bot, at: Bot) =>
  handleDerringer(m.room, by.id, { abilityId: 'derringer', targetId: handle(m, at) });
const reasons = (bot: Bot) => eventsOf(bot, 'error').map((e) => (e as { reason?: string }).reason);
const dead = (m: Match, bot: Bot) => simOf(m.room).players.get(bot.id)!.dead;

describe('the Derringer (GDD 3.33)', () => {
  it('is in the turned seat’s own pack, kept at death; nobody else may use it', async () => {
    const { m, hitman, mark, bystander } = await hitmanDay();
    const player = m.room.state.players.get(hitman.id)!;
    expect(count(player, DERRINGER_ITEM)).toBe(1);
    shoot(m, bystander, mark);
    await sleep(150);
    expect(reasons(bystander)).toContain('NOT_YOUR_POWER');
    strip(player); // a death's stripping (`boardLine`) keeps it, as the Knife
    expect(count(player, DERRINGER_ITEM)).toBe(1);
  });

  it('shoots only by day and only a figure drawn as the mark: a death the Train never returns', async () => {
    const { m, hitman, mark, bystander } = await hitmanDay();
    setPhase(m, Phase.dusk);
    shoot(m, hitman, mark);
    setPhase(m, Phase.day);
    shoot(m, hitman, bystander);
    await sleep(150);
    expect(reasons(hitman)).toEqual(['PHASE_CLOSED', 'NO_TARGET']);
    shoot(m, hitman, mark);
    expect(dead(m, mark)).toBe(true);
    expect(isOnLine(m.room, mark.id)).toBe(false); // permanent (R4)
    expect(count(m.room.state.players.get(hitman.id)!, DERRINGER_ITEM)).toBe(0);
    expect(await until(() => vendettaSteps(m.room).some((s) => s.kind === 'vendetta.contract.done'))).toBe(
      true,
    );
    await sleep(150);
    expect(eventsOf(mark, 'killed').at(-1)).toMatchObject({ cause: 'derringer' });
    expect(hitmanGameOver(m.room)?.stage).toBe('killed');
  });

  it('reads the drawn figure: the mark drawn as another is refused; one drawn as the mark dies in its place', async () => {
    const { m, hitman, mark, bystander } = await hitmanDay();
    avatarOf(m.room, handle(m, mark))!.lookOf = bystander.id; // the mark drawn as another
    shoot(m, hitman, mark);
    await sleep(150);
    expect(reasons(hitman)).toEqual(['NO_TARGET']);
    avatarOf(m.room, handle(m, bystander))!.lookOf = mark.id; // drawn with the mark's face
    shoot(m, hitman, bystander);
    expect(dead(m, bystander)).toBe(true);
    expect(dead(m, mark)).toBe(false);
    expect(openContract(m.room, hitman.id)?.target).toBe(mark.id); // the contract stays open
  });
});

describe('the turning and a full pack (6Z, C4b review)', () => {
  it('never turns a seat with no room for the Derringer; one with room gets it', async () => {
    const m = await startMatch(colyseus, 5, ROLES);
    setPhase(m, Phase.day);
    const fill = (id: string) => {
      const p = m.room.state.players.get(id)!;
      for (const item of ['oil', 'crowbar', 'stone'])
        for (let i = 0; i < 64 && canAdd(p, DERRINGER_ITEM, 1); i++) addStack(p, item, 1);
      return !canAdd(p, DERRINGER_ITEM, 1);
    };
    const roomy = m.bots[1]!.id; // the Detective keeps its room
    for (const b of m.bots) if (b.id !== roomy) expect(fill(b.id)).toBe(true);
    forceArrival(m.room, m.room.state.round, true);
    onDeliveryArrival(m.room, m.room.state.round);
    expect(isTurned(m.room, roomy)).toBe(true);
    expect(count(m.room.state.players.get(roomy)!, DERRINGER_ITEM)).toBe(1);
  });
});

describe('the Dusk Train (GDD 3.33, F4 b6)', () => {
  it('boards the Hitman who shot his mark today: he leaves every view, counts for nobody, and wins the Contract', async () => {
    const { m, hitman, mark } = await hitmanDay();
    shoot(m, hitman, mark);
    const before = evaluateWin(m.room);
    onDuskArrival(m.room, m.room.state.round);
    expect(isDeparted(m.room, hitman.id)).toBe(true);
    expect(m.room.state.players.get(hitman.id)!.priv.departed).toBe(true);
    expect(m.room.state.players.get(hitman.id)!.alive).toBe(true);
    expect(simOf(m.room).players.get(hitman.id)!.placed).toBe(false);
    expect(evaluateWin(m.room)).toBe(before);
    expect(hitmanGameOver(m.room)).toEqual({ seatId: hitman.id, day: m.room.state.round, stage: 'boarded' });
    expect(gameOverExtras(m.room).alsoWon).toEqual([hitman.id]);
    const others = m.bots.filter((b) => b !== hitman);
    expect(
      await until(() => others.every((b) => !avatarsHeld(b).some((h) => h.handle === handle(m, hitman)))),
    ).toBe(true);
    expect(avatarsHeld(hitman)).toEqual([]);
  });

  it('leaves a Hitman off the platform, and lapses an unfilled contract at its last day’s Dusk Train', async () => {
    const away = await hitmanDay();
    shoot(away.m, away.hitman, away.mark);
    teleport(away.m, away.hitman, 'tavern_bar', 4, 4);
    onDuskArrival(away.m.room, away.m.room.state.round);
    expect(isDeparted(away.m.room, away.hitman.id)).toBe(false);
    expect(hitmanGameOver(away.m.room)?.stage).toBe('killed');

    const { m, hitman } = await hitmanDay();
    const day = m.room.state.round;
    for (let d = day; d < day + balance.hitman.contractDays - 1; d++) onDuskArrival(m.room, d);
    expect(progressOf(m.room, hitman.id).over).toBe(false);
    onDuskArrival(m.room, day + balance.hitman.contractDays - 1);
    expect(progressOf(m.room, hitman.id).over).toBe(true);
    expect(await until(() => vendettaSteps(m.room).some((s) => s.kind === 'vendetta.contract.lapsed'))).toBe(
      true,
    );
    expect(hitmanGameOver(m.room)?.stage).toBe('arrived');
  });

  it('a departed Hitman is never placed again, holds no scene, and may be ejected as any seat; his win stands', async () => {
    const { m, hitman, mark } = await hitmanDay();
    shoot(m, hitman, mark);
    onDuskArrival(m.room, m.room.state.round);
    await openMeeting(m, 1);
    const unplaced = () => !simOf(m.room).players.get(hitman.id)!.placed;
    expect(unplaced()).toBe(true); // a meeting never places him again
    expect(simOf(m.room).views.get(hitman.id)?.scene ?? null).toBeNull(); // and his view holds no scene
    const living = m.bots.flatMap((b, i) => (dead(m, b) ? [] : [i]));
    await voteAll(m, living, () => hitman.id);
    const result = eventsOf(m.bots[1]!, 'voteResult').at(-1) as {
      tally: Record<string, number>;
      ejectedId?: string;
    };
    expect(result.ejectedId).toBe(hitman.id);
    expect(result.tally[hitman.id]).toBe(living.length); // his own vote among them: a departed seat votes
    expect(hitmanGameOver(m.room)?.stage).toBe('boarded');
    expect(gameOverExtras(m.room).alsoWon).toEqual([hitman.id]);
    expect(unplaced()).toBe(true); // `placeAtSquare` moves only placed seats: the square never sets him down
    const gone = handle(m, hitman);
    expect(m.bots.every((b) => !avatarsHeld(b).some((h) => h.handle === gone))).toBe(true);
  });
});
