import Phaser from 'phaser';
import { setRoute } from '../flags';
import {
  type AdminLink,
  captureToken,
  clearToken,
  connectAdmin,
  loginUrl,
  type TokenStore,
} from '../admin/AdminNet';
import { mountControls } from '../admin/Controls';
import { AdminStore } from '../admin/model';
import { createMockAdmin } from '../admin/mockAdmin';
import { ADMIN_COPY as C } from '../ui/copy';
import { h, overlayRoot, type Screen } from '../ui/dom';
import { getFlags } from './registry';

/** The tab's session storage, or a throwaway object where the browser blocks it. */
function sessionStore(): TokenStore {
  try {
    return window.sessionStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
  }
}

/**
 * The owner's admin page (round 6, docs/round6/auto-admin.md 8), started by `Preload` on `#/admin`: the sign-in
 * button, the controls, the grid of scene viewports, the seat inspector and the log pane, all from `../admin/`.
 * `?mock=1` runs the whole page on the scripted feed of `mockAdmin.ts`; otherwise it joins the `admin` room with the
 * GitHub-login token. The scene owns the connection and the store; the panels and the viewports read the store.
 */
export class Admin extends Phaser.Scene {
  readonly store = new AdminStore();
  private link: AdminLink | null = null;
  private screens: Screen[] = [];
  private tokens: TokenStore = sessionStore();

  constructor() {
    super('Admin');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#14110f');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    if (getFlags(this).mock) {
      this.begin(createMockAdmin());
      return;
    }
    const token = captureToken(location.hash, this.tokens, () => setRoute('admin'));
    if (token === null) {
      this.showSignIn(false);
      return;
    }
    const wait = this.mount(h('p', { class: 'wdi-admin__notice', role: 'status' }, C['admin.connecting']));
    void connectAdmin(token).then(
      (link) => {
        wait.destroy();
        this.begin(link);
      },
      () => {
        wait.destroy();
        clearToken(this.tokens);
        this.showSignIn(true);
      },
    );
  }

  /** Wires a live or scripted link to the store and mounts the panels. */
  private begin(link: AdminLink): void {
    this.link = link;
    link.bus.on('snapshot', (s) => this.store.applySnapshot(s, performance.now()));
    link.bus.on('event', (e) => this.store.addEvents(e));
    link.bus.on('invariant', (f) => this.store.addFailure(f));
    link.bus.on('closed', () => {
      if (this.link !== link) return;
      this.link = null;
      this.clearScreens();
      this.showSignIn(true);
    });
    const root = this.mount(h('div', { class: 'wdi-admin' }));
    const host = root.el;
    this.screens.push(
      mountControls(
        host,
        (type, payload) => link.send(type, payload),
        this.store,
        () => this.signOut(),
      ),
    );
  }

  private showSignIn(failed: boolean): void {
    const button = h(
      'button',
      { type: 'button', class: 'wdi-admin__btn wdi-admin__btn--go', 'data-testid': 'admin-signin' },
      C['admin.signin.button'],
    );
    button.addEventListener('click', () => {
      location.href = loginUrl();
    });
    this.mount(
      h(
        'section',
        { class: 'wdi-admin__signin', 'aria-label': C['admin.title'], 'data-testid': 'admin-signin-panel' },
        h('h1', {}, C['admin.title']),
        h('p', {}, C['admin.signin.lead']),
        failed
          ? h(
              'p',
              { class: 'wdi-admin__problem', role: 'alert', 'data-testid': 'admin-signin-error' },
              C['admin.signin.failed'],
            )
          : null,
        button,
      ),
    );
  }

  private signOut(): void {
    clearToken(this.tokens);
    const link = this.link;
    this.link = null;
    link?.close();
    this.clearScreens();
    this.store.reset();
    this.showSignIn(false);
  }

  /** Puts `el` in the overlay and keeps it for teardown. */
  private mount<T extends HTMLElement>(el: T): Screen & { el: T } {
    overlayRoot().append(el);
    const screen = { el, destroy: () => el.remove() };
    this.screens.push(screen);
    return screen;
  }

  private clearScreens(): void {
    for (const s of this.screens) s.destroy();
    this.screens = [];
  }

  private teardown(): void {
    this.link?.close();
    this.link = null;
    this.clearScreens();
  }
}
