import { balance, maps } from '@wdi/content';
import { BUILD_VERSION, Phase, type PlayerState, S2C, TICK_RATE, Winner, checkWin } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { logMatch } from '../services/MatchLog';
import { talkLog } from '../services/talk/npcNotes';
import { resetCoversForLobby } from './Covers';
import { gameOverExtras } from './Deck';
import { countRow, factionOf, flowOf, resetFlow, roleIdOf, rolesOf, setPhase } from './Flow';
import { resetNightForLobby } from './NightPowers';
import { simOf } from './RoomSim';
import { mapIdOfRoom } from './MapSites';
import { isNpcSeat, resetNpcsForLobby } from './Npc';
import { isPaintTown, paintGameOver, paintWinner } from './paintTown';
import { isOnLine } from './Train';
import { hitmanGameOver, isDeparted } from './vendettas/arrival';
import { SCENE_KEYS } from './World';

/**
 * `checkWin` over the living seats (GDD 3.8). Called after a death or an ejection, never on a bare tick. Round 10
 * (C1): a seat on the line counts as living, since the morning Train brings it back; a wolf by day decides no match.
 */
export function evaluateWin(room: PartyRoom): Outcome | null {
  if (isPaintTown(room)) return paintWinner(room); // round 10, C5: no parity in Paint The Town Red (GDD 3.8)
  const sim = simOf(room);
  const living: ReturnType<typeof factionOf>[] = [];
  room.state.players.forEach((p: PlayerState, id: string) => {
    if (isDeparted(room, id)) return; // round 10, C4b: a Hitman who boarded the Dusk Train counts for nobody
    if (!sim.players.get(id)?.dead || isOnLine(room, id)) living.push(factionOf(p));
  });
  return checkWin(living, countRow(room.state.players.size).cabalWin);
}

/** How a match ends: a faction wins, or, in Paint The Town Red, the two Killers share theirs (round 10, C5). */
export type Outcome = 'village' | 'cabal' | 'paintTown';

/** The end-of-match line, naming the map the room played by its display name (`maps/<id>.json` `name`). */
const summaryOf = (winner: Outcome, town: string): string =>
  winner === 'village'
    ? `The Cabal is gone from ${town}. The Village wins.`
    : winner === 'paintTown'
      ? `${town} is painted red. The Killers win.`
      : `The Cabal holds ${town}. The Village is lost.`;

/** Game over: the phase, the winner, the gameOver message and the match-log line (A30). */
export function endMatch(room: PartyRoom, outcome: Outcome, opts: { unseen?: boolean } = {}): void {
  // Round 10, C5: in Paint The Town Red the Killers win only by painting the town; the end trial closing without
  // it (the Final Night's Cabal verdict) is the Village's (GDD 3.8).
  const winner = isPaintTown(room) && outcome === 'cabal' ? 'village' : outcome;
  const state = room.state;
  const sim = simOf(room);
  const flow = flowOf(room);
  state.winner = Winner[winner];
  setPhase(room, Phase.gameOver, balance.phases.gameOverS);
  room.broadcast(S2C.gameOver, {
    winner: state.winner,
    roles: rolesOf(room),
    summary: summaryOf(winner, maps[mapIdOfRoom(room)].name),
    ...gameOverExtras(room),
    ...(isPaintTown(room) && { paintTown: paintGameOver(room) }),
    ...(hitmanGameOver(room) && { hitman: hitmanGameOver(room) }), // round 10, C4b (seams.md 3 row 21)
    ...(opts.unseen === true && winner === 'cabal' && { unseen: true }), // round 10, B6d (row 35)
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
    winner: winner === 'paintTown' ? 'cabal' : winner, // the log's two factions: the Killers are the Cabal
    rounds: state.round,
    kills: flow.kills,
    vanished: flow.vanished,
    players,
    build: BUILD_VERSION, // round 8, 8L: the replay record (A170)
    seeds: room.seeds.recorded(),
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
    ...talkLog(room), // round 8, 8T: the NPC notes, so a replay never calls the model (GDD 3.25)
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
    priv.inventory.selected = 0; // round 10, A12
    priv.home = ''; // round 10, A7
    priv.asleep = false;
    priv.inBed = 0;
    priv.inBedOf = 0;
    priv.notebook.clear();
    priv.tasks.clear();
    priv.quests.clear(); // round 6 (6H): a new match starts with no quest
    priv.cabalMates.clear();
    priv.cooldownEndTick.clear();
    priv.ledger.clear();
    priv.lensCharges = 0;
    priv.myVote = '';
    priv.paintTown = false; // round 10, C5
    priv.hitman = false; // round 10, C4
    priv.departed = false;
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
  resetCoversForLobby(room); // round 5, 5F: looks, avatars, disguises, card Ready (locked call site)
  resetNightForLobby(room); // round 5, 5G: deck, undealt, night powers, poison (locked call site)
  resetNpcsForLobby(room);
  resetFlow(room);
  room.unlock();
}
