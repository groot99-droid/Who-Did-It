import balanceJson from '@wdi/content/data/balance.json';
import itemsJson from '@wdi/content/data/items.json';
import questsJson from '@wdi/content/data/quests.json';
import recipesJson from '@wdi/content/data/recipes.json';
import resourcesJson from '@wdi/content/data/resources.json';
import { TICK_RATE, TILE_PX } from '@wdi/shared';
import type { HoldAction } from '@wdi/shared/protocol';
import type { StackSnap } from '../world';
import type { MobSnap, NodeSnap, QuestSnap, TaskSnap } from '../world';

// The mock's half of M5b (round 6, 6I): nodes, gathering, crafting, quests and one wandering creature, with the
// server's rules in miniature (`apps/server/src/sim/{Resources,Craft,Quests}.ts`). `MockWorldFeed` owns an instance
// and forwards the verbs; nothing here talks to the network.

const REACH_PX = balanceJson.doors.reachTiles * TILE_PX;
const SLOTS = itemsJson.inventorySlots;
const STACK_MAX = balanceJson.resources.stackMax.material; // round 10, A12: the mock stacks materials only
const RESOURCES = resourcesJson.resources as Record<
  string,
  { id: string; gatherS: number; yield: number; respawnS: number; tool?: string }
>;
const RECIPES = recipesJson.recipes as Record<
  string,
  {
    id: string;
    out: string;
    qty: number;
    in: Array<{ item: string; qty: number }>;
    station: string | null;
    craftS: number;
  }
>;
const QUESTS = questsJson.quests as Record<
  string,
  {
    id: string;
    giver: string;
    kind: string;
    wants: Array<{ item: string; qty: number }>;
    reward: Array<{ item: string; qty: number }>;
  }
>;
const ITEMS = itemsJson.items as Record<string, { kind: string }>;

export interface MockSceneM5b {
  nodes?: Array<{ id: string; resource: string; x: number; y: number }> | undefined;
  givers?: Array<{ id: string; npc: string; x: number; y: number }> | undefined;
  props?: Array<{ kind: string; x: number; y: number }> | undefined;
}
export interface MockMe {
  scene: string;
  x: number;
  y: number;
}
export type Refusal = { code: number; msg: string } | null;

interface MockNode extends NodeSnap {
  scene: string;
  respawnAt: number;
}

export class MockM5b {
  private readonly nodeMap = new Map<string, MockNode>();
  private readonly stacks: StackSnap[] = [];
  private readonly questList: QuestSnap[] = [];
  /** Round 7 (7M): the mock's own task list; the chores panel of PR 2b seeds and reads it. */
  readonly taskList: TaskSnap[] = [];
  /** Round 7 (7M): the mock's task bar, 0 to 100. */
  taskBarPct = 0;
  private hold: { action: 'gather' | 'craft'; targetId: string; since: number; x: number; y: number } | null =
    null;
  private lit = false;
  /** One wolf-less wanderer per `?m5b=1` run, so the mob view has something to draw. */
  private mob: (MobSnap & { scene: string }) | null = null;

  constructor(
    private readonly scenes: Record<string, MockSceneM5b>,
    /** `?m5b=1`: a spade in the pocket, a kit of nodes beside `kit` and a station-free craft (the e2e path). */
    private readonly kit: { scene: string; x: number; y: number } | null,
  ) {
    for (const [scene, content] of Object.entries(scenes)) {
      for (const n of content.nodes ?? []) {
        this.nodeMap.set(n.id, {
          id: n.id,
          scene,
          resource: n.resource,
          x: (n.x + 0.5) * TILE_PX,
          y: (n.y + 0.5) * TILE_PX,
          active: true,
          respawnAt: 0,
        });
      }
    }
    if (kit) {
      this.stacks.push({ defId: 'spade', qty: 1 });
      const at = (id: string, resource: string, dx: number, dy: number) =>
        this.nodeMap.set(id, {
          id,
          scene: kit.scene,
          resource,
          x: kit.x + dx * TILE_PX,
          y: kit.y + dy * TILE_PX,
          active: true,
          respawnAt: 0,
        });
      // Spread by distance (0.5 to 1.3 tiles) so the nearest-node prompt walks them in order: tin, resin x3, timber.
      at('kit.tin', 'tinOre', 0, -0.5);
      at('kit.resin', 'resin', 0.7, 0);
      at('kit.resin2', 'resin', 0, 0.9);
      at('kit.resin3', 'resin', -1.1, 0);
      at('kit.timber', 'timber', 0.9, 0.9);
      this.mob = {
        scene: kit.scene,
        id: 'kit.mob',
        kind: 'rat',
        x: kit.x + 3 * TILE_PX,
        y: kit.y + 3 * TILE_PX,
        yaw: 0,
        animId: 0,
        state: 1,
      };
    }
  }

  nodes(scene: string): NodeSnap[] {
    return [...this.nodeMap.values()]
      .filter((n) => n.scene === scene)
      .map(({ id, resource, x, y, active }) => ({ id, resource, x, y, active }));
  }

  mobs(scene: string, tick: number): MobSnap[] {
    const m = this.mob;
    if (!m || m.scene !== scene) return [];
    const a = tick / 40;
    return [
      {
        ...m,
        x: m.x + Math.cos(a) * TILE_PX,
        y: m.y + Math.sin(a) * TILE_PX,
        yaw: a + Math.PI / 2,
        animId: 1,
      },
    ];
  }

  quests(): QuestSnap[] {
    return this.questList.map((q) => ({ ...q }));
  }

  tasks(): TaskSnap[] {
    return this.taskList.map((t) => ({ ...t }));
  }

  taskBar(): number {
    return this.taskBarPct;
  }

  inventory(): StackSnap[] {
    return this.stacks.map((s) => ({ ...s }));
  }

  /** The held hotbar slot of the mock. */
  selected = 0;

  /** Round 10 (A13): the mock keeps stacks in a list; a move re-numbers the slot, a swap trades the two. */
  invMove(from: number, to: number): void {
    this.stacks.forEach((s, i) => (s.slot ??= i)); // from here on every stack names its slot
    const at = (n: number) => this.stacks.findIndex((s) => s.slot === n);
    const a = at(from);
    if (a < 0 || from === to) return;
    const b = at(to);
    if (b >= 0) this.stacks[b] = { ...(this.stacks[b] as StackSnap), slot: from };
    this.stacks[a] = { ...(this.stacks[a] as StackSnap), slot: to };
  }

  get lanternLit(): boolean {
    return this.lit;
  }

  light(on: boolean): void {
    this.lit = on && this.stacks.some((s) => s.defId === 'lantern' || s.defId === 'torch');
  }

  private count(item: string): number {
    return this.stacks.reduce((n, s) => n + (s.defId === item ? s.qty : 0), 0);
  }

  private fits(
    takes: Array<{ item: string; qty: number }>,
    gives: Array<{ item: string; qty: number }>,
  ): boolean {
    const next = this.stacks.map((s) => ({ ...s }));
    for (const t of takes) {
      const s = next.find((x) => x.defId === t.item);
      if (!s || s.qty < t.qty) return false;
      s.qty -= t.qty;
    }
    const live = next.filter((s) => s.qty > 0);
    for (const g of gives) {
      const material = ITEMS[g.item]?.kind === 'material';
      const s = material ? live.find((x) => x.defId === g.item) : undefined;
      if (s) {
        if (s.qty + g.qty > STACK_MAX) return false;
        s.qty += g.qty;
        continue;
      }
      // A tool is one slot a piece; a material is one slot a stack.
      for (let left = g.qty; left > 0;) {
        if (live.length >= SLOTS) return false;
        const put = material ? Math.min(STACK_MAX, left) : 1;
        live.push({ defId: g.item, qty: put });
        left -= put;
      }
    }
    return true;
  }

  private exchange(
    takes: Array<{ item: string; qty: number }>,
    gives: Array<{ item: string; qty: number }>,
  ): boolean {
    if (!this.fits(takes, gives)) return false;
    for (const t of takes) this.stacks.find((s) => s.defId === t.item)!.qty -= t.qty;
    for (const g of gives) {
      const material = ITEMS[g.item]?.kind === 'material';
      const s = material ? this.stacks.find((x) => x.defId === g.item && x.qty > 0) : undefined;
      if (s) s.qty += g.qty;
      else if (material) this.stacks.push({ defId: g.item, qty: g.qty });
      else for (let i = 0; i < g.qty; i++) this.stacks.push({ defId: g.item, qty: 1 });
    }
    for (let i = this.stacks.length - 1; i >= 0; i--) if (this.stacks[i]!.qty <= 0) this.stacks.splice(i, 1);
    return true;
  }

  startHold(action: HoldAction, targetId: string, on: boolean, me: MockMe, tick: number): Refusal {
    if (action !== 'gather' && action !== 'craft') return null;
    if (!on) {
      this.hold = null;
      return null;
    }
    if (action === 'gather') {
      const n = this.nodeMap.get(targetId);
      if (!n || n.scene !== me.scene || !n.active) return { code: 422, msg: 'nothing to gather' };
      if (Math.hypot(n.x - me.x, n.y - me.y) > REACH_PX) return { code: 427, msg: 'too far' };
      const tool = RESOURCES[n.resource]?.tool;
      if (tool && this.count(tool) < 1) return { code: 422, msg: 'cannot do that' };
      if (!this.fits([], [{ item: n.resource, qty: RESOURCES[n.resource]?.yield ?? 1 }]))
        return { code: 422, msg: 'cannot do that' };
    } else {
      const r = RECIPES[targetId];
      if (!r) return { code: 422, msg: 'no such recipe' };
      if (!this.kit && r.station !== null && !this.atStation(me, r.station, this.sceneProps(me.scene)))
        return { code: 427, msg: 'needs a station' };
      if (!this.fits(r.in, [{ item: r.out, qty: r.qty }]))
        return { code: 422, msg: 'missing materials or no room' };
    }
    this.hold = { action, targetId, since: tick, x: me.x, y: me.y };
    return null;
  }

  private sceneProps(scene: string): MockSceneM5b['props'] {
    return this.scenes[scene]?.props;
  }
  private atStation(me: MockMe, kind: string, props: MockSceneM5b['props']): boolean {
    return (props ?? []).some(
      (p) =>
        p.kind === kind && Math.hypot(me.x - (p.x + 0.5) * TILE_PX, me.y - (p.y + 0.5) * TILE_PX) <= REACH_PX,
    );
  }

  /** One mock tick: respawns, and the cast of a running hold. Returns what finished, for a toast-free log. */
  step(tick: number, me: MockMe, moving: boolean): 'gather' | 'craft' | null {
    for (const n of this.nodeMap.values()) if (!n.active && tick >= n.respawnAt) n.active = true;
    const h = this.hold;
    if (!h) return null;
    if (moving || me.scene === '') {
      this.hold = null;
      return null;
    }
    if (h.action === 'gather') {
      const n = this.nodeMap.get(h.targetId);
      const res = n ? RESOURCES[n.resource] : undefined;
      if (!n || !res || !n.active || n.scene !== me.scene) {
        this.hold = null;
        return null;
      }
      if (tick - h.since < Math.round(res.gatherS * TICK_RATE)) return null;
      this.hold = null;
      this.exchange([], [{ item: res.id, qty: res.yield }]);
      n.active = false;
      n.respawnAt = tick + Math.round(res.respawnS * TICK_RATE);
      return 'gather';
    }
    const r = RECIPES[h.targetId];
    if (!r || tick - h.since < Math.round(r.craftS * TICK_RATE)) return null;
    this.hold = null;
    return this.exchange(r.in, [{ item: r.out, qty: r.qty }]) ? 'craft' : null;
  }

  private giverNear(me: MockMe, npc: string, scenes: Record<string, MockSceneM5b>): boolean {
    return (scenes[me.scene]?.givers ?? []).some(
      (g) =>
        g.npc === npc && Math.hypot(me.x - (g.x + 0.5) * TILE_PX, me.y - (g.y + 0.5) * TILE_PX) <= REACH_PX,
    );
  }

  questAccept(id: string, me: MockMe, scenes: Record<string, MockSceneM5b>): Refusal {
    const q = QUESTS[id];
    if (!q || q.kind !== 'fetch') return { code: 422, msg: 'cannot do that' };
    if (!this.giverNear(me, q.giver, scenes)) return { code: 427, msg: 'too far' };
    if (this.questList.some((s) => s.id === id)) return { code: 422, msg: 'already taken' };
    if (this.questList.filter((s) => !s.done).length >= balanceJson.quests.maxActive)
      return { code: 422, msg: 'too many quests' };
    this.questList.push({ id, progress: this.progressOf(id), done: false });
    return null;
  }

  questTurnIn(id: string, me: MockMe, scenes: Record<string, MockSceneM5b>): Refusal {
    const q = QUESTS[id];
    const s = this.questList.find((x) => x.id === id);
    if (!q || q.kind !== 'fetch') return { code: 422, msg: 'cannot do that' };
    if (!this.giverNear(me, q.giver, scenes)) return { code: 427, msg: 'too far' };
    if (!s || s.done) return { code: 422, msg: 'not taken' };
    if (q.wants.some((w) => this.count(w.item) < w.qty)) return { code: 422, msg: 'you lack what is wanted' };
    if (!this.exchange(q.wants, q.reward)) return { code: 422, msg: 'no room for the reward' };
    s.done = true;
    s.progress = q.wants.reduce((n, w) => n + w.qty, 0);
    return null;
  }

  /** Quest progress follows the inventory, as `runQuests` does. */
  refreshQuests(): void {
    for (const s of this.questList) if (!s.done) s.progress = this.progressOf(s.id);
  }

  private progressOf(id: string): number {
    return (QUESTS[id]?.wants ?? []).reduce((n, w) => n + Math.min(this.count(w.item), w.qty), 0);
  }
}
