import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AreaIo } from '../../src/session';

// What GLTFLoader needs from a browser, for Node: ProgressEvent (three's FileLoader), and createImageBitmap so that
// textures load as they do in the page (GLTFLoader takes ImageBitmapLoader when it exists). The bitmaps are stand-ins
// of the image's size that count how many are open, so a test can see `close` reach them.

if (!('ProgressEvent' in globalThis)) {
  (globalThis as Record<string, unknown>).ProgressEvent = class extends Event {
    constructor(type: string, init: { loaded?: number; total?: number } = {}) {
      super(type);
      Object.assign(this, { loaded: init.loaded ?? 0, total: init.total ?? 0 });
    }
  };
}

// GLTFLoader reads `self.URL` for every image.
if (!('self' in globalThis)) (globalThis as Record<string, unknown>).self = globalThis;

export const bitmaps = { opened: 0, closed: 0 };

/** A stand-in ImageBitmap: a size read from the PNG header, and a close that counts. */
class FakeBitmap {
  closed = false;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    bitmaps.opened++;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    bitmaps.closed++;
  }
}

if (!('createImageBitmap' in globalThis)) {
  (globalThis as Record<string, unknown>).createImageBitmap = async (blob: Blob) => {
    const head = new DataView(await blob.slice(0, 24).arrayBuffer());
    const png = head.byteLength >= 24 && head.getUint32(0) === 0x89504e47;
    return new FakeBitmap(png ? head.getUint32(16) : 1, png ? head.getUint32(20) : 1);
  };
}

/** An AreaIo that reads from a map of address to bytes (the page's is fetch and GLTFLoader.parseAsync), and counts
 * the fetches. An address not in the map fails as a missing file does. */
export function memoryIo(
  files: Map<string, Buffer>,
): AreaIo & { fetched: string[]; parsing: (() => void) | undefined } {
  const io = {
    fetched: [] as string[],
    parsing: undefined as (() => void) | undefined,
    async fetch(url: string): Promise<ArrayBuffer> {
      io.fetched.push(url);
      const key = url.split('?')[0]!;
      const buf = files.get(key);
      if (!buf) throw new Error(`Could not load ${url}: HTTP 404`);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    },
    async parse(bytes: ArrayBuffer) {
      io.parsing?.();
      const magic = new DataView(bytes).getUint32(0, true) === 0x46546c67;
      return new GLTFLoader().parseAsync(magic ? bytes : new TextDecoder().decode(bytes), '');
    },
  };
  return io;
}

/** The files of a folder on disk, keyed by their address under `base` (for the contract's test world). */
export function folderFiles(dir: URL, names: string[], base: string): Map<string, Buffer> {
  return new Map(names.map((n) => [new URL(n, base).href, readFileSync(new URL(n, dir))]));
}
