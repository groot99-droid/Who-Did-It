import type { WebGLRenderer } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DEFAULT_GLB_URL } from './config';

/** Where the world comes from: `?glb=<url>`, else the default constant, else nothing (the page waits for a drop). */
export function glbFromQuery(search: string, fallback: string | null = DEFAULT_GLB_URL): string | null {
  const asked = new URLSearchParams(search).get('glb');
  return asked && asked.trim() ? asked.trim() : fallback;
}

export interface Progress {
  /** 0 to 1, or null when the size is unknown. */
  fraction: number | null;
  loaded: number;
  label: string;
}

/** A GLTFLoader with the Draco, meshopt and KTX2 decoders. three resolves the Draco and Basis decoder files
 * against its own modules (`import.meta.url`), so Vite emits them with the build and nothing comes from a CDN; they
 * are only fetched when a GLB needs them. */
export function makeLoader(renderer: WebGLRenderer): GLTFLoader {
  const draco = new DRACOLoader();
  const ktx2 = new KTX2Loader().detectSupport(renderer);
  return new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
}

export function loadUrl(loader: GLTFLoader, url: string, onProgress: (p: Progress) => void): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf),
      (e) => {
        const fraction = e.lengthComputable && e.total > 0 ? e.loaded / e.total : null;
        onProgress({ fraction, loaded: e.loaded, label: 'Downloading' });
        if (fraction === 1) onProgress({ fraction: null, loaded: e.loaded, label: 'Building the world' });
      },
      (err) => reject(describeError(err, url)),
    );
  });
}

export async function loadFile(
  loader: GLTFLoader,
  file: File,
  onProgress: (p: Progress) => void,
): Promise<GLTF> {
  onProgress({ fraction: null, loaded: 0, label: `Reading ${file.name}` });
  const data = await file.arrayBuffer();
  onProgress({ fraction: null, loaded: data.byteLength, label: 'Building the world' });
  try {
    const isText = /\.gltf$/i.test(file.name);
    return await loader.parseAsync(isText ? new TextDecoder().decode(data) : data, '');
  } catch (err) {
    throw describeError(err, file.name);
  }
}

function describeError(err: unknown, source: string): Error {
  const detail = err instanceof Error ? err.message : String(err);
  return new Error(`Could not load ${source}: ${detail}`);
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
