import type { ColyseusTestServer } from '@colyseus/testing';
import { Body, C2S, Clue, NotebookEntry, Phase, Winner } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { matchLog } from '../src/services/MatchLog';
import { simOf } from '../src/sim/RoomSim';
import {
  bootFlowServer,
  events,
  idOf,
  murder,
  openMeeting,
  seat,
  sim,
  skipPhase,
  startParty,
  until,
  voteAll,
} from './flowHelpers';
import { type Match, sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootFlowServer());
  matchLog.write = () => undefined; // keep the suite's stdout quiet
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const gameOver = (m: Match) => events(m.bots[1]!, 'gameOver').at(-1);
const everyone = (n: number) => Array.from({ length: n }, (_, i) => i);

describe.each([4, 5, 6])('win conditions at %i seats', (n) => {
  it('Village wins when the vote ejects the last Cabal, but only after the reveal has run', async () => {
    const m = await startParty(colyseus, n);
    await skipPhase(m);
    await openMeeting(m, 1);
    await voteAll(
      m,
      everyone(n),
      (i) => idOf(m, i === 0 ? 1 : 0), // the Killer votes away from itself
    );
    expect(events(m.bots[1]!, 'voteResult').at(-1)).toMatchObject({ ejectedId: idOf(m, 0), role: 'killer' });
    await sleep(800); // well inside revealS: the stamp and the role line must have time to show
    expect(m.room.state.phase).toBe(Phase.reveal);
    expect(gameOver(m)).toBeUndefined();
    await skipPhase(m);
    expect(await until(() => gameOver(m) !== undefined)).toBe(true);
    expect(m.room.state.phase).toBe(Phase.gameOver);
    expect(m.room.state.winner).toBe(Winner.village);
    const payload = gameOver(m)!;
    expect(payload.winner).toBe(Winner.village);
    expect((payload.roles as Record<string, string>)[idOf(m, 0)]).toBe('killer');
    expect(typeof payload.summary).toBe('string');
    // No sceneEnter after the reveal: the client goes straight to the end screen.
    const enters = events(m.bots[1]!, 'sceneEnter').length;
    await sleep(200);
    expect(events(m.bots[1]!, 'sceneEnter')).toHaveLength(enters);
  });

  it('Cabal wins on the kill that leaves the Village at its limit, with no meeting needed', async () => {
    const m = await startParty(colyseus, n);
    await skipPhase(m);
    for (let victim = n - 1; victim > 2; victim--) {
      murder(m, victim);
      await sleep(150);
      expect(m.room.state.phase).toBe(Phase.day);
    }
    expect(gameOver(m)).toBeUndefined();
    murder(m, 2); // leaves Detective alone against the Killer
    expect(await until(() => m.room.state.phase === Phase.gameOver)).toBe(true);
    expect(m.room.state.winner).toBe(Winner.cabal);
    await sleep(150);
    expect(gameOver(m)).toMatchObject({ winner: Winner.cabal });
  });
});

describe('checkWin timing', () => {
  it('an ejection that leaves the Village at its limit wins for the Cabal when the reveal ends', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    murder(m, 3);
    await openMeeting(m, 1, 3);
    await voteAll(m, [0, 1, 2], (i) => idOf(m, i === 2 ? 1 : 2));
    await sleep(500);
    expect(m.room.state.phase).toBe(Phase.reveal);
    expect(gameOver(m)).toBeUndefined();
    await skipPhase(m);
    expect(await until(() => gameOver(m) !== undefined)).toBe(true);
    expect(m.room.state.winner).toBe(Winner.cabal);
  });

  it('never runs on a bare tick: with no death and no ejection nothing ends the match', async () => {
    const m = await startParty(colyseus, 4);
    for (let i = 0; i < 6; i++) await skipPhase(m);
    expect(m.room.state.phase).not.toBe(Phase.gameOver);
  });

  it('a player who leaves during play becomes a ghost with no body, and the win check runs', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await m.bots[3]!.room.leave();
    expect(await until(() => sim(m, 2) !== undefined && simOf(m.room).players.size === 4)).toBe(true);
    expect(await until(() => sim(m, 3).dead)).toBe(true);
    expect(seat(m, 3).connected).toBe(false);
    expect(m.room.state.phase).toBe(Phase.day); // 3 seats left: the Village still has two
    await m.bots[2]!.room.leave();
    expect(await until(() => m.room.state.phase === Phase.gameOver)).toBe(true);
    expect(m.room.state.winner).toBe(Winner.cabal);
  });
});

describe('game over', () => {
  it('writes one match-log JSON line with players, duration, winner, kills, meetings and clues', async () => {
    const lines: string[] = [];
    const original = matchLog.write;
    matchLog.write = (line) => void lines.push(line);
    try {
      const m = await startParty(colyseus, 5);
      await skipPhase(m);
      const entry = new NotebookEntry();
      entry.id = 'entry_1';
      seat(m, 2).priv!.notebook.push(entry);
      murder(m, 4);
      await openMeeting(m, 1, 4);
      await voteAll(m, [0, 1, 2, 3], (i) => idOf(m, i === 0 ? 1 : 0));
      await skipPhase(m);
      await until(() => m.room.state.phase === Phase.gameOver);
      expect(lines).toHaveLength(1);
      const log = JSON.parse(lines[0]!);
      expect(log).toMatchObject({
        event: 'match',
        seats: 5,
        winner: 'village',
        kills: 1,
        vanished: 0,
        rounds: 1,
        meetings: [
          {
            round: 1,
            reason: 'body',
            votes: 4,
            accuracy: 0.75,
            ejectedId: idOf(m, 0),
            ejectedRole: 'killer',
            ejectionCorrect: true,
          },
        ],
      });
      expect(log.durationS).toBeGreaterThan(0);
      expect(log.players).toHaveLength(5);
      const byId = new Map(log.players.map((p: { id: string }) => [p.id, p]));
      expect(byId.get(idOf(m, 2))).toMatchObject({
        role: 'doctor',
        faction: 'village',
        survived: true,
        clues: 1,
      });
      expect(byId.get(idOf(m, 4))).toMatchObject({ survived: false, clues: 0 });
      expect(byId.get(idOf(m, 0))).toMatchObject({ role: 'killer', faction: 'cabal', survived: false });
    } finally {
      matchLog.write = original;
    }
  });

  it('returns to the lobby after gameOverS: same seats, private state cleared, room unlocked', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    murder(m, 3);
    const scene = m.room.state.scenes.get('overworld')!;
    const body = new Body();
    body.id = 'body_x';
    scene.bodies.set(body.id, body);
    const clue = new Clue();
    clue.id = 'clue_overworld_1';
    scene.clues.set(clue.id, clue);
    await openMeeting(m, 1, 3);
    await voteAll(m, [0, 1, 2], (i) => idOf(m, i === 0 ? 1 : 0));
    await skipPhase(m);
    await until(() => m.room.state.phase === Phase.gameOver);
    const names = [...m.room.state.players.values()].map((p) => p.name);
    await skipPhase(m);
    expect(await until(() => m.room.state.phase === Phase.lobby)).toBe(true);

    const s = m.room.state;
    expect([...s.players.values()].map((p) => p.name)).toEqual(names);
    expect([s.winner, s.round, s.startTick, s.meeting.phase, s.meeting.reason]).toEqual([0, 0, 0, 0, '']);
    for (const i of [0, 1, 2, 3]) {
      const p = seat(m, i);
      expect([p.alive, p.ready, p.hasVoted, p.sceneId, p.traits.height, p.traits.hat]).toEqual([
        false,
        false,
        false,
        0,
        0,
        0,
      ]);
      expect(p.connected).toBe(true);
      expect([p.priv!.role.roleId, p.priv!.myVote]).toEqual(['', '']);
      expect(p.priv!.inventory.slots).toHaveLength(0);
      expect(p.priv!.cooldownEndTick.size).toBe(0);
      expect(sim(m, i).dead).toBe(false);
      expect(sim(m, i).placed).toBe(false);
    }
    expect(scene.bodies.size + scene.clues.size).toBe(0);
    expect(m.room.locked).toBe(false);
    // The same room can play again.
    m.bots[0]!.room.send(C2S.lobbyStart, {});
    expect(await until(() => s.phase === Phase.roleReveal)).toBe(true);
  });
});
