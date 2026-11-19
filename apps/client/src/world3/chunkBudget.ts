// The `three` chunk's budget (round 11, R1; DECISIONS A618): at or under 160 kB gzip, and never in the default load.
// Pure, so the build's plugin (`vite.config.ts`) and a unit test share it.

/** The `three` chunk's gzip cap in bytes (A618: measured 134 kB, budget 160 kB). */
export const THREE_GZIP_MAX = 160_000;

export interface ChunkInfo {
  fileName: string;
  name: string;
  isEntry: boolean;
  /** Files this chunk imports statically. */
  imports: string[];
}

/** Every chunk a default load fetches: the entries and what they import statically, transitively. */
export function staticClosure(chunks: ChunkInfo[]): Set<string> {
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const seen = new Set<string>();
  const stack = chunks.filter((c) => c.isEntry).map((c) => c.fileName);
  while (stack.length > 0) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...(byFile.get(f)?.imports ?? []));
  }
  return seen;
}

/** Why the build breaks the budget, or null: no `three` chunk, one over the cap, or one a default load fetches. */
export function threeChunkProblem(
  chunks: ChunkInfo[],
  gzipBytes: (fileName: string) => number,
): string | null {
  const three = chunks.find((c) => c.name === 'three');
  if (!three) return 'no `three` chunk: the sprite world must load Three.js in its own chunk';
  const size = gzipBytes(three.fileName);
  if (size > THREE_GZIP_MAX)
    return `the three chunk is ${size} B gzip, over the ${THREE_GZIP_MAX} B budget (A618)`;
  if (staticClosure(chunks).has(three.fileName)) return 'a default load imports the three chunk (A618)';
  return null;
}
