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
  onSpawn: ((id: string) => void) | null = null;

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
    root.append(this.panel, this.hint, this.picker, this.debug, this.stickBase, this.drop);
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

  ready(spawns: string[], current: string | null): void {
    this.panel.hidden = true;
    this.hint.hidden = false;
    this.select.replaceChildren(
      ...spawns.map((id) => {
        const o = el('option', '', id);
        o.value = id;
        return o;
      }),
    );
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

  showDrop(on: boolean): void {
    this.drop.hidden = !on;
  }
}
