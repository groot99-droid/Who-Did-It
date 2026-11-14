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
  onSpawn: ((id: string) => void) | null = null;
  onUse: (() => void) | null = null;

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

  /** Fades to black, runs `midway`, and fades back. */
  async fade(midway: () => void, ms = 180): Promise<void> {
    const wait = () => new Promise((r) => setTimeout(r, ms));
    this.fader.classList.add('on');
    await wait();
    midway();
    this.fader.classList.remove('on');
    await wait();
  }

  /** The door prompt near a portal: a button on touch, a key hint otherwise; null hides it. */
  setDoor(label: string | null, touch: boolean): void {
    this.door.hidden = label === null;
    if (label !== null) this.door.textContent = touch ? `Enter ${label}` : `E · enter ${label}`;
  }

  showDrop(on: boolean): void {
    this.drop.hidden = !on;
  }
}
