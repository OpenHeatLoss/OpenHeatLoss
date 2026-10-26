// scripts/b25_check_params.mjs
//
// Static check of designParams.update in server/database.js — a positional
// UPDATE where an off-by-one does not throw, it writes values into the wrong
// columns. Reads database.js as TEXT; never requires it, never connects.
//
// Checks:
//   - highest $n in the SQL === number of entries in the params array
//   - every $1..$max is used, and the WHERE uses the last one
//   - prints $n → column → data field, so the mapping can be eyeballed
//
// Runs the same scratch-DB guard as the other B25 scripts for consistency.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { assertScratchUrl } from './lib/scratchDbGuard.mjs';

assertScratchUrl();

const src = readFileSync(new URL('../server/database.js', import.meta.url), 'utf8');

// Isolate `update: (projectId, data) => runQuery(` … up to the end of the designParams object.
const start = src.indexOf('update: (projectId, data) => runQuery(`', src.indexOf('const designParams = {'));
const end   = src.indexOf('\n};', start);
if (start < 0 || end < 0) throw new Error('Could not locate designParams.update in database.js');
const body = src.slice(start + 'update: '.length, end).trim().replace(/,\s*$/, '');

// Evaluate the function with runQuery replaced by a capture, and `data` as a
// Proxy that returns a marker naming the field read. Expressions such as
// `x ? 1 : 0` or JSON.stringify(...) still show which field they came from.
const fn = vm.runInNewContext(`(${body})`, {
  runQuery: (sql, params) => ({ sql, params }),
  JSON,
});
const data = new Proxy({}, { get: (_, key) => `«${String(key)}»` });
const { sql, params } = fn('«projectId»', data);

const used = [...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1]));
const max  = Math.max(...used);
const unique = new Set(used);
const missing = [];
for (let i = 1; i <= max; i++) if (!unique.has(i)) missing.push(i);

// Column for each $n: the nearest preceding "column =" assignment. The
// lookbehind skips casts used in comparisons, e.g. "$53::text = 'estimated'".
const columnFor = {};
const assignRe = /(?<![:\w])(\w+)\s*=\s*/g;
for (const m of sql.matchAll(/\$(\d+)/g)) {
  const before = sql.slice(0, m.index);
  let col = null;
  for (const a of before.matchAll(assignRe)) col = a[1];
  columnFor[m[1]] ??= col;
}

const fieldOf = (v) => {
  const s = String(v);
  const hit = s.match(/«(\w+)»/);
  return hit ? hit[1] : s;
};

console.log('  $n  column                        data field');
for (let i = 1; i <= max; i++) {
  console.log(`  $${String(i).padEnd(3)} ${String(columnFor[i]).padEnd(29)} ${fieldOf(params[i - 1])}`);
}

const whereN = Number(sql.match(/WHERE\s+project_id\s*=\s*\$(\d+)/)?.[1]);
const checks = [
  [`highest $n in SQL (${max}) === params.length (${params.length})`, max === params.length],
  [`no gaps in $1..$${max}${missing.length ? ' (missing ' + missing.join(', ') + ')' : ''}`, missing.length === 0],
  [`WHERE project_id uses $${whereN}, the last parameter`, whereN === max],
  [`last param is projectId`, params[max - 1] === '«projectId»'],
];
console.log('');
let ok = true;
for (const [label, pass] of checks) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`); ok &&= pass; }
process.exit(ok ? 0 : 1);
