import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { avatarMemory, avatarOf, resolveHandle } from '../src/sim/Avatars';
import { runInvariants } from '../src/sim/auto/invariants';
import { StatusBit } from '../src/sim/constants';
import { handleVote } from '../src/sim/Meeting';
import { MOOD_ANIM, needsOf } from '../src/sim/npc/needs';
import { simOf } from '../src/sim/RoomSim';
import { figureLossesOf, figuresOf, hurtFigure, namedFigure } from '../src/sim/townsfolk/figures';
import { resetToLobby } from '../src/sim/Win';
import { sceneKey } from '../src/sim/World';
import {
  SEED_SETS,
  type Party,
  advance,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  start,
  toWorld,
} from './npcHelpers';
import { fixSeeds } from './seedHelpers';

/**
 * The ambient townsfolk (round 8, GDD 3.24, docs/round8/townsfolk.md 2 and 4; Session 8E): spawned at the deal
 * from their own stream, avatars under opaque handles that are never seats, a routine by day and home by night, a
 * death only a creature can give, cleared at the next meeting with a count.
 */

const ticksOf = (s: number) => Math.round(s * TICK_RATE);
const figureNotSeat = (party: Party) => runInvariants(party.room).filter((f) => f.name === 'figureNotSeat');

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** 1 human + 3 NPCs in the first world phase, on the test's own steps, by day. */
async function world(seedTownsfolk = false): Promise<Party> {
  const party = await lobbyOf(colyseus, 1);
  if (seedTownsfolk) fixSeeds(party.room, { townsfolk: SEED_SETS.S1 });
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  holdPhase(party, Phase.day, 3600);
  advance(party, 1);
  return party;
}

describe('ambient townsfolk', () => {
  it("spawns the map's count at the deal, the Clerk first, each an avatar under a handle that is no seat's", async () => {
    const party = await world();
    const room = party.room;
    const sim = simOf(room);
    const figures = figuresOf(room);
    expect(figures.size).toBe(balance.townsfolk.count[sim.profile]);
    expect(namedFigure(room, 'clerk')?.kind).toBe('clerk'); // HollowMere's Company Clerk
    const handles = avatarMemory(room);
    for (const [id, f] of figures) {
      expect(room.state.players.has(id)).toBe(false);
      expect(sim.players.has(id)).toBe(false);
      expect(f.handle).not.toBeNull();
      const avatar = avatarOf(room, f.handle as string)!;
      expect(avatar).toBeDefined();
      expect(avatar.lookOf).toBe('villager');
      expect(avatar.seat).toBe('');
      expect(avatar.statusBits & StatusBit.ghost).toBe(0);
      expect(handles.seatOf.has(f.handle as string)).toBe(false);
      expect(sceneKey(f.sceneIdx)).toBe(handles.sceneOf.get(f.handle as string));
      expect(f.home).not.toBeNull();
    }
    expect(figureNotSeat(party)).toEqual([]);
    // The figure ids never reach the state.
    expect(JSON.stringify(room.state.toJSON())).not.toContain('"folk');
  });

  it('draws only from its own townsfolk streams, the same figures for the same words', async () => {
    const a = await world(true);
    const b = await world(true);
    const streams = (party: Party) => [
      ...(party.room.seeds as unknown as { streams: Map<string, unknown> }).streams.keys(),
    ];
    const own = streams(a).filter((k) => k.startsWith('townsfolk'));
    expect(own.length).toBe(figuresOf(a.room).size);
    expect(own.every((k) => k.startsWith('townsfolk:folk'))).toBe(true);
    const shape = (party: Party) =>
      [...figuresOf(party.room).values()].map((f) => [f.kind, f.home, f.stations.map((s) => s.propId)]);
    expect(shape(a)).toEqual(shape(b));
  });

  it('walks its stations by day and shows the walk and the work on its avatar', async () => {
    const party = await world();
    const room = party.room;
    const starts = new Map(
      [...figuresOf(room)].map(([id, f]) => [id, { x: f.x, y: f.y, scene: f.sceneIdx }]),
    );
    const anims = new Set<number>();
    let worked = false;
    let moved = false;
    advance(party, ticksOf(90), () => {
      for (const [id, f] of figuresOf(room)) {
        if (f.act?.kind === 'work' && !f.moving) worked = true;
        const s = starts.get(id)!;
        if (s.scene !== f.sceneIdx || Math.hypot(f.x - s.x, f.y - s.y) > TILE_PX) moved = true;
        const avatar = f.handle === null ? undefined : avatarOf(room, f.handle);
        if (avatar) anims.add(avatar.animId);
      }
    });
    expect(moved).toBe(true);
    expect(worked).toBe(true);
    expect(anims.has(1)).toBe(true); // walk
    expect(anims.has(4)).toBe(true); // interact
    expect(figureNotSeat(party)).toEqual([]);
  });

  it('goes home for the night', async () => {
    const party = await world();
    const room = party.room;
    holdPhase(party, Phase.night, 3600);
    advance(party, ticksOf(120));
    const figures = [...figuresOf(room).values()];
    for (const f of figures) if (f.act) expect(f.act.kind).toBe('home');
    expect(figures.some((f) => f.home !== null && sceneKey(f.sceneIdx) === f.home)).toBe(true);
  });

  it("is never the Knife's prey and never a candidate", async () => {
    const party = await world();
    const room = party.room;
    const human = party.humans[0]!.id;
    const f = [...figuresOf(room).values()][0]!;
    // Stand the human in the figure's scene: the handle still resolves to nobody.
    const p = simOf(room).players.get(human)!;
    p.sceneIdx = f.sceneIdx;
    expect(resolveHandle(room, human, f.handle)).toBeNull();
    holdPhase(party, Phase.meetingDiscussion, 60);
    handleVote(room, human, { targetId: f.id });
    const voter = room.state.players.get(human)!;
    expect(voter.priv.myVote).toBe('');
    expect(voter.hasVoted).toBe(false);
    expect(figureNotSeat(party)).toEqual([]);
  });

  it('dies only to a creature that kills, leaves a body nobody reports, cleared at the next meeting with a count', async () => {
    const party = await world();
    const room = party.room;
    const sim = simOf(room);
    const f = [...figuresOf(room).values()][0]!;
    const sceneId = sceneKey(f.sceneIdx);
    // A creature that never kills leaves it at one hit point however often it bites.
    for (let i = 0; i < 5; i++) expect(hurtFigure(room, f.id, false)).toBe(false);
    expect(f.dead).toBe(false);
    expect(hurtFigure(room, f.id, true)).toBe(true);
    expect(f.dead).toBe(true);
    expect(f.handle).toBeNull();
    const bodyId = `body_${f.id}`;
    const scene = room.state.scenes.get(sceneId)!;
    expect(scene.bodies.get(bodyId)?.of).toBe(f.id);
    expect(sim.reportedBodies.has(bodyId)).toBe(true); // a report finds it "already reported": no meeting
    advance(party, 2);
    expect(figureNotSeat(party)).toEqual([]);
    // The next meeting clears it and counts it for the meeting line; the one after mourns nobody.
    sim.meetingRequests.push({ reason: 'bell', callerId: party.humans[0]!.id });
    advance(party, 1);
    expect(room.state.phase).toBe(Phase.meetingDiscussion);
    expect(scene.bodies.has(bodyId)).toBe(false);
    expect(sim.reportedBodies.has(bodyId)).toBe(false);
    expect(figureLossesOf(room)).toBe(1);
    expect(figureNotSeat(party)).toEqual([]);
    holdPhase(party, Phase.day, 3600);
    advance(party, 1);
    sim.meetingRequests.push({ reason: 'bell', callerId: party.humans[0]!.id });
    advance(party, 1);
    expect(figureLossesOf(room)).toBe(0);
  });

  it('shows its mood idle while it stands still, and nothing of the mood on the wire', async () => {
    const party = await world();
    const room = party.room;
    const f = [...figuresOf(room).values()][0]!;
    needsOf(f.brain).fear = 1;
    f.act = {
      kind: 'idle',
      untilTick: room.state.tick + ticksOf(60),
      station: null,
      goal: { scene: sceneKey(f.sceneIdx), x: f.x, y: f.y },
    };
    advance(party, 2);
    expect(avatarOf(room, f.handle as string)?.animId).toBe(MOOD_ANIM.cower);
    const text = JSON.stringify(room.state.toJSON()).toLowerCase();
    for (const word of ['mood', 'fear', 'scared', 'needs']) expect(text).not.toContain(`"${word}"`);
  });

  it('leaves with the lobby', async () => {
    const party = await world();
    const room = party.room;
    expect(figuresOf(room).size).toBeGreaterThan(0);
    resetToLobby(room);
    advance(party, 2);
    expect(figuresOf(room).size).toBe(0);
    for (const scene of room.state.scenes.values()) expect(scene.avatars.size).toBe(0);
  });
});
