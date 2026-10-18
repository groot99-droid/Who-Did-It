import { balance } from '@wdi/content';
import { Phase, type PlayerState, S2C, TICK_RATE, Winner, checkWin } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { logMatch } from '../services/MatchLog';
import { resetCoversForLobby } from './Covers';
import { countRow, factionOf, flowOf, resetFlow, roleIdOf, rolesOf, setPhase } from './Flow';
import { resetNightForLobby } from './NightPowers';
import { simOf } from './RoomSim';
import { isNpcSeat, resetNpcsForLobby } from './Npc';
import { resetOnubForLobby } from './Onub';
import { SCENE_KEYS } from './World';

/** `checkWin` over the living seats (GDD 3.8). Called after a death or an ejection, never on a bare tick. */
export function evaluateWin(room: PartyRoom): 'village' | 'cabal' | null {
  const sim = simOf(room);
  const living: ReturnType<typeof factionOf>[] = [];
  room.state.players.forEach((p: PlayerState, id: string) => {
    if (!sim.players.get(id)?.dead) living.push(factionOf(p));
  });
  return checkWin(living, countRow(room.state.players.size).cabalWin);
}

const SUMMARY = {
  village: 'The Cabal is gone from Hollowmere. The Village wins.',
  cabal: 'The Cabal holds Hollowmere. The Village is lost.',
} as const;

/** Game over: the phase, the winner, the gameOver message and the match-log line (A30). */
export function endMatch(room: PartyRoom, winner: 'village' | 'cabal'): void {
  const state = room.state;
  const sim = simOf(room);
  const flow = flowOf(room);
  state.winner = Winner[winner];
  setPhase(room, Phase.gameOver, balance.phases.gameOverS);
  room.broadcast(S2C.gameOver, { winner: state.winner, roles: rolesOf(room), summary: SUMMARY[winner] });

  const players: Parameters<typeof logMatch>[0]['players'] = [];
  state.players.forEach((p: PlayerState, id: string) => {
    players.push({
      id,
      name: p.name,
      role: roleIdOf(p),
      faction: factionOf(p),
      survived: !sim.players.get(id)?.dead,
      clues: p.priv?.notebook.length ?? 0,
      ...(isNpcSeat(room, id) && { isNpc: true }),
    });
  });
  logMatch({
    code: room.roomId,
    seats: state.players.size,
    durationS: (state.tick - state.startTick) / TICK_RATE,
    winner,
    rounds: state.round,
    kills: flow.kills,
    vanished: flow.vanished,
    players,
    meetings: flow.meetings.map((m) => ({
      round: m.round,
      reason: m.reason,
      votes: m.votes,
      accuracy: m.votes === 0 ? 0 : m.correctVotes / m.votes,
      ...(m.ejectedId !== undefined && {
        ejectedId: m.ejectedId,
        ejectedRole: m.ejectedRole,
        ejectionCorrect: m.ejectionCorrect,
      }),
    })),
  });
}

/**
 * Quick mode (GDD 3.11): the winners table judged on the final cards (`onubWinFlags`, `onubWinners`), then game
 * over with the end-screen facts (`OnubGameOver`) and the match-log line (5B). Stub until 5B lands: game over
 * with nobody winning and no `onub` facts.
 */
export function endOnubMatch(room: PartyRoom): void {
  const state = room.state;
  state.winner = Winner.nobody;
  setPhase(room, Phase.gameOver, balance.phases.gameOverS);
  room.broadcast(S2C.gameOver, { winner: state.winner, roles: {}, summary: '' });
}

/**
 * gameOver -> lobby with the same code and seats: every private and per-match field back to its lobby
 * value, the world emptied, the sim reset. A seat whose player already left stays out (no reconnection
 * during play, M7).
 */
export function resetToLobby(room: PartyRoom): void {
  const state = room.state;
  setPhase(room, Phase.lobby, 0);
  state.phaseEndsTick = 0;
  state.winner = Winner.none;
  state.round = 0;
  state.startTick = 0;
  const m = state.meeting;
  m.reason = m.callerId = m.bodyOf = '';
  m.missing.clear();
  m.board.clear();
  m.suspects.clear();
  m.claims.clear();

  const gone: string[] = [];
  state.players.forEach((p: PlayerState, id: string) => {
    if (!p.connected) {
      gone.push(id);
      return;
    }
    p.alive = false;
    p.ready = false;
    p.hasVoted = false;
    p.traits.height = p.traits.scarf = p.traits.hat = 0;
    const pr = p.presence;
    pr.x = pr.y = pr.z = pr.animId = pr.statusBits = pr.transitUntilTick = 0;
    pr.yaw = 0;
    const priv = p.priv;
    if (!priv) return;
    priv.role.roleId = '';
    priv.role.team = 0;
    priv.inventory.slots.clear();
    priv.notebook.clear();
    priv.tasks.clear();
    priv.cabalMates.clear();
    priv.cooldownEndTick.clear();
    priv.ledger.clear();
    priv.lensCharges = 0;
    priv.myVote = '';
    priv.nightReveal.clear();
    priv.onubLoc = '';
    priv.onubCard = '';
  });
  for (const id of gone) state.players.delete(id);
  if (!state.players.has(state.leaderId)) state.leaderId = state.players.keys().next().value ?? '';

  for (const key of SCENE_KEYS) {
    const scene = state.scenes.get(key);
    if (!scene) continue;
    scene.bodies.clear();
    scene.clues.clear();
    scene.props.clear();
    scene.doors.forEach((door) => {
      door.swingUntilTick = 0;
    });
  }
  room.commands.drain();
  room.lobbyCommands.drain();
  simOf(room).resetForLobby();
  resetOnubForLobby(room);
  resetCoversForLobby(room); // round 5, 5F: looks, avatars, disguises, card Ready (locked call site)
  resetNightForLobby(room); // round 5, 5G: deck, undealt, night powers, poison (locked call site)
  resetNpcsForLobby(room);
  resetFlow(room);
  room.unlock();
}
