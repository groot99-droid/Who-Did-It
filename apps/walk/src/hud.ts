import { formatBytes, type Progress } from './load';

const DESKTOP_HINT = 'Click to look around · WASD or arrows to walk · Shift to run · Esc frees the mouse';
const TOUCH_HINT = 'Left thumb walks (push far to run) · drag on the right to look';
const PAD_HINT = 'Left stick walks · right stick looks · a trigger runs';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** The DOM overlay: loading panel, error, controls hint, spawn picker, FPS readout (debug) and the touch stick. */
export class Hud {
  private readonly panel = el('div', 'panel');
  private readonly title = el('h1', '', 'HollowMere');
  private readonly status = el('p', 'status');
  private readonly bar = el('div', 'bar');
  private readonly fill = el('div', 'fill');
  private readonly hint = el('div', 'hint');
  private readonly picker = el('label', 'picker');
  private readonly select = el('select', '');
  private readonly debug = el('div', 'debug');
  private readonly stickBase = el('div', 'stick');
  private readonly stickKnob = el('div', 'knob');
  private readonly drop = el('div', 'drop', 'Drop a .glb to walk it');
  private readonly fader = el('div', 'fade');
  private readonly door = el('button', 'door');
  private readonly notice = el('div', 'notice');
  private readonly mode = el('div', 'mode');
  /** The lantern's toggle and hint, in the caves. */
  private readonly lantern = el('button', 'lantern');
  private lanternText: string | null = null;
  /** The loading hint of a crossing, above the ink. */
  private readonly hold = el('div', 'loading');
  private modeText: string | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  onSpawn: ((id: string) => void) | null = null;
  onUse: (() => void) | null = null;
  onLantern: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    readonly debugOn: boolean,
  ) {
    this.bar.append(this.fill);
    this.panel.append(this.title, this.status, this.bar);
    this.picker.append(el('span', '', 'Spawn '), this.select);
    this.stickBase.append(this.stickKnob);
    this.picker.hidden = true;
    this.debug.hidden = !debugOn;
    this.hint.hidden = true;
    this.stickBase.hidden = true;
    this.drop.hidden = true;
    this.door.hidden = true;
    this.notice.hidden = true;
    this.mode.hidden = true;
    this.hold.hidden = true;
    this.lantern.hidden = true;
    this.lantern.type = 'button';
    this.lantern.addEventListener('click', () => {
      this.onLantern?.();
      this.lantern.blur();
    });
    this.door.type = 'button';
    this.door.addEventListener('click', () => this.onUse?.());
    root.append(
      this.panel,
      this.hint,
      this.picker,
      this.debug,
      this.stickBase,
      this.drop,
      this.fader,
      this.door,
      this.notice,
      this.mode,
      this.hold,
      this.lantern,
    );
    this.select.addEventListener('change', () => {
      this.onSpawn?.(this.select.value);
      this.select.blur();
    });
  }

  waiting(message: string): void {
    this.panel.hidden = false;
    this.panel.classList.remove('error');
    this.status.textContent = message;
    this.bar.hidden = true;
  }

  progress(p: Progress): void {
    this.panel.hidden = false;
    this.panel.classList.remove('error');
    this.bar.hidden = false;
    const size = p.loaded > 0 ? ` · ${formatBytes(p.loaded)}` : '';
    const pct = p.fraction === null ? '' : ` ${Math.round(p.fraction * 100)}%`;
    this.status.textContent = `${p.label}${pct}${size}`;
    this.bar.classList.toggle('busy', p.fraction === null);
    this.fill.style.width = p.fraction === null ? '100%' : `${Math.round(p.fraction * 100)}%`;
  }

  error(message: string): void {
    this.panel.hidden = false;
    this.panel.classList.add('error');
    this.bar.hidden = true;
    this.status.textContent = `${message} · Drop a .glb on the page or open it with ?glb=<url>.`;
  }

  /** Fills the spawn picker, grouped by district when the spawns have one. */
  ready(
    spawns: readonly { id: string; label: string; name?: string; group?: string }[],
    current: string | null,
  ): void {
    this.panel.hidden = true;
    this.hint.hidden = false;
    const grouped = spawns.some((s) => s.group);
    const groups = new Map<string, HTMLElement>();
    this.select.replaceChildren();
    for (const s of spawns) {
      const o = el('option', '', grouped ? (s.name ?? s.label) : s.label);
      o.value = s.id;
      if (!grouped) {
        this.select.append(o);
        continue;
      }
      const key = s.group || 'Other';
      let g = groups.get(key);
      if (!g) {
        g = el('optgroup', '');
        (g as HTMLOptGroupElement).label = key;
        groups.set(key, g);
        this.select.append(g);
      }
      g.append(o);
    }
    if (current) this.select.value = current;
    this.picker.hidden = spawns.length === 0;
  }

  setHint(kind: 'desktop' | 'touch' | 'pad', locked: boolean): void {
    const text = kind === 'touch' ? TOUCH_HINT : kind === 'pad' ? PAD_HINT : DESKTOP_HINT;
    this.hint.textContent = text;
    this.hint.classList.toggle('dim', kind === 'desktop' && locked);
  }

  setDebug(lines: string[]): void {
    if (this.debugOn) this.debug.textContent = lines.join('\n');
  }

  setStick(origin: { x: number; y: number } | null, offset: { x: number; y: number }, radius: number): void {
    this.stickBase.hidden = origin === null;
    if (!origin) return;
    this.stickBase.style.left = `${origin.x}px`;
    this.stickBase.style.top = `${origin.y}px`;
    this.stickKnob.style.transform = `translate(${offset.x * radius}px, ${offset.y * radius}px)`;
  }

  /** Shows the spawn the player is at in the picker. */
  setSpawn(id: string | null): void {
    if (id) this.select.value = id;
  }

  /** Fades to ink, runs `midway` (and waits for it), and fades back. */
  async fade(midway: () => void | Promise<void>, ms = 180): Promise<void> {
    await this.cover(ms);
    try {
      await midway();
    } finally {
      await this.uncover(ms);
    }
  }

  /** Fades to ink over `ms` and stays there (a crossing; a page load that leaves the ink up until it is gone). */
  async cover(ms = 180): Promise<void> {
    this.fader.style.transitionDuration = `${ms}ms`;
    this.fader.classList.add('on');
    await new Promise((r) => setTimeout(r, ms));
  }

  /** Lifts the ink over `ms`. */
  async uncover(ms = 180): Promise<void> {
    this.fader.style.transitionDuration = `${ms}ms`;
    this.fader.classList.remove('on');
    await new Promise((r) => setTimeout(r, ms));
  }

  /** The loading hint above the ink during a crossing that takes a while; null hides it. */
  loading(text: string | null): void {
    this.hold.hidden = text === null;
    this.hold.textContent = text ?? '';
  }

  /** A short line in the middle of the screen, gone after `ms`. */
  say(text: string, ms = 2500): void {
    this.notice.textContent = text;
    this.notice.hidden = false;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice.hidden = true), ms);
  }

  /** The line `say` shows, while it shows; else null. */
  get noticeText(): string | null {
    return this.notice.hidden ? null : this.notice.textContent;
  }

  /** The door prompt near a portal: a button on touch, a key hint otherwise; null hides it. */
  setDoor(label: string | null, touch: boolean): void {
    this.door.hidden = label === null;
    if (label !== null) this.door.textContent = touch ? `Enter ${label}` : `E · enter ${label}`;
  }

  showDrop(on: boolean): void {
    this.drop.hidden = !on;
  }

  /** The lantern's button where the walker carries one (null hides it): its state and the key that toggles it. */
  setLantern(on: boolean | null, kind: 'desktop' | 'touch' | 'pad'): void {
    const key = kind === 'touch' ? '' : kind === 'pad' ? 'Y · ' : 'L · ';
    const text = on === null ? null : `${key}lantern ${on ? 'on' : 'off'}`;
    if (text === this.lanternText) return;
    this.lanternText = text;
    this.lantern.hidden = text === null;
    this.lantern.textContent = text ?? '';
    this.lantern.classList.toggle('off', on === false);
  }

  /** The lantern button's words while it shows; else null. */
  get lanternLabel(): string | null {
    return this.lanternText;
  }

  /** The traversal mode's word ("Crawling") for as long as it lasts; null hides it. */
  setMode(text: string | null): void {
    if (text === this.modeText) return;
    this.modeText = text;
    this.mode.hidden = text === null;
    this.mode.textContent = text ?? '';
  }
}
