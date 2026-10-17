import { balance, onubBalance, onubRoles } from '@wdi/content';
import { Phase, type PlayerState, S2C, TICK_RATE, Winner, checkWin, onubWinners } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { logMatch } from '../services/MatchLog';
import { countRow, factionOf, flowOf, resetFlow, roleIdOf, rolesOf, setPhase } from './Flow';
import { simOf } from './RoomSim';
import { isNpcSeat, resetNpcsForLobby } from './Npc';
import { DEAD_PREFIX, finalRoleOf, onubOf, resetOnubForLobby } from './Onub';
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
 * Quick mode (GDD 3.11): the winners table judged on the final loaves, then game over with the end-screen
 * facts. `state.winner` is one `Winner`: the Debtor when turned out, else the Village or the Cabal per the
 * row, else nobody ("the storm wins").
 */
export function endOnubMatch(room: PartyRoom): void {
  const o = onubOf(room);
  if (!o) return;
  const state = room.state;
  const sim = simOf(room);
  const flow = flowOf(room);
  const final: Record<string, string> = {};
  state.players.forEach((_p: PlayerState, id: string) => {
    final[id] = finalRoleOf(room, id);
  });
  const faction = (roleId: string) => onubRoles.roles[roleId]?.faction ?? 'village';
  const center = Array.from(
    { length: onubBalance.deadLoaves },
    (_, i) => o.loaves.get(`${DEAD_PREFIX}${i}`) ?? '',
  );
  const { rowId, winnerIds } = onubWinners(
    o.outs,
    new Map(Object.entries(final)),
    center,
    faction,
    onubBalance.winners,
  );
  const row = onubBalance.winners.find((r) => r.id === rowId);
  const debtorOut = o.outs.some((id) => final[id] === 'debtor');
  const winner = debtorOut
    ? 'debtor'
    : winnerIds.length === 0
      ? 'nobody'
      : winnerIds.some((id) => faction(final[id] ?? '') === 'cabal')
        ? 'cabal'
        : 'village';
  state.winner = Winner[winner];
  setPhase(room, Phase.gameOver, balance.phases.gameOverS);
  room.broadcast(S2C.gameOver, {
    winner: state.winner,
    roles: final,
    summary: row?.text ?? '',
    onub: {
      dealt: Object.fromEntries(o.dealt),
      final,
      center,
      swapLog: o.swapLog,
      votes: o.votes,
      outs: o.outs,
      plates: Object.fromEntries(o.owners),
      rowId,
      winnerIds,
    },
  });

  const players: Parameters<typeof logMatch>[0]['players'] = [];
  state.players.forEach((p: PlayerState, id: string) => {
    players.push({
      id,
      name: p.name,
      role: o.dealt.get(id) ?? '',
      finalRole: final[id] ?? '',
      faction: faction(final[id] ?? ''),
      survived: !sim.players.get(id)?.dead,
      clues: 0,
      ...(isNpcSeat(room, id) && { isNpc: true }),
    });
  });
  logMatch({
    code: room.roomId,
    seats: state.players.size,
    durationS: (state.tick - state.startTick) / TICK_RATE,
    winner,
    mode: 'onub',
    rounds: state.round,
    kills: 0,
    vanished: flow.vanished,
    players,
    meetings: flow.meetings.map((m) => ({
      round: m.round,
      reason: m.reason,
      votes: m.votes,
      accuracy: m.votes === 0 ? 0 : m.correctVotes / m.votes,
      outs: o.outs,
      ...(m.ejectedId !== undefined && {
        ejectedId: m.ejectedId,
        ejectedRole: m.ejectedRole,
        ejectionCorrect: m.ejectionCorrect,
      }),
    })),
    onub: { rowId, winnerIds },
  });
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
  m.traces.clear();

  const gone: string[] = [];
  state.players.forEach((p: PlayerState, id: string) => {
    if (!p.connected) {
      gone.push(id);
      return;
    }
    p.alive = false;
    p.ready = false;
    p.hasVoted = false;
    p.sceneId = 0;
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
  resetNpcsForLobby(room);
  resetFlow(room);
  room.unlock();
}
