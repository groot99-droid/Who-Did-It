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
import { M5B_COPY as C } from './copy/m5b';
import { mountCrafting } from './Crafting';
import { h, isTyping, overlayRoot } from './dom';
import { itemName, mountInventory, stacksOf, type Panel } from './Inventory';
import { mountQuestLog } from './QuestLog';

const REACH_PX = balance.doors.reachTiles * TILE_PX;
const RES = resources.resources as Record<
  string,
  { id: string; name: string; gatherS: number; tool?: string }
>;
const RECIPES = recipes.recipes as Record<string, { craftS: number; out: string }>;
const NPC_NAME = (id: string): string => (quests.npcs as Record<string, { name: string }>)[id]?.name ?? id;
/** Mock and server phase ids with the world running: grace, day, dusk, night. */
const WORLD_PHASES = new Set([2, 3, 4, 5]);

type Target =
  | { kind: 'node'; id: string; resource: string; x: number; y: number }
  | { kind: 'giver'; npc: string; x: number; y: number };

interface Hold {
  action: 'gather' | 'craft';
  targetId: string;
  since: number;
  castMs: number;
  x: number;
  y: number;
  /** The pockets when the hold began: a change ends it (the yield or the crafted item arrived). */
  sig: string;
}

/**
 * Whether the layer takes E: a press when a node or a giver is in reach, a release only to end a gather. Everything
 * else (clues, bodies, the bell, doors, an empty spot) falls through to the World's own verbs.
 */
export function takesUse(down: boolean, target: Target | null, holding: 'gather' | 'craft' | null): boolean {
  return down ? target !== null : holding === 'gather';
}

export interface M5bLayer {
  /** E pressed or released; true when the layer took the key (a node or a giver in reach, or a gather to end). */
  use(down: boolean): boolean;
  destroy(): void;
}

/** The nearest candidate within `reach`, ties to the first (nodes before givers by the caller's order). */
export function nearest<T extends { x: number; y: number }>(
  from: { x: number; y: number },
  list: readonly T[],
  reach = REACH_PX,
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const t of list) {
    const d = Math.hypot(from.x - t.x, from.y - t.y);
    if (d <= reach && d < bestD - 1) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** The prompt line for a target, or the cancel line while holding; null when there is nothing to offer. */
export function promptFor(t: Target | null, hasTool: (item: string) => boolean): string | null {
  if (!t) return null;
  if (t.kind === 'giver') return fill(C['prompt.giver'], { name: NPC_NAME(t.npc) });
  const res = RES[t.resource];
  const what = res?.name ?? t.resource;
  const tool = res?.tool;
  return tool && !hasTool(tool)
    ? fill(C['prompt.gather.tool'], { tool: itemName(tool), what })
    : fill(C['prompt.gather'], { what });
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
 * `S2C.minigameStart`. It follows the scene's own update, so nothing else in the World calls it.
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
  private readonly craft: Panel;
  private readonly questLog: Panel;
  private readonly keys: HTMLElement;
  private givers: GiverSpot[] = [];
  private target: Target | null = null;
  private hold: Hold | null = null;
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
      { class: 'wdi-m5b__keys', 'aria-label': 'Pockets, crafting and quests' },
      this.keyButton('inv', C['inv.title'], C['inv.key'], () => this.inv.toggle()),
      this.keyButton('craft', C['craft.title'], C['craft.key'], () => this.craft.toggle()),
      this.keyButton('quests', C['quest.title'], C['quest.key'], () => this.questLog.toggle()),
    );
    this.root = h(
      'div',
      { class: 'wdi-root wdi-m5b', 'data-testid': 'm5b' },
      this.keys,
      this.prompt,
      this.toastEl,
    );
    parent.append(this.root);
    this.inv = mountInventory(this.root, {
      inventory: () => feed.inventory(),
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
    });
    this.questLog = mountQuestLog(this.root, {
      quests: () => feed.quests(),
      inventory: () => feed.inventory(),
      near: () => this.nearNpcs(),
      accept: (id) => feed.questAccept(id),
      turnIn: (id) => feed.questTurnIn(id),
    });
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
    this.offs.push(() => feed.bus.off('minigameStart', onStart));
    const sleep = () => this.setAsleep(true);
    const wake = () => this.setAsleep(false);
    scene.events.on('sleep', sleep);
    scene.events.on('wake', wake);
    this.offs.push(
      () => scene.events.off('sleep', sleep),
      () => scene.events.off('wake', wake),
    );
    if (this.sceneId) void loadGivers(this.sceneId).then((g) => (this.givers = this.gone ? [] : g));
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
    if (!kind || !['crates', 'pour', 'slide', 'stoke'].includes(kind)) return;
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
    switch (e.code) {
      case 'KeyI':
        if (down) this.inv.toggle();
        break;
      case 'KeyC':
        if (down) this.craft.toggle();
        break;
      case 'KeyJ':
        if (down) this.questLog.toggle();
        break;
      case 'KeyT':
        if (down && this.target?.kind === 'giver') this.questLog.open();
        break;
      case 'Escape':
        if (down) for (const p of [this.inv, this.craft, this.questLog]) p.close();
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
    else this.cancelHold(true, 'gather');
    return true;
  }

  /** E or the prompt pressed or released: start a gather on the node in reach, or stop the hold. */
  private press(down: boolean, toggle: boolean): void {
    const t = this.target;
    if (t?.kind === 'giver') {
      if (down) this.questLog.open();
      return;
    }
    if (toggle && this.hold) return this.cancelHold(true);
    if (!down) return this.cancelHold(true, 'gather');
    if (!t || this.hold || this.feed.dead()) return;
    const res = RES[t.resource];
    if (res?.tool && !this.has(res.tool)) return;
    this.begin('gather', t.id, (res?.gatherS ?? 3) * 1000);
  }

  private toggleCraft(recipeId: string): void {
    if (this.hold?.action === 'craft' && this.hold.targetId === recipeId) return this.cancelHold(true);
    if (this.hold || this.feed.dead()) return;
    this.begin('craft', recipeId, (RECIPES[recipeId]?.craftS ?? 3) * 1000);
  }

  private begin(action: 'gather' | 'craft', targetId: string, castMs: number): void {
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

  private cancelHold(send: boolean, only?: 'gather' | 'craft'): void {
    const h0 = this.hold;
    if (!h0 || (only && h0.action !== only)) return;
    this.hold = null;
    if (send) {
      this.feed.hold(h0.action, h0.targetId, false);
      this.say(C[h0.action === 'gather' ? 'toast.gather.cancel' : 'toast.craft.cancel']);
    }
  }

  private progress(): number {
    return this.hold ? Math.min(1, (performance.now() - this.hold.since) / this.hold.castMs) : 0;
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
    const live = WORLD_PHASES.has(clock.phase) && !this.feed.dead() && !this.asleep;
    this.root.hidden = !live || this.asleep;
    if (this.toastUntil > 0 && performance.now() > this.toastUntil) {
      this.toastEl.hidden = true;
      this.toastUntil = 0;
    }
    if (!live) return this.cancelHold(false);
    const me = this.self();
    this.target = me ? this.pick(me, nodes) : null;
    this.runHold(me, nodes);
    this.drawPrompt();
    // Each open panel redraws only when what it shows changed.
    for (const p of [this.inv, this.craft, this.questLog]) p.update();
  }

  private pick(me: { x: number; y: number }, nodes: readonly NodeSnap[]): Target | null {
    const ns = nearest(
      me,
      nodes.filter((n) => n.active),
    );
    const gs = nearest(
      me,
      this.givers.map((g) => ({ x: (g.x + 0.5) * TILE_PX, y: (g.y + 0.5) * TILE_PX, npc: g.npc })),
    );
    const dn = ns ? Math.hypot(me.x - ns.x, me.y - ns.y) : Infinity;
    const dg = gs ? Math.hypot(me.x - gs.x, me.y - gs.y) : Infinity;
    if (ns && dn <= dg) return { kind: 'node', id: ns.id, resource: ns.resource, x: ns.x, y: ns.y };
    return gs ? { kind: 'giver', npc: gs.npc, x: gs.x, y: gs.y } : null;
  }

  /** Ends a hold that finished (the pockets changed), lost its node or was left (the player moved). */
  private runHold(me: { x: number; y: number } | null, nodes: readonly NodeSnap[]): void {
    const hd = this.hold;
    if (!hd) return;
    const moved = !me || Math.hypot(me.x - hd.x, me.y - hd.y) > 3;
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

  private drawPrompt(): void {
    const text = this.hold ? C['prompt.gather.cancel'] : promptFor(this.target, (item) => this.has(item));
    this.prompt.hidden = text === null;
    const label = this.prompt.firstElementChild as HTMLElement;
    if (label.textContent !== (text ?? '')) label.textContent = text ?? '';
    this.bar.style.width = `${Math.round(this.progress() * 100)}%`;
    this.prompt.dataset.kind = this.hold ? 'hold' : (this.target?.kind ?? '');
  }

  destroy(): void {
    this.gone = true;
    this.cancelHold(false);
    this.modal?.close();
    for (const off of this.offs) off();
    for (const p of [this.inv, this.craft, this.questLog]) p.destroy();
    this.root.remove();
  }
}
