import { vendettas } from '@wdi/content';
import type { InvariantFailure } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { registerInvariant } from '../auto/invariants';
import { matchEvents } from '../auto/log';
import { CONTRACT_QUEST } from './contract';
import { STRONGBOX_ITEM } from './heist';
import { vendettaSteps } from './progress';
import { vendettaHolders, vendettaOf } from './state';

/**
 * The vendetta invariants (GDD 3.20; `docs/round7/vendettas.md` 2), registered beside round 6's seven checks and
 * read by `pnpm auto`, the soak and the admin room. Each reads the room and the match's step record only. Session 7H.
 */

const fail = (room: PartyRoom, detail: string): InvariantFailure => ({
  name: '',
  tick: room.state.tick,
  detail,
});

/** Every vendetta's id by its `fires` step kind. */
const FIRES = new Map(Object.values(vendettas.vendettas).map((v) => [v.fires, v.id]));

// A vendetta fires at most once per match, and every step is for the seat that holds that vendetta.
registerInvariant('vendettaOnce', (room) => {
  const holders = vendettaHolders(room);
  const fired = new Set<string>();
  for (const s of vendettaSteps(room)) {
    if (holders.get(s.seat) !== s.vendettaId)
      return fail(room, `step ${s.kind} at tick ${s.tick} for ${s.seat}, who does not hold ${s.vendettaId}`);
    if (FIRES.get(s.kind) !== s.vendettaId) continue;
    if (fired.has(s.seat)) return fail(room, `${s.vendettaId} of ${s.seat} fired twice (tick ${s.tick})`);
    fired.add(s.seat);
  }
  return null;
});

// A `contract` quest sits only on a seat holding the contract vendetta.
registerInvariant('contractQuest', (room) => {
  for (const [id, player] of room.state.players) {
    if (!player.priv?.quests.some((q) => q.id === CONTRACT_QUEST)) continue;
    if (vendettaOf(room, id)?.kind !== 'contract')
      return fail(room, `${id} holds a contract quest without the contract`);
  }
  return null;
});

// The strongbox is in one inventory at most, one of it.
registerInvariant('strongboxOnce', (room) => {
  const held: string[] = [];
  for (const [id, player] of room.state.players) {
    for (const slot of player.priv?.inventory.slots ?? [])
      if (slot.defId === STRONGBOX_ITEM) for (let i = 0; i < slot.qty; i++) held.push(id);
  }
  return held.length > 1
    ? fail(room, `the strongbox is held ${held.length} times (${held.join(', ')})`)
    : null;
});

// Nothing public names a vendetta's holder: a `vendetta.*` event carries no seat, and no seat id in its data.
const cursor = new WeakMap<object, number>();
registerInvariant('vendettaPublic', (room) => {
  const log = matchEvents(room);
  let next = cursor.get(log) ?? 0;
  let found: InvariantFailure | null = null;
  for (; next < log.length; next++) {
    const e = log[next]!;
    if (!e.kind.startsWith('vendetta.')) continue;
    const named =
      e.seat ?? Object.values(e.data ?? {}).find((v) => typeof v === 'string' && room.state.players.has(v));
    if (named !== undefined) found ??= fail(room, `${e.kind} at tick ${e.tick} names ${String(named)}`);
  }
  cursor.set(log, next);
  return found;
});
