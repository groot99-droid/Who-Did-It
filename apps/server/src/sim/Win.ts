import { balance, onubBalance, onubRoles } from '@wdi/content';
import {
  type OnubGameOver,
  Phase,
  type PlayerState,
  S2C,
  TICK_RATE,
  Winner,
  checkWin,
  onubWinFlags,
  onubWinnerName,
  onubWinners,
  pantrySlot,
  seatSlot,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { logMatch } from '../services/MatchLog';
import { resetCoversForLobby } from './Covers';
import { gameOverExtras } from './Deck';
import { countRow, factionOf, flowOf, resetFlow, roleIdOf, rolesOf, setPhase } from './Flow';
import { resetNightForLobby } from './NightPowers';
import { simOf } from './RoomSim';
import { isNpcSeat, resetNpcsForLobby } from './Npc';
import { resetOnubForLobby } from './Onub';
import { finalRoles } from './onub/Acts';
import { onubOf } from './onub/state';
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
  room.broadcast(S2C.gameOver, {
    winner: state.winner,
    roles: rolesOf(room),
    summary: SUMMARY[winner],
    ...gameOverExtras(room),
  });

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
 * over with the end-screen facts (`OnubGameOver`) and the match-log line.
 */
export function endOnubMatch(room: PartyRoom): void {
  const state = room.state;
  const o = onubOf(room);
  if (!o) {
    state.winner = Winner.nobody;
    setPhase(room, Phase.gameOver, balance.phases.gameOverS);
    room.broadcast(S2C.gameOver, { winner: state.winner, roles: {}, summary: '' });
    return;
  }
  const sim = simOf(room);
  const finals = finalRoles(o);
  const info = (roleId: string) => {
    const role = onubRoles.roles[roleId];
    if (!role) throw new Error(`unknown quick-mode role ${roleId}`);
    return { team: role.team, spore: role.spore, onOut: role.onOut };
  };
  const outs = o.dawn?.outs ?? [];
  const ruined = o.prep?.ruined ?? state.onub.ruined;
  const flags = onubWinFlags(outs, finals, ruined, info);
  const { rowId, winnerIds } = onubWinners(flags, finals, info, onubBalance.winners);
  const row = onubBalance.winners.find((r) => r.id === rowId);
  if (!row) throw new Error(`no winners row ${rowId}`);
  const name = onubWinnerName(row, winnerIds);
  state.winner = Winner[name];
  setPhase(room, Phase.gameOver, balance.phases.gameOverS);

  const bySeat = <T>(pick: (id: string, i: number) => T): Record<string, T> =>
    Object.fromEntries(o.seats.map((id, i) => [id, pick(id, i)]));
  const slotRange = (n: number): number[] => Array.from({ length: n }, (_, k) => k);
  const piles: OnubGameOver['piles'] = {};
  for (const [station, pile] of Object.entries(o.prep?.piles ?? {})) piles[station] = { ...pile };
  const onub: OnubGameOver = {
    seats: [...o.seats],
    deck: [...o.deck],
    dealt: bySeat((id) => o.dealt.get(id) ?? ''),
    final: bySeat((id) => finals.get(id) ?? ''),
    dealtLoc: bySeat((id) => o.commits.get(id)?.station ?? ''),
    finalLoc: bySeat((_, i) => o.cards.locs.get(seatSlot(i, 'loc')) ?? ''),
    prepCards: bySeat((id) => o.commits.get(id)?.card ?? ''),
    prepAuto: [...o.prepAuto],
    pantryRolesDealt: [...o.pantryRolesDealt],
    pantryRoles: slotRange(o.pantryRolesDealt.length).map(
      (k) => o.cards.roles.get(pantrySlot('role', k)) ?? '',
    ),
    pantryLocsDealt: [...o.pantryLocsDealt],
    pantryLocs: slotRange(o.pantryLocsDealt.length).map((k) => o.cards.locs.get(pantrySlot('loc', k)) ?? ''),
    piles,
    ruinWeight: o.prep?.ruinWeight ?? state.onub.ruinWeight,
    ruined,
    cloche: o.cloche,
    actLog: o.actLog.map((e) => ({ ...e, slots: [...e.slots] })),
    votes: { ...o.votes },
    outs: [...outs],
    hop: o.dawn?.hop ?? '',
    pantryOut: o.dawn?.pantryOut ?? false,
    rowId,
    winnerIds,
  };
  room.broadcast(S2C.gameOver, {
    winner: state.winner,
    roles: Object.fromEntries(finals),
    summary: row.text,
    onub,
  });

  const flow = flowOf(room);
  const players: Parameters<typeof logMatch>[0]['players'] = [];
  state.players.forEach((p: PlayerState, id: string) => {
    const dealt = o.dealt.get(id) ?? '';
    players.push({
      id,
      name: p.name,
      role: dealt,
      faction: onubRoles.teams[onubRoles.roles[dealt]?.team ?? 'baker'].faction,
      survived: !sim.players.get(id)?.dead,
      clues: 0,
      finalRole: finals.get(id) ?? '',
      ...(isNpcSeat(room, id) && { isNpc: true }),
    });
  });
  logMatch({
    code: room.roomId,
    seats: state.players.size,
    durationS: (state.tick - state.startTick) / TICK_RATE,
    winner: name,
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
      ...(outs[0] !== undefined && { ejectedId: outs[0], outs: [...outs] }),
    })),
    onub: { rowId, winnerIds: [...winnerIds] },
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
