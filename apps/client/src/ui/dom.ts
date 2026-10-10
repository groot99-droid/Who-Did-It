type Attr = string | number | boolean | EventListener | null | undefined;
type Child = Node | string | null | false | undefined;

/** Tiny element factory; attributes starting with `on` are event listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, Attr> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = String(value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === false || child === undefined) continue;
    el.append(child);
  }
  return el;
}

export function overlayRoot(): HTMLElement {
  const root = document.getElementById('overlay');
  if (root === null) throw new Error('#overlay missing from index.html');
  return root;
}

/** A screen mounted into the overlay; `destroy` removes its DOM and listeners. */
export interface Screen {
  destroy(): void;
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
