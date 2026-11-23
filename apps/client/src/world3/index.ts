// The sprite world's entry (round 11, R1; DECISIONS A618). Reached only by the World scene's dynamic `import()` behind
// `?render=sprite`, so a default load never fetches Three.js. It lays its canvas under the Phaser canvas, which keeps
// drawing the figures and every view R5 has not ported yet, and the DOM overlay HUD above both.
import type Phaser from 'phaser';
import type { SceneMap, TiledMap } from '../view/sceneMap';
import type { StaticDef } from '../view/statics';
import { phaserArt } from './art';
import { buildScene, readSpawns } from './build';
import { type Heading, northAngle } from './frame';
import { SpriteWorld } from './SpriteWorld';

/**
 * The keys that turn the camera a quarter turn (R2): `,` one way and `.` the other. _Proposed_: they sit outside the
 * action table (`input/actions.ts`, the trifold card) until the sprite world leaves its flag.
 */
export const TURN_KEYS: Readonly<Record<string, 1 | -1>> = { Comma: -1, Period: 1 };

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement ||
  t instanceof HTMLTextAreaElement ||
  (t instanceof HTMLElement && t.isContentEditable);

export interface SpriteWorldHandle {
  /** Draws a frame matching the Phaser camera; call once per World update. */
  frame(cam: Phaser.Cameras.Scene2D.Camera): void;
  setShown(id: string, shown: boolean): void;
  setHidden(hidden: boolean): void;
  destroy(): void;
}

export function mountSpriteWorld(
  under: HTMLCanvasElement,
  textures: Phaser.Textures.TextureManager,
  map: SceneMap,
  tiled: TiledMap,
  defs: StaticDef[],
  heading: Heading = 0,
  onHeading: (heading: Heading) => void = () => {},
): SpriteWorldHandle {
  const art = phaserArt(textures);
  const world = new SpriteWorld(
    buildScene(map, readSpawns(tiled), defs, (atlas, frame) => art(atlas, frame) !== null),
    art,
    heading,
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );
  const canvas = world.canvas;
  const before = { position: under.style.position, zIndex: under.style.zIndex };
  under.style.position = 'relative';
  under.style.zIndex = '1';
  canvas.style.position = 'absolute';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';
  under.parentElement?.insertBefore(canvas, under);

  // Q5: a small compass at the canvas's top right, under the settings button; its needle is world north on the ground.
  const compass = document.createElement('div');
  compass.className = 'wdi-compass';
  compass.setAttribute('aria-hidden', 'true');
  compass.dataset.heading = String(heading);
  compass.style.cssText =
    'position:absolute;width:32px;height:32px;border-radius:50%;z-index:2;pointer-events:none;' +
    'background:rgba(20,18,16,.55);box-shadow:0 0 0 1px rgba(255,255,255,.35) inset;';
  const needle = document.createElement('div');
  needle.style.cssText =
    'position:absolute;left:50%;top:50%;width:0;height:0;margin:-12px 0 0 -4px;' +
    'border:solid transparent;border-width:0 4px 12px;border-bottom-color:#e8d9b0;transform-origin:4px 12px;';
  compass.append(needle);
  under.parentElement?.insertBefore(compass, under.nextSibling);

  let hidden = false;
  const keydown = (e: KeyboardEvent): void => {
    const step = TURN_KEYS[e.code];
    if (step === undefined || hidden || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target))
      return;
    const h = world.turn(step);
    compass.dataset.heading = String(h);
    onHeading(h);
  };
  window.addEventListener('keydown', keydown);

  return {
    frame(cam) {
      canvas.style.left = `${under.offsetLeft}px`;
      canvas.style.top = `${under.offsetTop}px`;
      canvas.style.width = `${under.clientWidth}px`;
      canvas.style.height = `${under.clientHeight}px`;
      world.render(cam.worldView, cam.zoom, under.clientWidth, under.clientHeight);
      compass.style.left = `${under.offsetLeft + under.clientWidth - 44}px`;
      compass.style.top = `${under.offsetTop + 64}px`; // under the HUD's settings button
      needle.style.transform = `rotate(${northAngle(world.drawnYaw)}deg)`;
    },
    setShown: (id, shown) => world.setShown(id, shown),
    setHidden(hide) {
      hidden = hide;
      canvas.style.visibility = hide ? 'hidden' : '';
      compass.style.visibility = hide ? 'hidden' : '';
    },
    destroy() {
      window.removeEventListener('keydown', keydown);
      compass.remove();
      world.destroy();
      under.style.position = before.position;
      under.style.zIndex = before.zIndex;
    },
  };
}
