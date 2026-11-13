import { LOOK } from './config';

/** One frame of input: movement in the player's frame (forward and strafe, -1 to 1) and a look delta in radians. */
export interface InputFrame {
  forward: number;
  strafe: number;
  run: boolean;
  yaw: number;
  pitch: number;
}

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const RUN = ['ShiftLeft', 'ShiftRight'];
const HANDLED = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT]);

export function deadzone(v: number, dz: number = LOOK.deadzone): number {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return (Math.sign(v) * (a - dz)) / (1 - dz);
}

/**
 * Keyboard and mouse (pointer lock), touch (a stick on the left half, drag-to-look on the right) and the first
 * connected gamepad, read once a frame with `poll(dt)`.
 */
export class Input {
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  /** True once a touch has been seen: the HUD shows the touch hint and the stick. */
  touchSeen = false;
  onStick: ((origin: { x: number; y: number } | null, offset: { x: number; y: number }) => void) | null =
    null;

  constructor(
    private readonly surface: HTMLElement,
    private readonly stickRadius = 60,
  ) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (HANDLED.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    surface.addEventListener('click', () => {
      if (!this.touchSeen && document.pointerLockElement !== surface)
        void surface.requestPointerLock?.()?.catch?.(() => {});
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== surface) return;
      this.lookX += e.movementX * LOOK.mouse;
      this.lookY += e.movementY * LOOK.mouse;
    });
    surface.addEventListener('touchstart', (e) => this.touchStart(e), { passive: false });
    surface.addEventListener('touchmove', (e) => this.touchMove(e), { passive: false });
    surface.addEventListener('touchend', (e) => this.touchEnd(e));
    surface.addEventListener('touchcancel', (e) => this.touchEnd(e));
  }

  get locked(): boolean {
    return document.pointerLockElement === this.surface;
  }

  private touchStart(e: TouchEvent): void {
    e.preventDefault();
    this.touchSeen = true;
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth / 2 && this.stickId === null) {
        this.stickId = t.identifier;
        this.stickOrigin = { x: t.clientX, y: t.clientY };
        this.stick = { x: 0, y: 0 };
        this.onStick?.(this.stickOrigin, this.stick);
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  private touchMove(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        let dx = (t.clientX - this.stickOrigin.x) / this.stickRadius;
        let dy = (t.clientY - this.stickOrigin.y) / this.stickRadius;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          dx /= len;
          dy /= len;
        }
        this.stick = { x: dx, y: dy };
        this.onStick?.(this.stickOrigin, this.stick);
      } else if (t.identifier === this.lookId) {
        this.lookX += (t.clientX - this.lookLast.x) * LOOK.touch;
        this.lookY += (t.clientY - this.lookLast.y) * LOOK.touch;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  private touchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.stick = { x: 0, y: 0 };
        this.onStick?.(null, this.stick);
      } else if (t.identifier === this.lookId) this.lookId = null;
    }
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  poll(dt: number): InputFrame {
    let forward = (this.any(FORWARD) ? 1 : 0) - (this.any(BACK) ? 1 : 0);
    let strafe = (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0);
    let run = this.any(RUN);
    forward -= this.stick.y;
    strafe += this.stick.x;
    // A stick pushed nearly all the way runs.
    if (Math.hypot(this.stick.x, this.stick.y) > 0.95) run = true;

    let yaw = this.lookX;
    let pitch = this.lookY;
    this.lookX = 0;
    this.lookY = 0;

    const pad = firstGamepad();
    if (pad) {
      strafe += deadzone(pad.axes[0] ?? 0);
      forward -= deadzone(pad.axes[1] ?? 0);
      yaw += deadzone(pad.axes[2] ?? 0) * LOOK.stick * dt;
      pitch += deadzone(pad.axes[3] ?? 0) * LOOK.stick * dt;
      // Left-stick click or either trigger runs.
      if (
        pad.buttons[10]?.pressed ||
        (pad.buttons[6]?.value ?? 0) > 0.5 ||
        (pad.buttons[7]?.value ?? 0) > 0.5
      )
        run = true;
    }
    return { forward: clamp1(forward), strafe: clamp1(strafe), run, yaw, pitch };
  }
}

function clamp1(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function firstGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) if (pad?.connected) return pad;
  return null;
}
