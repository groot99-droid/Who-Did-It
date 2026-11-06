import type { ColyseusTestServer } from '@colyseus/testing';
import type { Client } from '@colyseus/core';
import { C2S, ItemStack, Phase } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { isNpcSeat } from '../src/sim/Npc';
import { ANY_SIM, onSim } from '../src/sim/events/bus';
import { simOf } from '../src/sim/RoomSim';
import { clockOf } from '../src/sim/auto/clock';
import { runInvariants } from '../src/sim/auto/invariants';
import { holderOf, switchRole } from '../src/sim/story/handover';
import { enableStory, queueStoryContinue, storyNpcIds, storyOf, resolveStory } from '../src/sim/story/Story';
import { bootAutoServer } from './autoHelpers';
import { advance, lobbyOf, pauseClock } from './npcHelpers';

const ID = 'hollowmere_winter';
let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const create = async (): Promise<PartyRoom> =>
  (await colyseus.createRoom('party', {})) as unknown as PartyRoom;
const roleOf = (room: PartyRoom, id: string) => room.state.players.get(id)?.priv?.role.roleId;

describe('enableStory (GDD 3.34)', () => {
  it('seats one human and the story roster of NPCs under fixed ids, with fixed seeds', async () => {
    const room = await create();
    const story = resolveStory(ID)!;
    const state = enableStory(room, ID, { humanId: 'human1' });
    expect(state.humanId).toBe('human1');
    expect(room.state.leaderId).toBe('human1');
    const ids = [...room.state.players.keys()];
    expect(ids).toEqual(['human1', ...storyNpcIds(story)]);
    expect(ids.filter((id) => !isNpcSeat(room, id))).toEqual(['human1']);
    expect(room.fixedSeeds?.deal).toEqual(story.seedWords.deal);
    await room.disconnect();
  });

  it("deals chapter one's card, raises the title card and pauses until story.continue", async () => {
    const room = await create();
    enableStory(room, ID, { humanId: 'human1' });
    const party = { humans: [], room };
    advance(party, 3);
    expect(room.state.phase).toBe(Phase.roleReveal);
    expect(roleOf(room, 'human1')).toBe('baker');
    expect(storyOf(room)).toMatchObject({ chapterIdx: 0, cardUp: true });
    expect(clockOf(room).paused).toBe(true);
    queueStoryContinue(room, 'someone-else'); // only the human's continue counts
    advance(party, 1);
    expect(storyOf(room)?.cardUp).toBe(true);
    for (let i = 0; i < 10 && storyOf(room)?.cardUp; i++) {
      queueStoryContinue(room, 'human1'); // the title card, then any beat cards the chapter's opening raised
      advance(party, 1);
    }
    expect(storyOf(room)?.cardUp).toBe(false);
    expect(clockOf(room).paused).toBe(false);
    let n = 0;
    while (room.state.phase === Phase.roleReveal && n++ < 700) advance(party, 1);
    expect(room.state.phase).not.toBe(Phase.roleReveal);
    expect(n).toBeLessThan(500); // the continue dismissed the human's card, not the 30 s timer
    expect(runInvariants(room).filter((f) => f.name.startsWith('story'))).toEqual([]);
    await room.disconnect();
  });

  it('replays: the same story deals the same cards to the same ids', async () => {
    const deal = async () => {
      const room = await create();
      enableStory(room, ID, { humanId: 'human1' });
      advance({ humans: [], room }, 2);
      const out = [...room.state.players].map(([id, p]) => `${id}=${p.priv?.role.roleId}`);
      await room.disconnect();
      return out;
    };
    expect(await deal()).toEqual(await deal());
  });
});

describe('the seat handover (GDD 3.34)', () => {
  it("moves the chapter's card to the human, the old card to its holder, and clears the private view", async () => {
    const room = await create();
    enableStory(room, ID, { humanId: 'human1' });
    advance({ humans: [], room }, 3);
    const holder = holderOf(room, 'human1', 'watchman');
    expect(holder).not.toBeNull();
    const human = room.state.players.get('human1')!;
    human.priv.myVote = 'x';
    const name = room.state.players.get(holder!)!.name;
    expect(switchRole(room, 'human1', 'watchman')).toBe(holder);
    expect(roleOf(room, 'human1')).toBe('watchman');
    expect(roleOf(room, holder!)).toBe('baker');
    expect(human.priv.myVote).toBe('');
    expect(human.name).toBe(name); // the character's name travels with its card
    expect([...room.state.players.keys()].filter((id) => !isNpcSeat(room, id))).toEqual(['human1']);
    // The thief card walks as the drifter (a chapter look), whoever holds it.
    switchRole(room, 'human1', 'thief', 'drifter');
    expect(human.look).toBe('drifter');
    expect(roleOf(room, 'human1')).toBe('thief');
    expect(runInvariants(room).filter((f) => f.name.startsWith('story'))).toEqual([]);
    await room.disconnect();
  });
});

describe('story.enter and story.pickup (README 1a)', () => {
  it("emit on the player's seat when its scene changes or its pack gains an item", async () => {
    const room = await create();
    enableStory(room, ID, { humanId: 'human1' });
    const party = { humans: [], room };
    const heard: { kind: string; seat?: string; data?: Record<string, unknown> }[] = [];
    onSim(room, ANY_SIM, (ev) => {
      if (ev.kind === 'story.enter' || ev.kind === 'story.pickup') heard.push(ev);
    });
    for (let i = 0; i < 400 && room.state.phase !== Phase.grace; i++) {
      if (storyOf(room)?.cardUp) queueStoryContinue(room, 'human1');
      advance(party, 1);
    }
    const p = simOf(room).players.get('human1')!;
    advance(party, 2);
    p.sceneIdx = (p.sceneIdx + 1) % 5; // a scene change the next step sees
    const stack = new ItemStack();
    stack.defId = 'bread';
    stack.qty = 1;
    room.state.players.get('human1')!.priv.inventory.slots.push(stack);
    advance(party, 3);
    expect(heard.map((e) => e.kind).sort()).toEqual(['story.enter', 'story.pickup']);
    expect(heard.every((e) => e.seat === 'human1')).toBe(true);
    expect(heard.find((e) => e.kind === 'story.pickup')?.data).toEqual({ item: 'bread' });
    await room.disconnect();
  });
});

describe('story.start (the title screen)', () => {
  it("turns the sender's lobby into the story room and starts it, and ignores an unknown story", async () => {
    const party = await lobbyOf(colyseus, 1);
    const { room } = party;
    pauseClock(room);
    const id = party.humans[0]!.id;
    const client = { sessionId: id } as Client;
    room.commands.push(client, C2S.storyStart, { storyId: 'nope' });
    advance(party, 2);
    expect(storyOf(room)).toBeNull();
    room.commands.push(client, C2S.storyStart, { storyId: ID });
    advance(party, 4);
    expect(storyOf(room)).toMatchObject({ humanId: id, chapterIdx: 0, cardUp: true });
    expect(roleOf(room, id)).toBe('baker');
    expect([...room.state.players.keys()].filter((s) => !isNpcSeat(room, s))).toEqual([id]);
    room.commands.push(client, C2S.storyContinue, {}); // a paused clock still steps for it
    advance(party, 1);
    expect(clockOf(room).paused).toBe(storyOf(room)?.cardUp === true);
    await room.disconnect();
  });
});
