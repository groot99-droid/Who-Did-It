import { balance, onubRoles, roles } from '@wdi/content';
import { ErrorCode, Phase, type PlayerState, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { countRow, flowOf, isMeetingPhase, refuse, setPhase } from './Flow';
import { onubClock, runOnubPhases } from './Conductor';
import { enterImmunity, openMeeting, runMeeting } from './Meeting';
import { isOnub } from './Onub';
import { simOf } from './RoomSim';
import { endMatch, evaluateWin, resetToLobby } from './Win';
import { isWorldPhase } from './World';

/**
 * Phase timers, meeting requests, deaths, checkWin and game over (GDD 3.3, 3.8), run last in the
 * step. The role-card timer stays in `rooms/handlers/lobby.ts` (`runLobbyPhase`); votes and chat
 * arrive through `runLobbyCommands` and land in `Meeting.ts` and `Chat.ts`.
 */
export function runPhases(room: PartyRoom): void {
  runDebugCommands(room);
  const state = room.state;
  const sim = simOf(room);
  if (state.phase < Phase.grace) return; // lobby and the role card are not match time
  if (state.phase === Phase.gameOver) {
    sim.deaths.length = 0;
    sim.meetingRequests.length = 0;
    if (state.tick >= state.phaseEndsTick) resetToLobby(room);
    return;
  }
  if (isOnub(room)) return runOnubPhases(room); // quick mode: dusk, the night, dawn, one meeting (round 4, R)
  if (drainDeaths(room)) return;
  if (isMeetingPhase(state.phase)) {
    sim.meetingRequests.length = 0;
    runMeeting(room);
    return;
  }
  const [request] = sim.meetingRequests;
  sim.meetingRequests.length = 0;
  if (request && isWorldPhase(state.phase)) return openMeeting(room, request);
  if (state.tick >= state.phaseEndsTick) advanceWorldPhase(room);
}

/**
 * Deaths pushed by the kill and by a player who left: a leaver becomes a ghost here, then `checkWin`
 * runs once for the whole batch. Returns true when the match just ended.
 */
function drainDeaths(room: PartyRoom): boolean {
  const sim = simOf(room);
  if (sim.deaths.length === 0) return false;
  const flow = flowOf(room);
  const events = sim.deaths;
  sim.deaths = [];
  for (const event of events) {
    if (event.cause === 'knife') flow.kills++;
    else if (event.cause === 'vanished') {
      flow.vanished++;
      const p = sim.players.get(event.playerId);
      if (p) p.dead = true;
    }
  }
  const winner = evaluateWin(room);
  if (!winner) return false;
  endMatch(room, winner);
  return true;
}

/** grace -> day -> dusk -> night -> day ..., `round` + 1 on every entry into day (GDD 3.3). */
function advanceWorldPhase(room: PartyRoom): void {
  const state = room.state;
  const p = balance.phases;
  switch (state.phase) {
    case Phase.day:
      return setPhase(room, Phase.dusk, p.duskS);
    case Phase.dusk:
      return setPhase(room, Phase.night, p.nightS);
    default: {
      // grace, night, immunity (and the unused dawn) all lead into a new day
      const fromGrace = state.phase === Phase.grace;
      state.round++;
      setPhase(room, Phase.day, p.dayS);
      if (fromGrace) startKnifeCooldowns(room);
    }
  }
}

/** The Knife's first cooldown starts when grace ends; the kill validator reads only `cooldownEndTick`. */
function startKnifeCooldowns(room: PartyRoom): void {
  const until = room.state.tick + countRow(room.state.players.size).killCooldownS * TICK_RATE;
  room.state.players.forEach((player: PlayerState) => {
    const role = roles.roles[player.priv?.role.roleId ?? ''];
    if (role?.abilities.includes('kill')) player.priv?.cooldownEndTick.set('kill', until);
  });
}

// --- WDI_DEBUG helpers, queued by debug.ts and run here, inside the step -------------------------

const CLOCK_PHASES: Record<string, { phase: number; seconds: number }> = {
  grace: { phase: Phase.grace, seconds: balance.phases.graceS },
  day: { phase: Phase.day, seconds: balance.phases.dayS },
  dusk: { phase: Phase.dusk, seconds: balance.phases.duskS },
  night: { phase: Phase.night, seconds: balance.phases.nightS },
  immunity: { phase: Phase.immunity, seconds: balance.phases.immunityS },
};

function runDebugCommands(room: PartyRoom): void {
  const flow = flowOf(room);
  if (flow.debug.length === 0) return;
  for (const cmd of flow.debug.splice(0)) {
    const payload = (cmd.payload ?? {}) as Record<string, unknown>;
    if (cmd.type === 'deal') {
      const fixed = payload.roles;
      // In quick mode the fixed cards are validated against roles.onub.json (GDD 3.11).
      const known = isOnub(room) ? onubRoles.roles : roles.roles;
      const valid =
        fixed !== null &&
        typeof fixed === 'object' &&
        Object.values(fixed).every((r) => typeof r === 'string' && known[r] !== undefined);
      if (valid) flow.fixedDeal = { ...(fixed as Record<string, string>) };
      else refuse(room, cmd.sessionId, ErrorCode.cannot, 'bad deal');
      continue;
    }
    if (cmd.type === 'clock' && onubClock(room, cmd.sessionId, payload)) continue;
    const name = payload.phase;
    const target = typeof name === 'string' ? CLOCK_PHASES[name] : undefined;
    if (name !== undefined && !target) {
      refuse(room, cmd.sessionId, ErrorCode.cannot, 'unknown phase');
      continue;
    }
    if (target) {
      if (!isWorldPhase(room.state.phase)) {
        refuse(room, cmd.sessionId, ErrorCode.wrongPhase, 'not now');
        continue;
      }
      if (target.phase === Phase.immunity) enterImmunity(room);
      else setPhase(room, target.phase, target.seconds);
    }
    if (payload.clearCooldowns === true) clearCooldowns(room);
  }
}

function clearCooldowns(room: PartyRoom): void {
  const sim = simOf(room);
  room.state.players.forEach((player: PlayerState, id: string) => {
    const cooldowns = player.priv?.cooldownEndTick;
    if (cooldowns) for (const key of [...cooldowns.keys()]) cooldowns.set(key, 0);
    const p = sim.players.get(id);
    if (p) p.bandagedUntilTick = 0;
  });
}
