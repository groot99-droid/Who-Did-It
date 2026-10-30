// Builds index.html (the clickable role-card and Daybook mock, docs/round10/rolecards.md) from index.src.html and
// the shipped content: every role, ability, item, look and number the mock shows is read from packages/content/data
// here, so the mock cannot drift from the data. Run from the repo root: `node docs/round10/samples/rolecards/build-mock.mjs`.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '../../../../packages/content/data');
const read = (name) => JSON.parse(readFileSync(join(data, `${name}.json`), 'utf8'));

const looks = read('looks');
const content = {
  roles: read('roles'),
  abilities: read('abilities'),
  items: read('items'),
  balance: read('balance'),
  clues: read('clues'),
  tasks: read('tasks'),
  quests: read('quests'),
  economy: read('economy'),
  vendettas: read('vendettas'),
  looks: Object.fromEntries(Object.entries(looks.looks).map(([id, l]) => [id, { name: l.name, role: l.role }])),
};

const src = readFileSync(join(here, 'index.src.html'), 'utf8');
const marker = '/*@CONTENT@*/';
if (!src.includes(marker)) throw new Error(`index.src.html has no ${marker}`);
const out = src.replace(marker, `const CONTENT = ${JSON.stringify(content)};`);
writeFileSync(join(here, 'index.html'), out);
console.log(`index.html: ${(out.length / 1024).toFixed(1)} KiB`);
