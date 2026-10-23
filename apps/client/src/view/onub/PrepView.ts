import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import { TICK_RATE } from '@wdi/shared/constants';
import type { OnubFeed } from '../../net/onub';
import { ONUB_PHASE } from '../../net/onubRouter';
import { fill } from '../../ui/copy';
import { ONUB_PREP_COPY as C } from '../../ui/copy/onubPrep';
import { h, type Screen } from '../../ui/dom';
import { renderPiles } from './PilesView';
import { mountStation, type StationRoom } from './StationView';

/** How long a commit may stay unanswered before the room treats it as refused (a 422 reaches the toast only). */
export const COMMIT_ANSWER_MS = 2000;

const ROLES = onubRoles.roles as Record<string, { sabotages?: boolean } | undefined>;

/** The cards a seat dealt `roleId` may play at `stationId` (GDD 3.11 "Evening Prep"): sabotage only for Team Mold. */
export function handOf(stationId: string, roleId: string): string[] {
  const station = onubBalance.stations.find((s) => s.id === stationId);
  if (station === undefined) return [];
  return ROLES[roleId]?.sabotages === true ? [...station.good, ...station.sabotage] : [...station.good];
}

type FeedSlice = Pick<OnubFeed, 'prep' | 'myPrep' | 'dealtRole'>;

/**
 * What Evening Prep asks of a seat, with no DOM (GDD 3.11 "Evening Prep"): enter a room, back out before the
 * commit, finish the mini-game (the gate), pick one card of the hand and commit once. The commit is final; the
 * server may also commit for the seat at the timeout, which `committed()` reads from the feed.
 */
export class PrepModel {
  private station: string | null = null;
  private miniDone = false;
  private card: string | null = null;
  private sentAt: number | null = null;
  private seenCommit = false;
  private madeByServer = false;
  private refused = false;

  constructor(
    private readonly feed: FeedSlice,
    private readonly now: () => number = () => Date.now(),
  ) {}

  committed(): boolean {
    return this.feed.myPrep() !== null;
  }

  /** The commit the server made for this seat (it arrived without this seat sending one). */
  autoCommitted(): boolean {
    return this.madeByServer;
  }

  /** The commit went unanswered: the room opens its card again and says so. */
  wasRefused(): boolean {
    return this.refused;
  }

  room(): string | null {
    return this.station;
  }

  done(): boolean {
    return this.miniDone;
  }

  picked(): string | null {
    return this.card;
  }

  /** Taps a room; refused once a card is in. A different room restarts the mini-game. */
  enter(stationId: string): boolean {
    if (this.committed() || !onubBalance.stations.some((s) => s.id === stationId)) return false;
    if (this.station !== stationId) {
      this.miniDone = false;
      this.card = null;
    }
    this.station = stationId;
    this.refused = false;
    return true;
  }

  /** Back to the overview; the mini-game restarts on the next room. Refused after the commit. */
  back(): boolean {
    if (this.committed() || this.station === null) return false;
    this.station = null;
    this.miniDone = false;
    this.card = null;
    return true;
  }

  finishMini(): void {
    if (this.station !== null) this.miniDone = true;
  }

  /** The cards this seat may play in the open room: empty until the mini-game is done. */
  hand(): string[] {
    if (this.station === null || !this.miniDone) return [];
    return handOf(this.station, this.feed.dealtRole());
  }

  pick(cardId: string): boolean {
    if (!this.hand().includes(cardId)) return false;
    this.card = cardId;
    return true;
  }

  /** Sends `onub.prep` once for the picked card; false when nothing is picked or a card is already in. */
  commit(): boolean {
    if (this.station === null || this.card === null || this.committed() || this.sentAt !== null) return false;
    this.sentAt = this.now();
    this.refused = false;
    this.feed.prep(this.station, this.card);
    return true;
  }

  /** Reads the feed: notices a server-made commit and an unanswered commit. Call it every frame. */
  sync(): void {
    if (this.committed()) {
      if (!this.seenCommit && this.sentAt === null) this.madeByServer = true;
      this.seenCommit = true;
      this.sentAt = null;
      this.station = null;
      return;
    }
    if (this.sentAt !== null && this.now() - this.sentAt >= COMMIT_ANSWER_MS) {
      this.sentAt = null;
      this.refused = true;
    }
  }
}

export interface PrepScreen extends Screen {
  /** Re-reads the feed; the Kitchen scene calls it every frame and on the feed's events. */
  update(): void;
}

const secondsLeft = (feed: OnubFeed): number => {
  const { phaseEndsTick, tick } = feed.clock();
  return Math.max(0, Math.ceil((phaseEndsTick - tick) / TICK_RATE));
};

/** The Perk's Pantry Location card a proofing visitor saw, from the seat's own reveals. */
function perkStation(feed: OnubFeed): string | null {
  const row = feed.reveals().find((r) => r.kind === 'loc' && r.slot.startsWith('pantry.loc.'));
  return row?.value ?? null;
}

/**
 * The kitchen overview and everything on it until the night (GDD 3.11 "Evening Prep", "The crime scenes"): the
 * four room buttons over the art, the clock, a station room with its mini-game, hand and commit, the waiting
 * panel after the commit, and the public board once the piles are face up. DOM only; the art behind it is the
 * Kitchen scene's.
 */
export function mountPrep(
  root: HTMLElement,
  feed: OnubFeed,
  now: () => number = () => Date.now(),
): PrepScreen {
  const model = new PrepModel(feed, now);
  const clock = h('p', {
    class: 'wdi-timer',
    'data-testid': 'onub-clock',
    role: 'timer',
    'aria-label': C['onub.kitchen.clock.label'],
  });
  const caption = h('p', { class: 'wdi-hint' }, C['onub.kitchen.caption']);
  const stationButtons = new Map<string, HTMLButtonElement>();
  for (const s of onubBalance.stations) {
    const button = h(
      'button',
      {
        type: 'button',
        class: `wdi-btn wdi-kitchen__room wdi-kitchen__room--${s.id}`,
        'data-testid': `station-${s.id}`,
        'aria-label': fill(C['onub.kitchen.room.label'], { station: s.name, gloss: s.gloss }),
      },
      h('span', { class: 'wdi-kitchen__name' }, s.name),
      h('span', { class: 'wdi-kitchen__gloss' }, s.gloss),
    );
    button.addEventListener('click', () => {
      if (model.enter(s.id)) renderRoom();
    });
    stationButtons.set(s.id, button);
  }
  const grid = h('div', { class: 'wdi-kitchen__grid' }, ...stationButtons.values());
  const donePanel = h(
    'div',
    { class: 'wdi-panel wdi-stack wdi-stack--tight', 'data-testid': 'prep-done', hidden: true },
    h('p', { class: 'wdi-strong', 'data-testid': 'prep-done-title' }, C['onub.prep.done']),
    h('p', { class: 'wdi-hint', 'data-testid': 'prep-done-auto', hidden: true }, C['onub.prep.auto']),
    h('p', { class: 'wdi-hint', 'data-testid': 'prep-done-yours' }),
    h('p', { class: 'wdi-hint' }, C['onub.prep.wait']),
  );
  const overview = h(
    'div',
    { class: 'wdi-stack wdi-kitchen__overview' },
    h('h2', { class: 'wdi-display wdi-display--md' }, C['onub.kitchen.title']),
    caption,
    grid,
  );
  const roomSlot = h('div', { class: 'wdi-kitchen__roomslot', hidden: true });
  const boardSlot = h('div', {
    class: 'wdi-panel wdi-kitchen__board',
    'data-testid': 'prep-board',
    hidden: true,
  });
  const perkCard = h('p', { class: 'wdi-chip wdi-chip--ready', 'data-testid': 'perk-card', hidden: true });
  const top = h('div', { class: 'wdi-row wdi-row--between' }, clock);
  const kitchen = h(
    'div',
    { class: 'wdi-kitchen', 'data-testid': 'kitchen' },
    top,
    overview,
    donePanel,
    roomSlot,
    boardSlot,
    perkCard,
  );
  root.append(kitchen);

  let room: StationRoom | null = null;
  let roomStation: string | null = null;
  let lastBoard = '';
  let shownRefusal = false;

  const closeRoom = () => {
    room?.destroy();
    room = null;
    roomStation = null;
    roomSlot.replaceChildren();
    roomSlot.hidden = true;
  };

  function renderRoom() {
    closeRoom();
    const id = model.room();
    overview.hidden = id !== null;
    if (id === null) return;
    roomSlot.hidden = false;
    roomStation = id;
    room = mountStation(roomSlot, id, model, {
      onBack: () => {
        if (model.back()) renderRoom();
      },
      onCommit: () => {
        model.commit();
        model.sync();
        if (model.committed()) renderRoom();
      },
      now,
    });
  }

  const update = () => {
    const { phase } = feed.clock();
    model.sync();
    clock.textContent = fill(C['onub.kitchen.clock'], { s: secondsLeft(feed) });
    const committed = model.committed();
    for (const button of stationButtons.values()) button.disabled = committed;
    if (committed && roomStation !== null) renderRoom();
    if (model.wasRefused() !== shownRefusal) {
      shownRefusal = model.wasRefused();
      if (shownRefusal && room !== null) renderRoom();
    }
    donePanel.hidden = !committed;
    if (committed) {
      const mine = feed.myPrep();
      const station = onubBalance.stations.find((s) => s.id === mine?.station);
      const card = onubBalance.cards[(mine?.card ?? '') as keyof typeof onubBalance.cards];
      const autoLine = donePanel.querySelector<HTMLElement>('[data-testid="prep-done-auto"]');
      if (autoLine !== null) autoLine.hidden = !model.autoCommitted();
      const yours = donePanel.querySelector<HTMLElement>('[data-testid="prep-done-yours"]');
      if (yours !== null) {
        yours.textContent = fill(C['onub.prep.yours'], {
          station: station?.name ?? '',
          card: card?.name ?? '',
        });
      }
    }
    const reveal = phase === ONUB_PHASE.prepReveal;
    overview.hidden = reveal || room !== null;
    roomSlot.hidden = reveal || room === null;
    if (reveal && room !== null) closeRoom();
    boardSlot.hidden = !reveal;
    if (reveal) {
      const board = feed.board();
      const key = JSON.stringify(board.piles) + String(board.ruined) + String(board.perk);
      if (key !== lastBoard) {
        lastBoard = key;
        renderPiles(boardSlot, board, { compact: false });
      }
      const perk = perkStation(feed);
      const station = onubBalance.stations.find((s) => s.id === perk);
      perkCard.hidden = station === undefined;
      if (station !== undefined)
        perkCard.textContent = fill(C['onub.board.perk.card'], { station: station.name });
    } else {
      perkCard.hidden = true;
    }
  };
  update();

  return {
    update,
    destroy() {
      closeRoom();
      kitchen.remove();
    },
  };
}
