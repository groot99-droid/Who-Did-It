import type { OnubLegalAct } from '@wdi/shared/protocol';

/**
 * The waker's picks (GDD 3.11, "Must and may"): which of `view.legal` the seat is making and which slots it
 * has picked. Pure: the view renders it and `feed.act(act, targets)` sends it. A single legal act is chosen
 * at once; a pick count of 1 replaces the previous pick, a count of 2 keeps up to two distinct slots.
 */
export class ActFlow {
  private chosen: string | null = null;
  private slots: string[] = [];

  constructor(private legal: readonly OnubLegalAct[] = []) {
    this.setLegal(legal);
  }

  /** A new `view.legal` (the Tourrier's second step): the picks start over. */
  setLegal(legal: readonly OnubLegalAct[]): void {
    this.legal = legal;
    this.slots = [];
    this.chosen = legal.length === 1 ? (legal[0]?.act ?? null) : null;
  }

  get acts(): readonly OnubLegalAct[] {
    return this.legal;
  }

  get act(): OnubLegalAct | null {
    return this.legal.find((a) => a.act === this.chosen) ?? null;
  }

  get picks(): readonly string[] {
    return this.slots;
  }

  choose(actId: string): void {
    if (!this.legal.some((a) => a.act === actId) || this.chosen === actId) return;
    this.chosen = actId;
    this.slots = [];
  }

  /** Toggles a slot of the chosen act's pool; a slot outside the pool does nothing. */
  toggle(slot: string): void {
    const act = this.act;
    if (act === null || act.picks === 0 || !act.slots.includes(slot)) return;
    if (this.slots.includes(slot)) this.slots = this.slots.filter((s) => s !== slot);
    else if (act.picks === 1) this.slots = [slot];
    else if (this.slots.length < act.picks) this.slots = [...this.slots, slot];
  }

  /** The slots the seat may still tap. */
  selectable(): ReadonlySet<string> {
    const act = this.act;
    return new Set(act === null || act.picks === 0 ? [] : act.slots);
  }

  get complete(): boolean {
    const act = this.act;
    return act !== null && this.slots.length === act.picks;
  }

  /** `[abilityId, targets]` once complete. */
  send(): [string, string[]] | null {
    const act = this.act;
    return act === null || !this.complete ? null : [act.act, [...this.slots]];
  }
}
