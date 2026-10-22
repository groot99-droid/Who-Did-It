// Placeholder art for every key in docs/SPRITES.md 8, so playtests run before real art (ROADMAP 7.3).
// tsx tools/sprites/placeholder.ts [out dir]   (default apps/client/public/assets/placeholder)
//
// The core (art plan 1.2 item 6): it collects the stand-ins of three modules, one per art session,
// and writes them with the placeholder manifest. placeholder-world.ts is 5K's, placeholder-chars.ts 5L's
// and placeholder-onub.ts 5M's; each session edits only its own module, never this file or the kit.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFiles } from './pack.ts';
import { placeholderEntries as charsEntries } from './placeholder-chars.ts';
import type { ManifestEntry, PlaceholderEntry } from './placeholder-kit.ts';
import { placeholderEntries as m5bEntries } from './placeholder-m5b.ts';
import { placeholderEntries as onubEntries } from './placeholder-onub.ts';
import { placeholderEntries as worldEntries } from './placeholder-world.ts';

export { PALETTE, type ManifestEntry, type PlaceholderEntry, type Token } from './placeholder-kit.ts';

/** The modules, in the order that breaks a tie of `order`. */
const MODULES: ReadonlyArray<() => PlaceholderEntry[]> = [
  worldEntries,
  charsEntries,
  onubEntries,
  m5bEntries,
];

export async function generate(): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const entries: ManifestEntry[] = [];
  const stand = MODULES.flatMap((m) => m()).sort((a, b) => a.order - b.order);
  for (const s of stand) {
    for (const [path, bytes] of await s.files()) {
      if (files.has(path)) throw new Error(`placeholder: ${path} is written twice`);
      files.set(path, bytes);
    }
    entries.push(...s.entries);
  }
  const keys = entries.map((e) => e.key);
  const twice = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (twice.length) throw new Error(`placeholder: keys listed twice: ${twice.join(', ')}`);

  const doc = { version: 1, art: 'placeholder', entries };
  files.set('manifest.json', Buffer.from(`${JSON.stringify(doc, null, 2)}\n`));
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(process.argv[2] ?? join(here, '../../apps/client/public/assets/placeholder'));
  const files = await generate();
  for (const sub of new Set([...files.keys()].map((k) => dirname(k)))) {
    writeFiles(
      join(outDir, sub),
      new Map(
        [...files]
          .filter(([k]) => dirname(k) === sub)
          .map(([k, v]) => [k.slice(sub === '.' ? 0 : sub.length + 1), v]),
      ),
    );
  }
  console.log(`placeholder: ${files.size} files -> ${outDir}`);
}
