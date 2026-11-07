import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Round 10, 10Y (DECISIONS A414): docs/UI.md 14 is the copy deck and the code reads from it, so a table row that
// names one key must give that key's line as the client holds it. Every table of UI.md 14 whose first cell is one
// backticked key (`toast.dusk`) is checked: the key exists in a module of this folder and one of the row's other cells
// is its text, verbatim. A row that names several keys, or a text that a sentence describes rather than quotes, is
// not checked; a line that moved to a later section is written there, not left in its old table.

/** The copy modules of this folder, eagerly; the tests beside them are left out so they do not run twice. */
const modules = import.meta.glob<Record<string, unknown>>(['./*.ts', '!./*.test.ts'], { eager: true });

/** Every copy line of this folder by key: a key held by more than one module (`settings.title`) keeps every text. */
function copyLines(): Map<string, Set<string>> {
  const lines = new Map<string, Set<string>>();
  for (const mod of Object.values(modules)) {
    for (const value of Object.values(mod)) {
      if (typeof value !== 'object' || value === null) continue;
      for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
        if (typeof text !== 'string' || !/^[a-z][\w-]*(?:\.[\w-]+)+$/.test(key)) continue;
        const set = lines.get(key) ?? new Set<string>();
        set.add(text);
        lines.set(key, set);
      }
    }
  }
  return lines;
}

interface Row {
  section: string;
  line: number;
  key: string;
  cells: string[];
}

/** The single-key table rows of UI.md 14, with the section they sit in and their line number. */
function deckRows(): Row[] {
  const text = readFileSync(new URL('../../../../../docs/UI.md', import.meta.url), 'utf8');
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## 14. '));
  expect(start, 'UI.md has a section 14').toBeGreaterThanOrEqual(0);
  const rows: Row[] = [];
  let section = '14';
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^## /.test(line)) break;
    const heading = /^### (14\.\d+)/.exec(line);
    if (heading) section = heading[1]!;
    if (!line.startsWith('|')) continue;
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    const key = /^`([a-z][\w-]*(?:\.[\w-]+)+)`$/.exec(cells[0] ?? '');
    if (!key) continue;
    rows.push({ section, line: i + 1, key: key[1]!, cells: cells.slice(1) });
  }
  return rows;
}

describe('UI.md 14 and the copy modules', () => {
  const lines = copyLines();
  const rows = deckRows();

  it('reads the deck', () => {
    expect(lines.size).toBeGreaterThan(500);
    expect(rows.length).toBeGreaterThan(500);
  });

  it('names only keys the client holds', () => {
    const unknown = rows.filter((r) => !lines.has(r.key)).map((r) => `${r.section} line ${r.line}: ${r.key}`);
    expect(unknown, 'rows whose key no copy module holds').toEqual([]);
  });

  it('gives each line as the client says it', () => {
    const drift = rows
      .filter((r) => lines.has(r.key) && !r.cells.some((c) => lines.get(r.key)!.has(c)))
      .map((r) => `${r.section} line ${r.line}: ${r.key} is ${JSON.stringify([...lines.get(r.key)!])}`);
    expect(drift, 'rows whose text is not the client line').toEqual([]);
  });
});
