import mitt, { type Emitter } from 'mitt';
import type { Room } from '@colyseus/sdk';
import type { NightRevealEntry, OnubClaimPayload, S2CPayloads } from '@wdi/shared/protocol';
import type { OnubBoardView, OnubClaimView, OnubFeed, OnubFeedEvents, OnubPileView } from './onub';
import { ONUB_PHASE } from './onubRouter';

// Reads the live room for the ONUB v2 screens (GDD 3.11, round-5 contract 5.1): the public board, the claims,
// this seat's own private view and the night messages. It covers prep (`prep`, `myPrep`, `board`) as well as the
// night and the Rush. Loose structural types keep the schema runtime out of the bundle (as meetingColyseus.ts).

interface Collection<T> {
  forEach(cb: (item: T, key: string) => void): void;
}
interface PileState {
  cards?: Iterable<string>;
  lost: number;
  net: number;
  underMixed: boolean;
}
interface BoardState {
  seats?: Iterable<string>;
  deck?: Iterable<string>;
  piles?: Collection<PileState>;
  ruinWeight: number;
  ruined: boolean;
  perk: boolean;
  cloche: string;
  window?: string;
}
interface ClaimState {
  from: string;
  roleId: string;
  stationId: string;
  cardId: string;
  saw?: Iterable<{ targetId: string; roleId: string; stationId: string }>;
}
interface PlayerState {
  id: string;
  name: string;
  priv?: {
    role?: { roleId?: string };
    onubLoc?: string;
    onubCard?: string;
    nightReveal?: Iterable<NightRevealEntry>;
  };
}
interface GameStateLike {
  tick: number;
  phase: number;
  phaseEndsTick: number;
  players: { get(id: string): PlayerState | undefined };
  meeting?: { claims?: Iterable<ClaimState> };
  onub?: BoardState;
}

const list = <T>(items: Iterable<T> | undefined): T[] => (items === undefined ? [] : [...items]);

export class ColyseusOnubFeed implements OnubFeed {
  readonly bus: Emitter<OnubFeedEvents> = mitt<OnubFeedEvents>();
  private open: S2CPayloads['nightWake'] | null = null;
  private boardKey = '';
  private claimsKey = '';
  private readonly offs: Array<() => void> = [];
  private readonly onState = () => this.diff();

  constructor(private readonly room: Room) {
    // Registered before the router's listeners, so the cached wake is current inside an event handler.
    this.offs.push(
      room.onMessage('nightWake', (m: S2CPayloads['nightWake']) => {
        this.open = m;
        this.bus.emit('nightWake', m);
      }),
      room.onMessage('nightReveal', (m: S2CPayloads['nightReveal']) => this.bus.emit('nightReveal', m)),
      room.onMessage('nightSleep', (m: S2CPayloads['nightSleep']) => {
        this.open = null;
        this.bus.emit('nightSleep', m);
      }),
      room.onMessage('phaseChange', (m: S2CPayloads['phaseChange']) => {
        if (m.phase !== ONUB_PHASE.night) this.open = null;
        this.bus.emit('phaseChange', m);
      }),
    );
    room.onStateChange(this.onState);
  }

  /** The room this feed reads; the router compares it to spot a reconnect to a new room. */
  get sessionRoom(): Room {
    return this.room;
  }

  get selfId(): string {
    return this.room.sessionId;
  }

  private get state(): GameStateLike {
    return this.room.state as unknown as GameStateLike;
  }

  private get me(): PlayerState | undefined {
    return this.state.players.get(this.selfId);
  }

  /** Emits `board` and `claims` when what they hold changed since the last state patch. */
  private diff(): void {
    const board = this.board();
    const bk = JSON.stringify(board);
    if (bk !== this.boardKey) {
      this.boardKey = bk;
      this.bus.emit('board', board);
    }
    const claims = this.claims();
    const ck = JSON.stringify(claims);
    if (ck !== this.claimsKey) {
      this.claimsKey = ck;
      this.bus.emit('claims', claims);
    }
  }

  clock() {
    const s = this.state;
    return { phase: s.phase, phaseEndsTick: s.phaseEndsTick, tick: s.tick };
  }

  seats(): { id: string; name: string }[] {
    return list(this.state.onub?.seats).map((id) => ({ id, name: this.state.players.get(id)?.name ?? '' }));
  }

  board(): OnubBoardView {
    const b = this.state.onub;
    const piles: Record<string, OnubPileView> = {};
    b?.piles?.forEach((p, station) => {
      piles[station] = { cards: list(p.cards), lost: p.lost, net: p.net, underMixed: p.underMixed };
    });
    return {
      seats: list(b?.seats),
      deck: list(b?.deck),
      piles,
      ruinWeight: b?.ruinWeight ?? 0,
      ruined: b?.ruined ?? false,
      perk: b?.perk ?? false,
      cloche: b?.cloche ?? '',
      window: b?.window ?? '',
    };
  }

  dealtRole(): string {
    return this.me?.priv?.role?.roleId ?? '';
  }

  myPrep(): { station: string; card: string } | null {
    const priv = this.me?.priv;
    const station = priv?.onubLoc ?? '';
    return station === '' ? null : { station, card: priv?.onubCard ?? '' };
  }

  reveals(): readonly NightRevealEntry[] {
    return list(this.me?.priv?.nightReveal).map(({ slot, kind, value, of }) => ({ slot, kind, value, of }));
  }

  wake(): S2CPayloads['nightWake'] | null {
    return this.open;
  }

  claims(): readonly OnubClaimView[] {
    return list(this.state.meeting?.claims).map((c) => ({
      from: c.from,
      roleId: c.roleId,
      stationId: c.stationId,
      cardId: c.cardId,
      saw: list(c.saw).map((s) => ({ targetId: s.targetId, roleId: s.roleId, stationId: s.stationId })),
    }));
  }

  prep(stationId: string, cardId: string): void {
    this.act('onub.prep', [stationId, cardId]);
  }

  act(abilityId: string, targets: readonly string[]): void {
    this.room.send('act.ability', { abilityId, targets: [...targets] });
  }

  claim(c: OnubClaimPayload): void {
    this.room.send('meeting.claim', c);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.room.onStateChange.remove(this.onState);
    this.bus.all.clear();
  }
}
