// Checks that every data/**/*.json file parses and is in canonical layout: two-space indent,
// a value printed on one line whenever it fits in 100 columns, a trailing newline.
// `node scripts/lint-data.mjs --write` rewrites the files in that layout.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 100;
const root = fileURLToPath(new URL("..", import.meta.url));

function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const parts = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`);
    return parts.length ? `{ ${parts.join(", ")} }` : "{}";
  }
  return JSON.stringify(value);
}

function format(value, indent, prefix, suffix) {
  const flat = inline(value);
  const isContainer = value !== null && typeof value === "object";
  if (!isContainer || indent.length + prefix.length + flat.length + suffix.length <= WIDTH) {
    return `${indent}${prefix}${flat}${suffix}`;
  }
  const inner = indent + "  ";
  const entries = Array.isArray(value)
    ? value.map((v) => ["", v])
    : Object.entries(value).map(([k, v]) => [`${JSON.stringify(k)}: `, v]);
  const lines = entries.map(([p, v], i) => format(v, inner, p, i < entries.length - 1 ? "," : ""));
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return [`${indent}${prefix}${open}`, ...lines, `${indent}${close}${suffix}`].join("\n");
}

export function formatJson(value) {
  return format(value, "", "", "") + "\n";
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : name.endsWith(".json") ? [path] : [];
  });
}

const write = process.argv.includes("--write");
let failed = 0;
for (const file of walk(join(root, "data"))) {
  const text = readFileSync(file, "utf8");
  let expected;
  try {
    expected = formatJson(JSON.parse(text));
  } catch (error) {
    console.error(`${relative(root, file)}: ${error.message}`);
    failed++;
    continue;
  }
  if (text === expected) continue;
  if (write) {
    writeFileSync(file, expected);
    console.log(`formatted ${relative(root, file)}`);
  } else {
    console.error(`${relative(root, file)}: not in canonical layout (run \`pnpm format\`)`);
    failed++;
  }
}
if (failed) process.exit(1);
