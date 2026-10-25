// Round 9 (9T): undo and redo over whole scene documents. A scene is small, so each step keeps the document itself.
export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private now: T) {}

  get current(): T {
    return this.now;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** A new edit; it ends any redo chain. */
  push(next: T): void {
    this.past.push(this.now);
    this.now = next;
    this.future = [];
  }
  undo(): void {
    const prev = this.past.pop();
    if (prev === undefined) return;
    this.future.push(this.now);
    this.now = prev;
  }
  redo(): void {
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(this.now);
    this.now = next;
  }
}
