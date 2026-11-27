import type { Object3D } from 'three';
import type { IndexArea } from './areas';
import { disposeWorld, type DisposeReport } from './dispose';
import type { Progress } from './load';
import { buildWorld, type World } from './world';

/** How an area file is read: fetched as bytes, then parsed (load.ts in the page; a test reads from memory). */
export interface AreaIo {
  /** The file's bytes; rejects with an error that names the file. `expectedBytes` is the index's size, for the
   * progress when the server sends no length (0 when unknown). */
  fetch(url: string, expectedBytes: number, onProgress: (p: Progress) => void): Promise<ArrayBuffer>;
  /** The parsed glTF scene. */
  parse(bytes: ArrayBuffer, url: string): Promise<{ scene: Object3D }>;
}

/** The area in the page: one at a time (section 7, "One area in the scene"). */
export interface OpenArea {
  area: IndexArea;
  url: string;
  world: World;
}

/** A failed swap, and whether the area that was open still stands: a failed fetch leaves it as it was; a failed
 * parse comes after it was freed. */
export class SwapError extends Error {
  constructor(
    message: string,
    readonly stage: 'fetch' | 'parse',
  ) {
    super(message);
  }
}

export interface SwapHooks {
  onProgress?: ((p: Progress) => void) | undefined;
  /** Called with the open world just before it is freed: take it out of the scene and drop every reference to it
   * (the controller, the portal trigger, the area, the spawn). */
  release?: ((world: World) => void) | undefined;
  /** Called after the old area is freed and before the new one is parsed. */
  onFreed?: ((report: DisposeReport) => void) | undefined;
}

/**
 * Option 1 of section 7: swaps the area inside the page. The order is fixed so that two areas' textures are never
 * held at once: fetch the new file's bytes (the open area is untouched if that fails), free the open area completely
 * (geometry, materials, textures and their bitmaps, the collider and its BVH), then parse and build the new one.
 */
export class AreaSwap {
  current: OpenArea | null = null;
  /** What the last swap or close freed. */
  lastFreed: DisposeReport | null = null;
  /** Swaps done, for the debug readout. */
  swaps = 0;

  constructor(private readonly io: AreaIo) {}

  async open(area: IndexArea, url: string, hooks: SwapHooks = {}): Promise<OpenArea> {
    const progress = hooks.onProgress ?? (() => {});
    let bytes: ArrayBuffer;
    try {
      bytes = await this.io.fetch(url, area.bytes, progress);
    } catch (err) {
      throw new SwapError(err instanceof Error ? err.message : String(err), 'fetch');
    }
    const freed = this.close(hooks.release);
    if (freed) hooks.onFreed?.(freed);
    progress({ fraction: null, loaded: bytes.byteLength, label: 'Building the world' });
    let world: World;
    try {
      const { scene } = await this.io.parse(bytes, url);
      world = buildWorld(scene, scene.userData as Record<string, unknown>);
    } catch (err) {
      throw new SwapError(err instanceof Error ? err.message : String(err), 'parse');
    }
    this.current = { area, url, world };
    this.swaps++;
    return this.current;
  }

  /** Frees the open area, after `release` has taken it out of the page. Null when none is open. */
  close(release?: (world: World) => void): DisposeReport | null {
    const open = this.current;
    if (!open) return null;
    release?.(open.world);
    this.current = null;
    this.lastFreed = disposeWorld(open.world);
    return this.lastFreed;
  }
}
