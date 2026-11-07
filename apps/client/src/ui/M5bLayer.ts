import balance from '@wdi/content/data/balance.json';
import minigames from '@wdi/content/data/minigames.json';
import quests from '@wdi/content/data/quests.json';
import recipes from '@wdi/content/data/recipes.json';
import resources from '@wdi/content/data/resources.json';
import { TILE_PX } from '@wdi/shared/constants';
import { generateMinigame, mulberry32, checkMinigame, type MinigameBases } from '@wdi/shared/rules';
import type { MinigameKind } from '@wdi/shared/protocol';
import type Phaser from 'phaser';
import { REG_WORLD, type NodeSnap, type WorldFeed } from '../net/world';
import { StatusBit } from '../view/animIds';
import { openMinigame, type MinigameModal } from '../view/minigames/MinigameModal';
import { loadGivers, type GiverSpot } from '../view/GiverView';
import { reachPx } from '../view/body/verbs'; // round 8, 8A
import { nearestAvatar } from '../view/targets'; // round 8, 8A
import { fill } from './copy';
import { aName } from './copy/refusals';
import { M5B_COPY as C } from './copy/m5b';
import { TASK_COPY as TC } from './copy/tasks';
import { mountChores, mountWorkBar } from './Chores';
import { mountCrafting } from './Crafting';
import { h, isTyping, overlayRoot } from './dom';
import { refused } from './theme/motion';
import { mountHotbar, type Hotbar } from './Hotbar';
import { itemName, mountInventory, stacksOf, type Panel } from './Inventory';
import { LAYOUT, slotsIn } from './slots';
import { mountQuestLog } from './QuestLog';
import { actionOfCode } from '../input/actions';
import {
  TASKS,
  coopPrompt,
  loadPropAt,
  loadSceneNameOf,
  taskPrompt,
  taskSpots,
  type TaskSpot,
} from './tasks';
import { coinsCastMs, coinsPrompt } from './shop/coins'; // Round 8, 8C (GDD 3.23): a coins node's hold

const REACH_PX = balance.doors.reachTiles * TILE_PX;
const RES = resources.resources as Record<
  string,
  { id: string; name: string; gatherS: number; tool?: string }
>;
const RECIPES = recipes.recipes as Record<string, { craftS: number; out: string }>;
const NPC_NAME = (id: string): string => (quests.npcs as Record<string, { name: string }>)[id]?.name ?? id;
/** What the toast says when a hold is let go, by its kind. */
const CANCEL = {
  gather: C['toast.gather.cancel'],
  craft: C['toast.craft.cancel'],
  task: TC['toast.task.coop.cancel'],
} as const;
/** Mock and server phase ids with the world running: grace, day, dusk, night. */
const WORLD_PHASES = new Set([2, 3, 4, 5]);
/** The phases a `nightOnly` task (GDD 3.5) can be worked in: night and the final night. */
const NIGHT_PHASES = new Set([5, 11]);

type Target =
  | { kind: 'node'; id: string; resource: string; x: number; y: number }
  | { kind: 'giver'; npc: string; x: number; y: number }
  | TaskSpot;

/** A hold the layer runs: a gather, a craft, or the co-op task hold whose progress the server sends (GDD 3.5). */
interface Hold {
  action: 'gather' | 'craft' | 'task';
  targetId: string;
  since: number;
  castMs: number;
  x: number;
  y: number;
  /** The pockets when the hold began: a change ends it (the yield or the crafted item arrived). */
  sig: string;
}

/**
 * Whether the layer takes E: a press when a node, a giver or a task spot is in reach, a release only to end a gather or
 * the co-op hold. Everything else (clues, bodies, the bell, doors, an empty spot) falls through to the World's verbs.
 */
export function takesUse(down: boolean, target: Target | null, holding: Hold['action'] | null): boolean {
  return down ? target !== null : holding === 'gather' || holding === 'task';
}

export interface M5bLayer {
  /** E pressed or released; true when the layer took the key (a node or a giver in reach, or a gather to end). */
  use(down: boolean): boolean;
  destroy(): void;
}

/**
 * The nearest candidate within `reach`, ties to the first (nodes before givers by the caller's order); a candidate
 * with a `reach` of its own (the co-op spot's radius, GDD 3.5) is measured against that instead.
 */
export function nearest<T extends { x: number; y: number; reach?: number }>(
  from: { x: number; y: number },
  list: readonly T[],
  reach = REACH_PX,
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const t of list) {
    const d = Math.hypot(from.x - t.x, from.y - t.y);
    if (d <= (t.reach ?? reach) && d < bestD - 1) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/**
 * The prompt line for a target, or the cancel line while holding; null when there is nothing to offer. `night` is
 * whether the clock stands at night, which a `nightOnly` task's station waits for (round 7, 7M).
 */
export function promptFor(
  t: Target | null,
  hasTool: (item: string) => boolean,
  night = false,
): string | null {
  if (!t) return null;
  if (t.kind === 'task') return taskPrompt(t, hasTool, night);
  if (t.kind === 'giver') return fill(C['prompt.giver'], { name: NPC_NAME(t.npc) });
  const coins = coinsPrompt(t.resource); // Round 8, 8C (GDD 3.23): dropped coins are no `resources.json` row
  if (coins) return coins;
  const what = RES[t.resource]?.name ?? t.resource;
  const tool = blockedBy(t, hasTool);
  return tool
    ? fill(C['prompt.gather.tool'], { tool: aName(tool), what })
    : fill(C['prompt.gather'], { what });
}

/**
 * The tool a node wants that the player lacks, or null (round 10, 10Y; UI.md 14.51, failures.md 6.2 and FM7): the
 * prompt greys on it and a press shakes it and sends nothing, so the refusal is prevented, never asked for.
 */
export function blockedBy(t: Target | null, hasTool: (item: string) => boolean): string | null {
  if (t?.kind !== 'node') return null;
  const tool = RES[t.resource]?.tool;
  return tool && !hasTool(tool) ? tool : null;
}

/** The board a `?minigame=<kind>` run opens (a dev flag, like the server's `minigameStart` without a server). */
export function devBoard(kind: MinigameKind, seed = 7) {
  const bases: MinigameBases = balance.minigames;
  const def = Object.values(minigames.minigames).find((m) => m.kind === kind);
  return {
    taskId: def?.task ?? 'devTask',
    difficulty: def?.difficulty ?? 1,
    assistS: def?.assistS ?? 20,
    puzzle: generateMinigame(kind, def?.difficulty ?? 1, mulberry32(seed), bases),
  };
}

/**
 * Round 6, Session 6I: the DOM half of M5b on top of the World. `scenes/World.ts` constructs it beside the three views
 * and routes E to `use`: it owns the pockets (I), crafting (C) and quest (J, or T at a giver) panels, the hold prompt
 * for gathering (hold E, or tap the prompt), the crafting hold, and the mini-game modal opened by
 * `S2C.minigameStart`. It follows the scene's own update, so nothing else in the World calls it. Round 7 (7M, UI.md
 * 14.38): the chores panel (K), the task prompts at a task's source and stations, and the village's work bar; a ghost
 * keeps the layer for its own tasks only (GDD 3.8), with no gathering, crafting or quests.
 */
export function mountM5bLayer(scene: Phaser.Scene, parent: HTMLElement = overlayRoot()): M5bLayer | null {
  const feed = scene.registry.get(REG_WORLD) as WorldFeed | undefined;
  return feed ? new Layer(scene, feed, parent) : null;
}

class Layer implements M5bLayer {
  private readonly root: HTMLElement;
  private readonly prompt: HTMLButtonElement;
  private readonly bar: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly inv: Panel;
  private readonly hotbar: Hotbar;
  private readonly craft: Panel;
  private readonly questLog: Panel;
  private readonly chores: Panel;
  private readonly work: { update(pct: number): void; destroy(): void };
  private readonly keys: HTMLElement;
  private givers: GiverSpot[] = [];
  private propAt: (propId: string) => { x: number; y: number } | null = () => null;
  private sceneName: (id: string) => string = (id) => id;
  /** A pick-up sent: the pockets when it went, and how long to wait for them to change before saying nothing. */
  private picking: { sig: string; tool: string; until: number } | null = null;
  private target: Target | null = null;
  private hold: Hold | null = null;
  /** The co-op hold's hands and progress as the server last sent them (`coopHold`). */
  private coop = { holders: 0, progress: 0 };
  private modal: MinigameModal | null = null;
  private toastUntil = 0;
  private gone = false;
  private asleep = false;
  private readonly offs: Array<() => void> = [];
  private readonly sceneId: string;

  constructor(
    scene: Phaser.Scene,
    private readonly feed: WorldFeed,
    parent: HTMLElement,
  ) {
    this.sceneId = (scene as unknown as { sceneId?: string }).sceneId ?? '';
    const onUpdate = () => this.tick(feed.nodes());
    scene.events.on('update', onUpdate);
    this.offs.push(() => scene.events.off('update', onUpdate));
    this.bar = h('i', {});
    this.prompt = h(
      'button',
      { type: 'button', class: 'wdi-m5b__prompt', hidden: true, 'data-testid': 'm5b-prompt' },
      h('span', { class: 'wdi-m5b__prompt-text' }),
      h('span', { class: 'wdi-m5b__bar' }, this.bar),
    );
    this.toastEl = h('p', {
      class: 'wdi-m5b__toast',
      hidden: true,
      'data-testid': 'm5b-toast',
      'aria-live': 'polite',
    });
    this.keys = h(
      'nav',
      { class: 'wdi-m5b__keys', 'aria-label': 'Pockets, crafting, quests and chores' },
      this.keyButton('inv', C['inv.title'], C['inv.key'], () => this.inv.toggle()),
      this.keyButton('craft', C['craft.title'], C['craft.key'], () => this.craft.toggle()),
      this.keyButton('quests', C['quest.title'], C['quest.key'], () => this.questLog.toggle()),
      this.keyButton('chores', TC['chores.title'], TC['chores.key'], () => this.chores.toggle()),
    );
    this.root = h(
      'div',
      { class: 'wdi-root wdi-m5b', 'data-testid': 'm5b' },
      this.keys,
      this.prompt,
      this.toastEl,
    );
    parent.append(this.root);
    this.hotbar = mountHotbar(this.root, {
      inventory: () => feed.inventory(),
      selected: () => feed.selectedSlot(),
      select: (slot) => feed.invSelect(slot),
    });
    this.inv = mountInventory(this.root, {
      inventory: () => feed.inventory(),
      selected: () => feed.selectedSlot(),
      move: (from, to) => feed.invMove(from, to),
      craftGrid: (size, cells) => feed.craftGrid(size, cells),
      lit: () => this.lit(),
      light: (on) => feed.light(on),
      use: (id, target) => feed.ability(id, target), // round 8, 8A
      near: (tiles) => nearestAvatar(feed.avatars(), feed.selfHandle(), reachPx(tiles)), // round 8, 8A
    });
    this.craft = mountCrafting(this.root, {
      inventory: () => feed.inventory(),
      crafting: () => (this.hold?.action === 'craft' ? this.hold.targetId : null),
      toggle: (id) => this.toggleCraft(id),
      progress: () => this.progress(),
      openSquare: () => {
        // Round 10, A374: a hand recipe is made in the crafting square at the foot of Pockets (UI.md 14.44).
        this.craft.close();
        this.inv.open();
      },
    });
    this.questLog = mountQuestLog(this.root, {
      quests: () => feed.quests(),
      inventory: () => feed.inventory(),
      near: () => this.nearNpcs(),
      accept: (id) => feed.questAccept(id),
      turnIn: (id) => feed.questTurnIn(id),
    });
    this.chores = mountChores(this.root, {
      tasks: () => feed.tasks(),
      inventory: () => feed.inventory(),
      sceneName: (id) => this.sceneName(id),
    });
    this.work = mountWorkBar(this.root);
    this.prompt.addEventListener('click', () => this.press(true, true));

    const keyDown = (e: KeyboardEvent) => this.onKey(e, true);
    const keyUp = (e: KeyboardEvent) => this.onKey(e, false);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    this.offs.push(
      () => window.removeEventListener('keydown', keyDown),
      () => window.removeEventListener('keyup', keyUp),
    );
    const onStart = (m: { taskId: string; kind: string; public: unknown }) =>
      this.openGame(m.taskId, m.kind as MinigameKind, m.public, this.assistOf(m.taskId));
    feed.bus.on('minigameStart', onStart);
    const onCoop = (m: { taskId: string; holders: number; progress: number }) => this.onCoop(m);
    feed.bus.on('coopHold', onCoop);
    this.offs.push(
      () => feed.bus.off('minigameStart', onStart),
      () => feed.bus.off('coopHold', onCoop),
    );
    const sleep = () => this.setAsleep(true);
    const wake = () => this.setAsleep(false);
    scene.events.on('sleep', sleep);
    scene.events.on('wake', wake);
    this.offs.push(
      () => scene.events.off('sleep', sleep),
      () => scene.events.off('wake', wake),
    );
    if (this.sceneId) {
      void loadGivers(this.sceneId).then((g) => (this.givers = this.gone ? [] : g));
      void loadPropAt(this.sceneId).then((f) => (this.propAt = f));
    }
    void loadSceneNameOf().then((f) => (this.sceneName = f));
    this.devMinigame();
  }

  private keyButton(id: string, label: string, key: string, on: () => void): HTMLButtonElement {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'wdi-btn wdi-btn--sm wdi-m5b__key',
        'data-testid': `m5b-${id}`,
        'aria-label': label,
      },
      `${label} `,
      h('kbd', {}, key),
    );
    b.addEventListener('click', on);
    return b;
  }

  /** `?minigame=<kind>`: opens that kind's board at once and judges the answer in place (a demo and test hook). */
  private devMinigame(): void {
    const kind = new URLSearchParams(location.search).get('minigame') as MinigameKind | null;
    if (!kind || !['crates', 'pour', 'slide', 'stoke', 'tap', 'lockpick'].includes(kind)) return;
    const board = devBoard(kind);
    const verdict = (taskId: string, answer: unknown) => {
      const ok = checkMinigame(board.puzzle, answer);
      this.root.dataset.minigame = ok ? 'ok' : 'wrong';
      this.feed.minigameResult(taskId, answer);
    };
    window.setTimeout(() => {
      if (!this.gone) this.openGame(board.taskId, kind, board.puzzle.public, board.assistS, verdict);
    }, 300);
  }

  private assistOf(taskId: string): number {
    const def = Object.values(minigames.minigames).find((m) => m.task === taskId);
    return def?.assistS ?? 20;
  }

  private openGame(
    taskId: string,
    kind: MinigameKind,
    pub: unknown,
    assistS: number,
    send: (taskId: string, answer: unknown) => void = (id, a) => this.feed.minigameResult(id, a),
  ): void {
    this.modal?.close();
    this.cancelHold(false);
    this.modal = openMinigame(
      this.root,
      { taskId, kind, public: pub, assistS },
      send,
      () => (this.modal = null),
    );
  }

  private setAsleep(on: boolean): void {
    this.asleep = on;
    this.root.hidden = on;
    if (on) this.cancelHold(true);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.asleep || e.repeat || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    // Round 10, R1: the key's row of the action table (input/actions.ts, rolecards.md 3).
    const action = actionOfCode(e.code);
    if (action?.startsWith('hotbar.')) {
      // Round 10 (A13): the number keys pick the held hotbar slot.
      const slot = slotsIn(LAYOUT, 'hotbar')[Number(action.slice(7)) - 1];
      if (down && slot !== undefined) this.feed.invSelect(slot);
      return;
    }
    switch (action) {
      case 'pockets':
        if (down) this.inv.toggle();
        break;
      case 'craft':
        if (down) this.craft.toggle();
        break;
      case 'quests':
        if (down) this.questLog.toggle();
        break;
      case 'giver':
        if (down && this.target?.kind === 'giver') this.questLog.open();
        break;
      case 'chores':
        if (down) this.chores.toggle();
        break;
      case 'close':
        if (down) for (const p of this.panels()) p.close();
        break;
    }
  }

  /**
   * E pressed or released. True when the layer took the key (a node or a giver in reach, or a gather hold to end); false
   * lets the World act on clues, bodies, the bell and doors as before.
   */
  use(down: boolean): boolean {
    if (this.gone || this.asleep || this.root.hidden) return false;
    if (!takesUse(down, this.target, this.hold?.action ?? null)) return false;
    if (down) this.press(true, false);
    else this.cancelHold(true, this.hold?.action === 'task' ? 'task' : 'gather');
    return true;
  }

  private panels(): Panel[] {
    return [this.inv, this.craft, this.questLog, this.chores];
  }

  /**
   * E or the prompt pressed or released: start a gather on the node in reach, or stop the hold; at a task's source or
   * station, send the task hold (the server's instant pick-up or opener, GDD 3.5) and say what came of it; at a co-op
   * spot, hold until the hands are enough and the server says it is done, or let go (a release, or the prompt again).
   */
  private press(down: boolean, toggle: boolean): void {
    const t = this.target;
    if (t?.kind === 'giver') {
      if (down) this.questLog.open();
      return;
    }
    if (this.hold?.action === 'task') {
      if (toggle || !down) this.cancelHold(true, 'task');
      return;
    }
    if (t?.kind === 'task') {
      if (down && !this.hold) this.workTask(t);
      return;
    }
    if (toggle && this.hold) return this.cancelHold(true);
    if (!down) return this.cancelHold(true, 'gather');
    if (!t || this.hold || this.feed.dead()) return;
    if (blockedBy(t, (item) => this.has(item))) return refused(this.prompt); // greyed: the shake, no request
    const res = RES[t.resource];
    this.begin('gather', t.id, coinsCastMs(t.resource) ?? (res?.gatherS ?? 3) * 1000); // Round 8, 8C: coins' cast
  }

  /**
   * The task hold at `t`. A co-op spot keeps the hold until the server ends it. At the source a real task's pick-up
   * shows when the pockets change; a fake one is theatre.
   */
  private workTask(t: TaskSpot): void {
    if (t.step === 'coop') {
      this.coop = { holders: 0, progress: 0 };
      return this.begin('task', t.taskId, 1);
    }
    this.feed.hold('task', t.taskId, true);
    if (t.step !== 'source') return;
    if (t.fake || !t.tool) this.say(TC['toast.task.show']);
    else this.picking = { sig: this.pocketSig(), tool: t.tool, until: performance.now() + 1500 };
  }

  private toggleCraft(recipeId: string): void {
    if (this.hold?.action === 'craft' && this.hold.targetId === recipeId) return this.cancelHold(true);
    if (this.hold || this.feed.dead()) return;
    this.begin('craft', recipeId, (RECIPES[recipeId]?.craftS ?? 3) * 1000);
  }

  private begin(action: Hold['action'], targetId: string, castMs: number): void {
    const me = this.self();
    if (!me) return;
    this.hold = {
      action,
      targetId,
      since: performance.now(),
      castMs,
      x: me.x,
      y: me.y,
      sig: this.pocketSig(),
    };
    this.feed.hold(action, targetId, true);
  }

  private cancelHold(send: boolean, only?: Hold['action']): void {
    const h0 = this.hold;
    if (!h0 || (only && h0.action !== only)) return;
    this.hold = null;
    if (send) {
      this.feed.hold(h0.action, h0.targetId, false);
      this.say(CANCEL[h0.action]);
    }
  }

  /** The co-op hold's state as the server last sent it (`coopHold`); the hold ends when its progress reaches 1. */
  private onCoop(m: { taskId: string; holders: number; progress: number }): void {
    const hd = this.hold;
    if (hd?.action !== 'task' || hd.targetId !== m.taskId) return;
    this.coop = { holders: m.holders, progress: m.progress };
    if (m.progress < 1) return;
    this.hold = null;
    this.say(TC['toast.task.coop.done']);
  }

  /** The hold's progress, 0 to 1: a gather's or craft's by the clock, the co-op hold's as the server sends it. */
  private progress(): number {
    if (!this.hold) return 0;
    if (this.hold.action === 'task') return this.coop.progress;
    return Math.min(1, (performance.now() - this.hold.since) / this.hold.castMs);
  }

  private self(): { x: number; y: number; bits: number } | null {
    const me = this.feed.snapshot().find((p) => p.id === this.feed.selfId)?.presence;
    return me ? { x: me.x, y: me.y, bits: me.statusBits } : null;
  }

  private lit(): boolean {
    return ((this.self()?.bits ?? 0) & StatusBit.lantern) !== 0;
  }

  private has(item: string): boolean {
    return this.feed.inventory().some((s) => s.defId === item && s.qty > 0);
  }

  private pocketSig(): string {
    return stacksOf(this.feed.inventory())
      .map((s) => `${s.defId}:${s.qty}`)
      .join('|');
  }

  private nearNpcs(): ReadonlySet<string> {
    const me = this.self();
    const out = new Set<string>();
    if (!me) return out;
    for (const g of this.givers)
      if (Math.hypot(me.x - (g.x + 0.5) * TILE_PX, me.y - (g.y + 0.5) * TILE_PX) <= REACH_PX) out.add(g.npc);
    return out;
  }

  private say(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastUntil = performance.now() + 2500;
  }

  private tick(nodes: readonly NodeSnap[]): void {
    if (this.gone) return;
    const clock = this.feed.clock();
    // A ghost keeps the layer for its own tasks (GDD 3.8): no node, giver, gather or craft, the chores and the bar stay.
    const ghost = this.feed.dead();
    const live = WORLD_PHASES.has(clock.phase) && !this.asleep;
    this.root.hidden = !live || this.asleep;
    this.root.toggleAttribute('data-ghost', live && ghost);
    const now = performance.now();
    if (this.toastUntil > 0 && now > this.toastUntil) {
      this.toastEl.hidden = true;
      this.toastUntil = 0;
    }
    if (!live) return this.cancelHold(false);
    if (ghost) {
      this.cancelHold(false);
      for (const p of [this.inv, this.craft, this.questLog]) p.close();
    }
    const me = this.self();
    this.target = me ? this.pick(me, ghost ? [] : nodes, ghost) : null;
    this.runHold(me, nodes);
    this.runPick(now);
    this.drawPrompt(NIGHT_PHASES.has(clock.phase));
    this.work.update(this.feed.taskBar());
    // Each open panel redraws only when what it shows changed.
    for (const p of this.panels()) p.update();
    this.hotbar.update();
  }

  /** The nearest of the active nodes, the givers and this seat's task spots; a task spot wins a tie. */
  private pick(me: { x: number; y: number }, nodes: readonly NodeSnap[], ghost: boolean): Target | null {
    const ts = nearest(
      me,
      taskSpots(this.feed.tasks(), this.sceneId, this.propAt, (item) => this.has(item)),
    );
    const ns = nearest(
      me,
      nodes.filter((n) => n.active),
    );
    const gs = ghost
      ? null
      : nearest(
          me,
          this.givers.map((g) => ({ x: (g.x + 0.5) * TILE_PX, y: (g.y + 0.5) * TILE_PX, npc: g.npc })),
        );
    const d = (t: { x: number; y: number } | null) => (t ? Math.hypot(me.x - t.x, me.y - t.y) : Infinity);
    const dt = d(ts);
    const dn = d(ns);
    const dg = d(gs);
    if (ts && dt <= dn && dt <= dg) return ts;
    if (ns && dn <= dg) return { kind: 'node', id: ns.id, resource: ns.resource, x: ns.x, y: ns.y };
    return gs ? { kind: 'giver', npc: gs.npc, x: gs.x, y: gs.y } : null;
  }

  /** The pick-up sent from a task's source: the pockets changing is the yes; past the wait, nothing is said. */
  private runPick(now: number): void {
    const pk = this.picking;
    if (!pk) return;
    if (this.pocketSig() !== pk.sig) {
      this.picking = null;
      this.say(fill(TC['toast.task.took'], { tool: itemName(pk.tool) }));
    } else if (now > pk.until) this.picking = null;
  }

  /**
   * Ends a hold that finished (the pockets changed), lost its node or was left (the player moved). The co-op hold
   * finishes only on the server's word (`onCoop`); moving away lets go of it, as the server does (GDD 3.5).
   */
  private runHold(me: { x: number; y: number } | null, nodes: readonly NodeSnap[]): void {
    const hd = this.hold;
    if (!hd) return;
    const moved = !me || Math.hypot(me.x - hd.x, me.y - hd.y) > 3;
    if (hd.action === 'task') {
      if (moved) this.cancelHold(true, 'task');
      return;
    }
    const node = hd.action === 'gather' ? nodes.find((n) => n.id === hd.targetId) : null;
    if (this.pocketSig() !== hd.sig) {
      this.hold = null;
      this.say(
        fill(C[hd.action === 'gather' ? 'toast.gather.done' : 'toast.craft.done'], {
          what: itemName(
            hd.action === 'gather'
              ? (RES[node?.resource ?? '']?.id ?? '') || 'it'
              : (RECIPES[hd.targetId]?.out ?? ''),
          ),
        }),
      );
    } else if (moved || (hd.action === 'gather' && (!node || !node.active))) {
      this.cancelHold(false);
      this.say(C[hd.action === 'gather' ? 'toast.gather.cancel' : 'toast.craft.cancel']);
    }
  }

  private drawPrompt(night: boolean): void {
    const hd = this.hold;
    const text = hd
      ? hd.action === 'task'
        ? coopPrompt(this.coop.holders, this.coopPlayers(hd.targetId))
        : C['prompt.gather.cancel']
      : promptFor(this.target, (item) => this.has(item), night);
    this.prompt.hidden = text === null;
    const label = this.prompt.firstElementChild as HTMLElement;
    if (label.textContent !== (text ?? '')) label.textContent = text ?? '';
    this.bar.style.width = `${Math.round(this.progress() * 100)}%`;
    this.prompt.dataset.kind = this.hold ? 'hold' : (this.target?.kind ?? '');
    const blocked = !hd && blockedBy(this.target, (item) => this.has(item)) !== null;
    this.prompt.classList.toggle('is-blocked', blocked);
    this.prompt.setAttribute('aria-disabled', String(blocked));
  }

  private coopPlayers(taskId: string): number {
    return TASKS[taskId]?.coopPlayers ?? 2;
  }

  destroy(): void {
    this.gone = true;
    this.cancelHold(false);
    this.modal?.close();
    for (const off of this.offs) off();
    for (const p of this.panels()) p.destroy();
    this.hotbar.destroy();
    this.work.destroy();
    this.root.remove();
  }
}
