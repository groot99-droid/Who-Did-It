// A tiny DOM for the vitest runs of the main-mode screens (the client's unit tests run in plain node, with no
// jsdom): just the surface `dom.ts` `h()` and the screens touch. Test support only.

export class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, Array<() => void>>();
  readonly dataset: Record<string, string> = {};
  className = '';
  hidden = false;
  /** Inline styles a screen writes (a progress bar's width); nothing reads them back. */
  readonly style: Record<string, string> = {};
  disabled = false;
  /** The class list over `className`, the two calls the touch discs make. */
  readonly classList = {
    add: (c: string) => {
      if (!this.classList.contains(c)) this.className = `${this.className} ${c}`.trim();
    },
    remove: (c: string) => {
      this.className = this.className
        .split(' ')
        .filter((k) => k !== c)
        .join(' ');
    },
    contains: (c: string) => this.className.split(' ').includes(c),
  };
  text = '';
  parent: FakeNode | null = null;
  constructor(readonly tag: string) {}

  setAttribute(key: string, value: string): void {
    this.attrs.set(key, value);
    if (key === 'hidden') this.hidden = true;
  }
  getAttribute(key: string): string | null {
    return this.attrs.get(key) ?? null;
  }
  append(...nodes: Array<FakeNode | string>): void {
    for (const n of nodes) {
      if (typeof n === 'string') this.text += n;
      else {
        n.parent = this;
        this.children.push(n);
      }
    }
  }
  replaceChildren(...nodes: FakeNode[]): void {
    this.children.length = 0;
    this.text = '';
    this.append(...nodes);
  }
  remove(): void {
    const i = this.parent?.children.indexOf(this) ?? -1;
    if (i >= 0) this.parent?.children.splice(i, 1);
    this.parent = null;
  }
  addEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((l) => l !== fn),
    );
  }
  click(): void {
    for (const fn of this.listeners.get('click') ?? []) fn();
  }
  /** Fires `type` with `event` (a pointerdown, a keydown) on this node. */
  fire(type: string, event: unknown = {}): void {
    for (const fn of this.listeners.get(type) ?? []) (fn as (e: unknown) => void)(event);
  }
  setPointerCapture(): void {}
  get childElementCount(): number {
    return this.children.length;
  }
  /** Every descendant, depth first. */
  all(): FakeNode[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  byTestId(id: string): FakeNode | undefined {
    return this.all().find((n) => n.attrs.get('data-testid') === id);
  }
  querySelector(selector: string): FakeNode | null {
    const cls = selector.startsWith('.') ? selector.slice(1) : '';
    return this.all().find((n) => n.className.split(' ').includes(cls)) ?? null;
  }
  /** The text of the node and everything under it. */
  get content(): string {
    return this.text + this.children.map((c) => c.content).join('');
  }
}

/** Installs `document.createElement` for `h()`; returns the node factory for a screen's root. */
export function installFakeDom(): () => FakeNode {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => {
      const node = new FakeNode(tag);
      Object.defineProperty(node, 'className', { value: '', writable: true });
      return node;
    },
  };
  return () => new FakeNode('div');
}
