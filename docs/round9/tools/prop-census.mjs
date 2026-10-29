#!/usr/bin/env node
// Round 9 prop census. Reads packages/content/data/scenes/*.json (never the *.nav.json files) and
// prints the count of props per kind and per id-stem, plus the other placed things the logic table
// must account for (nodes, spots, portals). Writes nothing.
//
//   node docs/round9/tools/prop-census.mjs            counts per kind and stem; totals must be 605
//   node docs/round9/tools/prop-census.mjs --audit    the proposed decision per stem (logic-table.md 5); fails on an unmapped stem
//   node docs/round9/tools/prop-census.mjs --nodes    each resource node against the nearest prop (logic-table.md 7)
//   node docs/round9/tools/prop-census.mjs --areas    floor area and container counts per scene (logic-table.md 6)
//   node docs/round9/tools/prop-census.mjs --json     the counts as JSON
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '..', '..', 'packages', 'content', 'data', 'scenes');
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.nav.json')).sort();

/** Kinds the sim reads today (routines.json activities + MapSites); every other kind is inert. */
const routines = JSON.parse(readFileSync(join(dir, '..', 'routines.json'), 'utf8'));
const live = new Set(Object.values(routines.activities).flatMap((a) => a.kinds));
const ignored = new Set(routines.ignore);

const byKind = new Map();
const byStem = new Map();
const byScene = new Map();
let total = 0;
let nodes = 0;
let spots = 0;
let portals = 0;
const nodeByResource = new Map();

const bump = (m, k, scene) => {
  const e = m.get(k) ?? { n: 0, scenes: new Set() };
  e.n += 1;
  e.scenes.add(scene);
  m.set(k, e);
};

for (const f of files) {
  const s = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  for (const p of s.props) {
    total += 1;
    bump(byKind, p.kind, s.id);
    // id is `<prefix>.<name>`; the stem is the name minus a trailing _<n> / <n>.
    const name = p.id.split('.')[1] ?? p.id;
    const stem = name.replace(/_?\d+$/, '');
    bump(byStem, `${p.kind}\t${stem}`, s.id);
    byScene.set(s.id, (byScene.get(s.id) ?? 0) + 1);
  }
  for (const n of s.nodes ?? []) {
    nodes += 1;
    nodeByResource.set(n.resource, (nodeByResource.get(n.resource) ?? 0) + 1);
  }
  spots += s.spots.length;
  portals += s.portals.length;
}

const rows = (m) => [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
const status = (kind) => (live.has(kind) ? 'read' : ignored.has(kind) ? 'ignored' : 'unlisted');

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({
      total,
      kinds: Object.fromEntries(rows(byKind).map(([k, v]) => [k, v.n])),
      stems: Object.fromEntries(rows(byStem).map(([k, v]) => [k, v.n])),
    }),
  );
  process.exit(0);
}

console.log(`scenes: ${files.length}`);
console.log(`\n== props per kind (routines.json status: read | ignored | unlisted) ==`);
let sumKind = 0;
for (const [k, v] of rows(byKind)) {
  sumKind += v.n;
  console.log(`${String(v.n).padStart(4)}  ${k.padEnd(18)} ${status(k).padEnd(9)} ${v.scenes.size} scene(s)`);
}
console.log(`${String(sumKind).padStart(4)}  TOTAL (kinds)`);

console.log(`\n== props per kind + id-stem ==`);
let sumStem = 0;
for (const [k, v] of rows(byStem)) {
  sumStem += v.n;
  const [kind, stem] = k.split('\t');
  console.log(`${String(v.n).padStart(4)}  ${kind.padEnd(18)} ${stem.padEnd(24)} ${v.scenes.size} scene(s)`);
}
console.log(`${String(sumStem).padStart(4)}  TOTAL (stems)`);

const decor = (byKind.get('dressing')?.n ?? 0) + (byKind.get('decor')?.n ?? 0);
console.log(`\n== check ==`);
console.log(`props: ${total} (kinds sum ${sumKind}, stems sum ${sumStem})`);
console.log(`dressing + decor: ${decor}`);
console.log(`resource nodes: ${nodes} ${JSON.stringify(Object.fromEntries(nodeByResource))}`);
console.log(`spots: ${spots}  portals: ${portals}`);
if (total !== sumKind || total !== sumStem) {
  console.error('MISMATCH between totals');
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------
// Optional reports. They re-read the scenes; nothing above depends on them.
// ---------------------------------------------------------------------------------------------------------
const scenes = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const stemOf = (p) => (p.id.split('.')[1] ?? p.id).replace(/_?\d+$/, '');

/**
 * The decision per placed thing (logic-table.md 5), read from the census of `interactions.json` since round 10 (A9),
 * whose validator fails a prop with no decision. Four values:
 *   live       the sim or the economy already reads the kind; the logic table only formalises it
 *   interact   a tool, a station or a bare-hands verb does something to it
 *   container  it holds loot drawn from a table (search, pry or pick)
 *   keep       decoration, on purpose (cover, a sight-line, a light, a room's identity)
 * A `dressing` or `decor` stem is looked up by stem; every other kind is looked up by kind.
 */
const census = JSON.parse(readFileSync(join(dir, '..', 'interactions.json'), 'utf8')).census;
const toMap = (lists) => {
  const m = new Map();
  for (const [d, entries] of Object.entries(lists)) for (const e of entries) for (const n of e.split(/\s+/)) m.set(n, d);
  return m;
};
const kindDecision = toMap(census.kinds);
const stemDecision = toMap(census.stems);
const decide = (p) =>
  p.kind === 'dressing' || p.kind === 'decor' ? stemDecision.get(stemOf(p)) : kindDecision.get(p.kind);

if (process.argv.includes('--audit')) {
  const tally = { live: 0, interact: 0, container: 0, keep: 0 };
  const rowsByDecision = { live: new Map(), interact: new Map(), container: new Map(), keep: new Map() };
  const unmapped = new Map();
  for (const s of scenes)
    for (const p of s.props) {
      const d = decide(p);
      const key = p.kind === 'dressing' || p.kind === 'decor' ? stemOf(p) : p.kind;
      if (!d) {
        unmapped.set(`${p.kind}/${key}`, (unmapped.get(`${p.kind}/${key}`) ?? 0) + 1);
        continue;
      }
      tally[d] += 1;
      rowsByDecision[d].set(key, (rowsByDecision[d].get(key) ?? 0) + 1);
    }
  if (unmapped.size) {
    console.error('UNMAPPED:', [...unmapped].map(([k, n]) => `${k}=${n}`).join(' '));
    process.exit(1);
  }
  for (const d of ['live', 'interact', 'container', 'keep']) {
    const r = [...rowsByDecision[d]].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    console.log(`\n== ${d}: ${tally[d]} props, ${r.length} stems/kinds ==`);
    console.log(r.map(([k, n]) => `${k} ${n}`).join(', '));
  }
  const sum = Object.values(tally).reduce((a, b) => a + b, 0);
  console.log(`\naudit total: ${sum} (${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  if (sum !== total) process.exit(1);
}

if (process.argv.includes('--areas')) {
  // Proposed active budget per scene (logic-table.md 6.2): a third of the eligible containers, at least one, none where none stand.
  const budgetOf = (eligible) => (eligible === 0 ? 0 : Math.max(1, Math.round(eligible * 0.3)));
  console.log('\nscene            profile kind      floor  props eligible budget');
  let tf = 0;
  let tc = 0;
  let tb = 0;
  for (const s of scenes) {
    const floor = s.grid.join('').split('').filter((c) => c === '.' || c === 'S').length;
    const cont = s.props.filter((p) => decide(p) === 'container').length;
    tf += floor;
    tc += cont;
    tb += budgetOf(cont);
    console.log(`${s.id.padEnd(16)} ${s.profile.padEnd(7)} ${s.kind.padEnd(9)} ${String(floor).padStart(5)} ${String(s.props.length).padStart(5)} ${String(cont).padStart(8)} ${String(budgetOf(cont)).padStart(6)}`);
  }
  console.log(`${'total'.padEnd(34)} ${String(tf).padStart(5)} ${String(total).padStart(5)} ${String(tc).padStart(8)} ${String(tb).padStart(6)}`);
}

if (process.argv.includes('--nodes')) {
  console.log('\nnode                 resource  nearest prop (stem, kind, tiles)');
  const tally = new Map();
  for (const s of scenes)
    for (const n of s.nodes ?? []) {
      let best = null;
      for (const p of s.props) {
        const d = Math.hypot(p.x - n.x, p.y - n.y);
        if (!best || d < best.d) best = { d, stem: stemOf(p), kind: p.kind };
      }
      const near = best && best.d <= 2.5 ? `${best.stem}` : 'none within 2.5';
      const k = `${n.resource} -> ${near}`;
      tally.set(k, (tally.get(k) ?? 0) + 1);
      console.log(`${n.id.padEnd(20)} ${n.resource.padEnd(9)} ${best ? `${best.stem} (${best.kind}) ${best.d.toFixed(1)}` : '-'}`);
    }
  // A node "has its prop" when a prop of a matching stem stands within 2.5 tiles.
  const MATCH = {
    timber: ['stump', 'log', 'fallen_log', 'firewood', 'woodpile'],
    stone: ['boulder', 'rock_pile', 'ore_pile', 'rubble'],
    tinOre: ['ore_pile', 'rock_pile'],
    mushroom: ['mushrooms'],
    herb: ['fern'],
    resin: ['stump', 'log', 'fallen_log'],
  };
  let anchored = 0;
  let nodeTotal = 0;
  for (const s of scenes)
    for (const n of s.nodes ?? []) {
      nodeTotal += 1;
      if (s.props.some((p) => Math.hypot(p.x - n.x, p.y - n.y) <= 2.5 && (MATCH[n.resource] ?? []).includes(stemOf(p)))) anchored += 1;
    }
  console.log(`\nnodes with a matching prop within 2.5 tiles: ${anchored} of ${nodeTotal}`);
  console.log('\nresource -> nearest prop within 2.5 tiles');
  for (const [k, n] of [...tally].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`${String(n).padStart(3)}  ${k}`);
}
