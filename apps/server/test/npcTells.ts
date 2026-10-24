import { abilities, balance } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { npcMemory } from '../src/sim/npc/memory';
import { litAtNight, phaseClassOf } from '../src/sim/npc/routine';
import { simOf } from '../src/sim/RoomSim';
import { sceneKey } from '../src/sim/World';
import { type Party, advance } from './npcHelpers';

// The NPC-tell detector (npc.md part 2, sections 1 and 7): everything an observer of a recorded match could use to
// tell an NPC seat from a human one. Pure apart from `recordMatch`.

export interface SeatSample {
  scene: number;
  x: number;
  y: number;
  yaw: number;
  animId: number;
  hold: { action: string; targetId: string } | null;
  dead: boolean;
  placed: boolean;
  busy: boolean;
  /** The brain's mode for an NPC seat, '' for a human. */
  mode: string;
  ready: boolean;
  voted: boolean;
}

/** A body on one tick: `by` is the seat whose strike made it ('' for none), `open` when neither reported nor hidden. */
export interface BodySample {
  id: string;
  scene: number;
  x: number;
  y: number;
  by: string;
  open: boolean;
}

export interface TickSample {
  tick: number;
  phase: number;
  phaseEndsTick: number;
  seats: Map<string, SeatSample>;
  bodies: BodySample[];
}

export interface Recording {
  ticks: TickSample[];
  npcIds: ReadonlySet<string>;
  /** The tick each NPC's card-ready turned true. */
  cardReadyTicks: Map<string, number>;
  /** The tick the role card opened. */
  cardOpenTick: number;
}

export interface Tell {
  code: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9' | 'T10' | 'T11' | 'T12';
  seat: string;
  tick: number;
  detail: string;
}

const WORLD_PHASES: readonly number[] = [
  Phase.grace,
  Phase.day,
  Phase.dusk,
  Phase.night,
  Phase.immunity,
  Phase.finalNight,
];
const isWorld = (phase: number): boolean => WORLD_PHASES.includes(phase);
const isMeeting = (phase: number): boolean =>
  phase === Phase.meetingDiscussion || phase === Phase.meetingVote;

/**
 * Records every tick from now to `lobbyExtraS` after the return to the lobby, through game over; throws past
 * `maxTicks`. `onTick` runs after each step, for white-box scenario pokes. Start the party on the role card (`standardParty(..., true)`).
 */
export function recordMatch(
  party: Party,
  opts: { maxTicks: number; lobbyExtraS: number; onTick?: (tick: number) => void },
): Recording {
  const room = party.room;
  const sim = simOf(room);
  const mem = npcMemory(room);
  const killers = new Map<string, string>();
  const pushDeaths = sim.deaths.push.bind(sim.deaths);
  const wrap = (arr: typeof sim.deaths) => {
    const push = arr.push.bind(arr);
    arr.push = (...items) => {
      for (const d of items) if (d.killerId) killers.set(`body_${d.playerId}`, d.killerId);
      return push(...items);
    };
    return arr;
  };
  void pushDeaths;
  let deaths = wrap(sim.deaths);
  Object.defineProperty(sim, 'deaths', {
    get: () => deaths,
    set: (v: typeof deaths) => (deaths = wrap(v)),
    configurable: true,
  });

  const rec: Recording = {
    ticks: [],
    npcIds: new Set(mem.order),
    cardReadyTicks: new Map(),
    cardOpenTick: room.state.phaseEndsTick - balance.phases.roleRevealS * TICK_RATE,
  };
  let left = false;
  let lobbyAt = -1;
  for (let i = 0; i < opts.maxTicks; i++) {
    advance(party, 1);
    opts.onTick?.(room.state.tick);
    const state = room.state;
    const seats = new Map<string, SeatSample>();
    for (const [id, player] of state.players) {
      const p = sim.players.get(id);
      if (!p) continue;
      seats.set(id, {
        scene: p.sceneIdx,
        x: p.x,
        y: p.y,
        yaw: player.presence.yaw,
        animId: player.presence.animId,
        hold: p.hold ? { action: p.hold.action, targetId: p.hold.targetId } : null,
        dead: p.dead,
        placed: p.placed,
        busy: state.tick < p.busyUntilTick,
        mode: rec.npcIds.has(id) ? (mem.brains.get(id)?.mode ?? 'routine') : '',
        ready: player.ready,
        voted: player.hasVoted,
      });
      if (
        rec.npcIds.has(id) &&
        state.phase === Phase.roleReveal &&
        player.ready &&
        !rec.cardReadyTicks.has(id)
      ) {
        rec.cardReadyTicks.set(id, state.tick);
      }
    }
    const bodies: BodySample[] = [];
    state.scenes.forEach((scene, key) => {
      scene.bodies.forEach((b) => {
        const idx = [...state.scenes.keys()].indexOf(key);
        bodies.push({
          id: b.id,
          scene: idx,
          x: b.x,
          y: b.y,
          by: killers.get(b.id) ?? '',
          open: !b.hidden && !sim.reportedBodies.has(b.id),
        });
      });
    });
    rec.ticks.push({
      tick: state.tick,
      phase: state.phase,
      phaseEndsTick: state.phaseEndsTick,
      seats,
      bodies,
    });
    if (state.phase !== Phase.lobby) left = true;
    if (left && state.phase === Phase.lobby) {
      if (lobbyAt < 0) lobbyAt = state.tick;
      if (state.tick - lobbyAt >= opts.lobbyExtraS * TICK_RATE) return rec;
    }
  }
  throw new Error(`the match did not end within ${opts.maxTicks} ticks`);
}

const idleMin = (): number => Math.round(balance.npc.routine.idleS.min * TICK_RATE);

/** One NPC's rows, in tick order, with what the checks need derived once. */
interface Row {
  tick: number;
  phase: number;
  s: SeatSample;
  moved: boolean;
  sceneChanged: boolean;
  /** Living, placed and not in transit. */
  live: boolean;
  /** A reaction or a transit: left out of the stillness and moving-share checks. */
  exempt: boolean;
}

function rowsOf(rec: Recording, id: string): Row[] {
  const out: Row[] = [];
  let prev: SeatSample | undefined;
  for (const t of rec.ticks) {
    const s = t.seats.get(id);
    if (!s) {
      prev = undefined;
      continue;
    }
    const sceneChanged = !!prev && prev.scene !== s.scene;
    const moved = !!prev && prev.placed && !sceneChanged && (prev.x !== s.x || prev.y !== s.y);
    const live = !s.dead && s.placed && !s.busy;
    out.push({
      tick: t.tick,
      phase: t.phase,
      s,
      moved,
      sceneChanged,
      live,
      exempt: s.mode === 'react' || s.busy,
    });
    prev = s;
  }
  return out;
}

const dayClass = (phase: number): boolean => phaseClassOf(phase) === 'day';
const nightClass = (phase: number): boolean => phaseClassOf(phase) === 'night';

/** Every NPC tell of npc.md part 2, section 7, found in `rec`; empty means none. */
export function findTells(rec: Recording): Tell[] {
  const tells: Tell[] = [];
  const tell = (code: Tell['code'], seat: string, tick: number, detail: string) =>
    tells.push({ code, seat, tick, detail });
  const reachPx = (abilities.abilities.report?.rangeTiles ?? 1.5) * TILE_PX;
  const ids = [...rec.npcIds];
  const all = new Map(ids.map((id) => [id, rowsOf(rec, id)]));

  for (const id of ids) {
    const rows = all.get(id)!;

    // T1: walking in place.
    let inPlace = 0;
    for (const r of rows) {
      inPlace =
        r.live && isWorld(r.phase) && r.s.animId === 1 && !r.moved && !r.sceneChanged ? inPlace + 1 : 0;
      if (inPlace === 3) tell('T1', id, r.tick, 'walk animation without moving');
    }

    // T2 and T3: never still, always moving or frozen, over the day class.
    let seg: Row[] = [];
    let stillRun = 0;
    let lastRun = -1;
    let segStart = 0;
    let stretchLive = 0;
    let stretchMoved = 0;
    // T3 reads the share over all the day-class ticks of the match (GDD 3.12 "Targets": about a third of a day;
    // one long visit alone would put a seat under 10 % in a single 75 s round).
    const endStretch = (at: number) => {
      if (stretchLive >= 1000) {
        const share = stretchMoved / stretchLive;
        if (share > 0.6 || share < 0.1)
          tell('T3', id, at, `moving share ${share.toFixed(2)} over ${stretchLive} ticks`);
      }
      stretchLive = 0;
      stretchMoved = 0;
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (!dayClass(r.phase)) {
        seg = [];
        stillRun = 0;
        lastRun = -1;
        segStart = i + 1;
        continue;
      }
      if (!r.live || r.exempt) {
        seg = [];
        stillRun = 0;
        lastRun = -1;
        segStart = i + 1;
        continue;
      }
      seg.push(r);
      stretchLive++;
      if (r.moved) stretchMoved++;
      stillRun = r.moved || r.sceneChanged ? 0 : stillRun + 1;
      if (stillRun >= idleMin()) lastRun = i;
      if (i - segStart + 1 >= 400 && !(lastRun >= i - 399 + idleMin() - 1)) {
        tell('T2', id, r.tick, `no still run of ${idleMin()} ticks in 400`);
        segStart = i + 1;
        lastRun = -1;
        stillRun = 0;
      }
    }
    endStretch(rows.at(-1)?.tick ?? 0);

    // T4 and T5: an animation without a hold, a hold a human could not make there.
    // T6: leaving too soon.
    let entered = rows[0]?.tick ?? 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]!;
      const before = rows[i - 1]!;
      if (!isWorld(before.phase)) entered = r.tick;
      if (r.s.hold) {
        const sceneId = sceneKey(r.s.scene);
        const ok =
          r.s.hold.action === 'collect' &&
          (r.s.hold.targetId === 'clue_teaching' || r.s.hold.targetId.startsWith(`clue_${sceneId}_`));
        if (!ok) tell('T5', id, r.tick, `${r.s.hold.action} ${r.s.hold.targetId}`);
      }
      if (r.sceneChanged) {
        // A crossing on the tick the brain turns home is the trip home, not leaving too soon (round 8, 6Z for 8J).
        const routine = before.s.mode === 'routine' && r.s.mode === 'routine';
        if (routine && before.live && r.tick - entered < 600 && isWorld(r.phase)) {
          tell('T6', id, r.tick, `crossed ${r.tick - entered} ticks after entering`);
        }
        entered = r.tick;
      }
    }

    // T7: out in the dark.
    let nightStart = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (nightClass(r.phase) && !nightClass(rows[i - 1]?.phase ?? -1)) nightStart = r.tick;
      if (!nightClass(r.phase) || r.s.dead || !r.s.placed || r.s.mode === 'react') continue;
      if (litAtNight(sceneKey(r.s.scene))) continue;
      let since = r.tick;
      for (let j = i; j >= 0 && rows[j]!.s.scene === r.s.scene && nightClass(rows[j]!.phase); j--)
        since = rows[j]!.tick;
      const limit = (balance.npc.night.leaveDelayS.max + 45) * TICK_RATE;
      if (r.tick - Math.max(nightStart, since) > limit) {
        tell(
          'T7',
          id,
          r.tick,
          `${sceneKey(r.s.scene)} unlit for ${r.tick - Math.max(nightStart, since)} ticks`,
        );
        break;
      }
    }

    // T11: ignoring a body.
    let watch = 0;
    let startD = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const t = rec.ticks[i];
      if (!t || !isWorld(r.phase) || !r.live || (r.s.mode !== 'routine' && r.s.mode !== 'home')) {
        watch = 0;
        continue;
      }
      const sight = (r.phase === Phase.night ? balance.vision.nightTiles : balance.vision.dayTiles) * TILE_PX;
      let nearest = Infinity;
      for (const b of t.bodies) {
        if (!b.open || b.by === id || b.scene !== r.s.scene) continue;
        nearest = Math.min(nearest, Math.hypot(b.x - r.s.x, b.y - r.s.y));
      }
      if (nearest > sight) {
        watch = 0;
        continue;
      }
      if (watch === 0) startD = nearest;
      if (++watch === 40) {
        if (nearest >= startD && nearest > reachPx)
          tell('T11', id, r.tick, `body ${nearest.toFixed(0)} px away ignored`);
        watch = 0;
      }
    }
  }

  // T4 is about every seat, humans included.
  const seatIds = new Set<string>();
  for (const t of rec.ticks) for (const id of t.seats.keys()) seatIds.add(id);
  for (const id of seatIds) {
    let a: SeatSample | undefined;
    let prevPhase = -1;
    for (const t of rec.ticks) {
      const s = t.seats.get(id);
      if (!s) continue;
      if (a && isWorld(t.phase) && isWorld(prevPhase)) {
        const unheld = s.hold === null && a.hold === null;
        const held = s.hold !== null && a.hold !== null;
        if (s.animId === 4 && unheld) tell('T4', id, t.tick, 'interact without a hold');
        if ((s.animId === 0 || s.animId === 1) && held) tell('T4', id, t.tick, 'hold without interact');
      }
      a = s;
      prevPhase = t.phase;
    }
  }

  // T8: voting on a clock. T9: ready on a clock.
  let open = -1;
  let w = 0;
  const seen = new Set<string>();
  for (let i = 0; i < rec.ticks.length; i++) {
    const t = rec.ticks[i]!;
    const was = rec.ticks[i - 1];
    if (t.phase === Phase.meetingDiscussion && was?.phase !== Phase.meetingDiscussion) {
      open = t.tick;
      w = t.phaseEndsTick - t.tick + balance.phases.voteS * TICK_RATE;
      seen.clear();
    }
    if (open >= 0 && isMeeting(t.phase)) {
      for (const id of ids) {
        const s = t.seats.get(id);
        if (!s || s.dead || !s.voted || seen.has(id)) continue;
        seen.add(id);
        const dt = t.tick - open;
        const f = balance.npc.vote.windowFrac;
        if (dt < Math.floor(f.min * w) - 1 || dt > Math.ceil(f.max * w) + 1) {
          tell('T8', id, t.tick, `voted ${dt} ticks into a window of ${w}`);
        }
      }
    }
  }
  const ready = balance.npc.ready.delayS;
  for (const id of ids) {
    const at = rec.cardReadyTicks.get(id);
    if (at !== undefined) {
      const dt = at - rec.cardOpenTick;
      if (dt < ready.min * TICK_RATE - 1 || dt > ready.max * TICK_RATE + 1)
        tell('T9', id, at, `card ready after ${dt} ticks`);
    }
  }
  for (let i = 1; i < rec.ticks.length; i++) {
    if (rec.ticks[i]!.phase === Phase.lobby && rec.ticks[i - 1]!.phase !== Phase.lobby) {
      const resetTick = rec.ticks[i]!.tick;
      for (const id of ids) {
        if (rec.ticks[i]!.seats.get(id)?.ready) tell('T9', id, resetTick, 'ready on the reset tick');
        const turned = rec.ticks.slice(i).find((x) => x.seats.get(id)?.ready);
        if (turned) {
          const dt = turned.tick - resetTick;
          if (dt < ready.min * TICK_RATE - 1 || dt > ready.max * TICK_RATE + 1)
            tell('T9', id, turned.tick, `lobby ready after ${dt} ticks`);
        }
      }
      break;
    }
  }

  // T10: moving in step after a placement. T12: leaving the dark together.
  for (let i = 1; i < rec.ticks.length; i++) {
    const t = rec.ticks[i]!;
    const was = rec.ticks[i - 1]!;
    const placement =
      (t.phase === Phase.grace && was.phase !== Phase.grace) ||
      (t.phase === Phase.immunity && was.phase !== Phase.immunity);
    if (placement) {
      const firsts: number[] = [];
      for (const id of ids) {
        const rows = all.get(id)!;
        const from = rows.findIndex((r) => r.tick >= t.tick + 1);
        const first = rows.slice(Math.max(0, from)).find((r) => r.moved && r.live);
        if (!first) continue;
        if (
          first.tick - t.tick < Math.round(balance.npc.react.afterPlacementIdleS.min * TICK_RATE) - 1 &&
          first.s.mode !== 'react'
        ) {
          tell('T10', id, first.tick, `moved ${first.tick - t.tick} ticks after a placement`);
        }
        if (first.tick - t.tick <= 600) firsts.push(first.tick);
      }
      if (firsts.length >= 3 && Math.max(...firsts) - Math.min(...firsts) < 20) {
        tell('T10', ids[0]!, t.tick, 'the NPCs moved in step');
      }
    }
    const nightBegins =
      (t.phase === Phase.dusk && was.phase !== Phase.dusk) ||
      (t.phase === Phase.finalNight && was.phase !== Phase.finalNight);
    if (nightBegins) {
      const starts: number[] = [];
      for (const id of ids) {
        const s = t.seats.get(id);
        if (!s || s.dead || !s.placed || litAtNight(sceneKey(s.scene))) continue;
        const rows = all.get(id)!;
        const from = rows.findIndex((r) => r.tick === t.tick);
        if (from < 0 || rows[from]!.moved) continue;
        const first = rows.slice(from + 1).find((r) => r.moved && !r.sceneChanged);
        if (first) starts.push(first.tick);
      }
      starts.sort((a, b) => a - b);
      for (let k = 0; k + 2 < starts.length; k++) {
        if (starts[k + 2]! - starts[k]! <= 40) {
          tell('T12', ids[0]!, t.tick, 'three NPCs left the dark within 40 ticks of each other');
          break;
        }
      }
    }
  }
  return tells;
}
