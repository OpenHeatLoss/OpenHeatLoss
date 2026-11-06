// scripts/b26_gate.mjs
//
// B26 rehearsal gate for migration 026 (MVHR efficiency percent → fraction).
// READ-ONLY: every query runs in a READ ONLY transaction and the gate never
// writes to the database. It does not run migrate.js; you do, between the two
// modes (see scripts/b26_REHEARSAL.md).
//
// Scratch DB only: refuses unless DATABASE_URL is postgres://localhost/ohl_b26_check
// (checked on the URL and again on the live connection; never reads .env).
//
// Usage:
//   node scripts/b26_gate.mjs before [--overwrite]   → scripts/out/b26_before.json
//   node scripts/b26_gate.mjs after                  → compare with that file
//
// before: snapshot every rooms and design_params row (all columns), the row
//   count of every table in the public schema, the applied schema_migrations
//   versions and each project's postcode (loadProject's externalTemp
//   auto-apply depends on it). Refuses if 026 is already applied, or if the
//   before file exists (unless --overwrite), so it can never record a
//   migrated state as "before".
//
// after: EXACT comparisons, nothing hard-coded. The rows expected to change
//   are derived from the before file (mvhr_efficiency > 1).
//   - 026 is applied; schema_migrations gained exactly that version.
//   - Every table's row count unchanged (schema_migrations: +1 for 026).
//   - rooms / design_params: same rows, same columns; every column of every
//     row identical, EXCEPT mvhr_efficiency on the expected rows, which must
//     now === before / 100 exactly.
//   - The set of changed rows === the expected set.
//   - No row has mvhr_efficiency > 1 (SQL count, so NaN is caught too).
//   - Ventilation figures for every room, computed with the current
//     client/src/utils/en12831Calculations.js on the before rows and on the
//     after rows (loadProject mapping, scripts/lib/loadProjectMapping.mjs):
//       unaffected rooms: ventEmitter, ventGeneratorDesign and
//         ventGeneratorTypical identical (Object.is);
//       affected rooms with MVHR active (type 'mvhr', rate > 0): all three
//         figures now > 0; leakage unchanged; and the MVHR term the client
//         produces (generator figure − leakage factor × 0.34) equals the
//         independent formula rate × (Ti − Te) × (1 − eff) × 0.34 within
//         0.01 W, for design (Te) and typical (Te,ref);
//       affected rooms with MVHR not active: the efficiency is unused, so
//         all three figures must be identical, as for unaffected rooms.
//
// scripts/out/ holds production data (room names, postcodes) during a
// rehearsal. It is git-ignored; delete it when the rehearsal is done.
//
// Exit code 0 only if every check passes.

import { registerHooks } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertScratchUrl, connectScratch } from './lib/scratchDbGuard.mjs';
import { mapProject, mapRoom } from './lib/loadProjectMapping.mjs';

const SCRATCH_DB   = 'ohl_b26_check';
const BEFORE_FILE  = 'b26_before.json';
const SPECIFIC_AIR = 0.34;   // W·h/(m³·K), CIBSE DHDG 2026 eq. 2.2
const TOLERANCE_W  = 0.01;

const args = process.argv.slice(2);
const mode = args[0];
const OVERWRITE = args.includes('--overwrite');
const unknown = args.slice(1).filter(a => a !== '--overwrite');
if (!['before', 'after'].includes(mode) || unknown.length || (mode === 'after' && OVERWRITE)) {
  console.error('Usage: node scripts/b26_gate.mjs before [--overwrite]');
  console.error('       node scripts/b26_gate.mjs after');
  process.exit(2);
}

assertScratchUrl(SCRATCH_DB);

// The client code uses Vite-style extensionless imports; resolve them to .js.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.js')) {
        return nextResolve(specifier + '.js', context);
      }
      throw err;
    }
  },
});

const root    = fileURLToPath(new URL('..', import.meta.url));
const outDir  = fileURLToPath(new URL('./out/', import.meta.url));
const outPath = (name) => outDir + name;
const toJson  = (v) => JSON.stringify(v, (_, x) => (x instanceof Date ? x.toISOString() : x));
const roundTrip = (v) => JSON.parse(toJson(v));
const quoteIdent = (name) => '"' + String(name).replace(/"/g, '""') + '"';
const isOverOne  = (v) => typeof v === 'number' && v > 1;

// ---------------------------------------------------------------------------
// Snapshot — one READ ONLY transaction
// ---------------------------------------------------------------------------
const snapshot = async () => {
  const c = await connectScratch(SCRATCH_DB);
  try {
    await c.query('BEGIN TRANSACTION READ ONLY');
    const q = async (sql, params) => (await c.query(sql, params)).rows;

    const tables = await q(`SELECT table_name FROM information_schema.tables
                             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                             ORDER BY table_name`);
    const tableCounts = {};
    for (const { table_name } of tables) {
      // ::text keeps counts exact whatever their size.
      tableCounts[table_name] = (await q(`SELECT COUNT(*)::text AS n FROM public.${quoteIdent(table_name)}`))[0].n;
    }
    const migrations = 'schema_migrations' in tableCounts
      ? (await q('SELECT version FROM schema_migrations ORDER BY version')).map(r => r.version)
      : [];
    const rooms        = await q('SELECT * FROM rooms ORDER BY id');
    const designParams = await q('SELECT * FROM design_params ORDER BY project_id');
    // loadProject: primary address, else the first one — same order as b25_baseline.mjs.
    const addresses = await q(`SELECT pa.project_id, a.postcode
                                 FROM addresses a JOIN project_addresses pa ON pa.address_id = a.id
                                ORDER BY pa.project_id, pa.is_primary DESC, a.id ASC`);
    const postcodes = {};
    for (const a of addresses) if (!(a.project_id in postcodes)) postcodes[a.project_id] = a.postcode || '';
    const [overOne] = await q(`SELECT (SELECT COUNT(*)::int FROM rooms         WHERE mvhr_efficiency > 1) AS rooms,
                                      (SELECT COUNT(*)::int FROM design_params WHERE mvhr_efficiency > 1) AS design_params`);
    await c.query('ROLLBACK');
    return roundTrip({ database: SCRATCH_DB, tableCounts, migrations, overOne, rooms, designParams, postcodes });
  } finally {
    await c.end();
  }
};

const results = [];
const check = (label, pass, detail = '') => {
  results.push({ label, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  return pass;
};
const list = (items, n = 10) => items.slice(0, n).join('; ') + (items.length > n ? `; … and ${items.length - n} more` : '');

// ---------------------------------------------------------------------------
// before
// ---------------------------------------------------------------------------
if (mode === 'before') {
  const snap = await snapshot();
  if (snap.migrations.includes('026')) {
    console.error('REFUSING: migration 026 is already applied in ohl_b26_check. Restore it from the dump first.');
    process.exit(1);
  }
  if (existsSync(outPath(BEFORE_FILE)) && !OVERWRITE) {
    console.error(`REFUSING: scripts/out/${BEFORE_FILE} already exists. Pass --overwrite to replace it ` +
                  `(only on a freshly restored, unmigrated ohl_b26_check).`);
    process.exit(1);
  }
  const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim() || null;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath(BEFORE_FILE), toJson({ generatedAt: new Date().toISOString(), gitHead: head, ...snap }));

  const roomsOver = snap.rooms.filter(r => isOverOne(r.mvhr_efficiency));
  const dpsOver   = snap.designParams.filter(d => isOverOne(d.mvhr_efficiency));
  console.log(`Wrote scripts/out/${BEFORE_FILE} (git ${head})`);
  console.log(`  ${Object.keys(snap.tableCounts).length} tables; ${snap.rooms.length} rooms; ${snap.designParams.length} design_params rows`);
  console.log(`  applied migrations: ${snap.migrations.join(', ')}`);
  console.log(`  mvhr_efficiency > 1: ${roomsOver.length} rooms row(s), ${dpsOver.length} design_params row(s) ` +
              `(SQL count: ${snap.overOne.rooms} / ${snap.overOne.design_params})`);
  for (const r of roomsOver) console.log(`    rooms id ${r.id} (project ${r.project_id}): ${r.mvhr_efficiency}`);
  for (const d of dpsOver)   console.log(`    design_params project_id ${d.project_id}: ${d.mvhr_efficiency}`);
  const notPercent = [...roomsOver, ...dpsOver].filter(r => r.mvhr_efficiency > 100);
  const hidden = snap.overOne.rooms - roomsOver.length + snap.overOne.design_params - dpsOver.length;
  if (notPercent.length || hidden) {
    console.log(`  NOTE: 026 will ABORT on this data (writing nothing): ${notPercent.length} value(s) > 100, ` +
                `${hidden} NaN/Infinity value(s).`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// after
// ---------------------------------------------------------------------------
if (!existsSync(outPath(BEFORE_FILE))) {
  console.error(`scripts/out/${BEFORE_FILE} not found. Run "before" on the unmigrated scratch DB first.`);
  process.exit(1);
}
const before = JSON.parse(readFileSync(outPath(BEFORE_FILE), 'utf8'));
const after  = await snapshot();
console.log(`before: scripts/out/${BEFORE_FILE}, taken ${before.generatedAt} at git ${before.gitHead}`);

console.log('\n== Migrations and table counts ==');
check('before file was taken before 026 was applied', !before.migrations.includes('026'));
const expectedMigrations = [...before.migrations, '026'].sort();
check('026 applied; schema_migrations gained exactly that version',
  toJson([...after.migrations].sort()) === toJson(expectedMigrations),
  `before ${before.migrations.length} versions, after ${after.migrations.length}`);

const beforeTables = Object.keys(before.tableCounts).sort();
const afterTables  = Object.keys(after.tableCounts).sort();
check(`same ${beforeTables.length} tables in the public schema`, toJson(beforeTables) === toJson(afterTables),
  toJson(afterTables) === toJson(beforeTables) ? '' :
  `added ${afterTables.filter(t => !beforeTables.includes(t)).join(', ') || 'none'}, ` +
  `removed ${beforeTables.filter(t => !afterTables.includes(t)).join(', ') || 'none'}`);
const countDiffs = [];
for (const t of beforeTables) {
  if (!(t in after.tableCounts)) continue;
  const expected = BigInt(before.tableCounts[t]) + (t === 'schema_migrations' ? 1n : 0n);
  if (BigInt(after.tableCounts[t]) !== expected) countDiffs.push(`${t}: ${before.tableCounts[t]} → ${after.tableCounts[t]}`);
}
check(`row count unchanged in every table (schema_migrations +1 for 026)`, countDiffs.length === 0, list(countDiffs));

// ---------------------------------------------------------------------------
// Rows — every column exact
// ---------------------------------------------------------------------------
console.log('\n== rooms and design_params rows (exact) ==');
const compareTable = (name, key, beforeRows, afterRows) => {
  const B = new Map(beforeRows.map(r => [r[key], r]));
  const A = new Map(afterRows.map(r => [r[key], r]));
  const expected = new Set(beforeRows.filter(r => isOverOne(r.mvhr_efficiency)).map(r => r[key]));

  const sameIds = toJson([...B.keys()].sort((x, y) => x - y)) === toJson([...A.keys()].sort((x, y) => x - y));
  check(`${name}: same ${B.size} rows (by ${key})`, sameIds, sameIds ? '' : `before ${B.size}, after ${A.size}`);

  const changed = new Set();
  const unexpectedDiffs = [], valueDiffs = [];
  for (const [id, b] of B) {
    const a = A.get(id);
    if (!a) continue;
    const cols = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    const diffCols = cols.filter(c => toJson(a[c]) !== toJson(b[c]));
    if (diffCols.length) changed.add(id);
    if (expected.has(id)) {
      const others = diffCols.filter(c => c !== 'mvhr_efficiency');
      if (others.length) unexpectedDiffs.push(`${key} ${id}: ${others.join(', ')}`);
      if (!Object.is(a.mvhr_efficiency, b.mvhr_efficiency / 100)) {
        valueDiffs.push(`${key} ${id}: ${b.mvhr_efficiency} → ${a.mvhr_efficiency} (expected ${b.mvhr_efficiency / 100})`);
      }
    } else if (diffCols.length) {
      unexpectedDiffs.push(`${key} ${id}: ${diffCols.join(', ')}`);
    }
  }
  check(`${name}: mvhr_efficiency === before / 100 exactly on the ${expected.size} row(s) that were > 1`,
    valueDiffs.length === 0, list(valueDiffs));
  check(`${name}: every other column of every row identical (${B.size} rows)`,
    unexpectedDiffs.length === 0, list(unexpectedDiffs));
  const exp = [...expected].sort((x, y) => x - y), act = [...changed].sort((x, y) => x - y);
  check(`${name}: changed rows = rows that were > 1 (expected ${exp.length}, changed ${act.length})`,
    toJson(exp) === toJson(act), toJson(exp) === toJson(act) ? '' : `expected [${exp.join(', ')}], changed [${act.join(', ')}]`);
  for (const id of exp) {
    console.log(`        ${name} ${key} ${id}: ${B.get(id).mvhr_efficiency} → ${A.get(id)?.mvhr_efficiency}`);
  }
  return expected;
};
const affectedRooms = compareTable('rooms', 'id', before.rooms, after.rooms);
const affectedDps   = compareTable('design_params', 'project_id', before.designParams, after.designParams);

check('no row has mvhr_efficiency > 1 (SQL count, catches NaN)',
  after.overOne.rooms === 0 && after.overOne.design_params === 0,
  `rooms ${after.overOne.rooms}, design_params ${after.overOne.design_params}`);
check('postcodes unchanged (they feed the externalTemp auto-apply)',
  toJson(after.postcodes) === toJson(before.postcodes));

// ---------------------------------------------------------------------------
// Ventilation figures — current client code on before rows and after rows
// ---------------------------------------------------------------------------
console.log('\n== Ventilation figures (current client code, before rows vs after rows) ==');
const { calculateRoomVentilationEN12831 } = await import('../client/src/utils/en12831Calculations.js');
const { getMCSDataFromPostcode } = await import('../client/src/utils/mcsData.js');

// resolveQ50 reports problems with console.error and carries on with a
// fallback; any such report fails the gate.
const resolveErrors = [];
const consoleError = console.error;
console.error = (...a) => {
  const msg = a.map(String).join(' ');
  if (msg.startsWith('resolveQ50:')) resolveErrors.push(msg);
  consoleError(...a);
};

const dpBy = (rows) => new Map(rows.map(d => [d.project_id, d]));
const dpBefore = dpBy(before.designParams), dpAfter = dpBy(after.designParams);
const projectFor = (dps, projectId, postcodes) =>
  mapProject(dps.get(projectId), postcodes[projectId] ?? '', getMCSDataFromPostcode);

const FIGS = ['ventEmitter', 'ventGeneratorDesign', 'ventGeneratorTypical'];
const afterRoomById = new Map(after.rooms.map(r => [r.id, r]));
const unaffectedDiffs = [], notPositive = [], leakageDiffs = [], termDiffs = [], inactiveDiffs = [];
let unaffectedCount = 0, activeCount = 0, inactiveCount = 0, nonFinite = [];

for (const bRow of before.rooms) {
  const aRow = afterRoomById.get(bRow.id);
  if (!aRow) continue;   // reported by the row checks
  const bProject = projectFor(dpBefore, bRow.project_id, before.postcodes);
  const aProject = projectFor(dpAfter,  aRow.project_id, after.postcodes);
  const aRoom = mapRoom(aRow);
  const b = calculateRoomVentilationEN12831(mapRoom(bRow), bProject);
  const a = calculateRoomVentilationEN12831(aRoom, aProject);
  for (const f of FIGS) if (!Number.isFinite(a[f])) nonFinite.push(`room ${bRow.id} ${f} ${a[f]}`);

  const identical = FIGS.every(f => Object.is(a[f], b[f]));
  if (!affectedRooms.has(bRow.id)) {
    unaffectedCount++;
    if (!identical) unaffectedDiffs.push(`room ${bRow.id}: ${FIGS.map(f => `${f} ${b[f]} → ${a[f]}`).join(', ')}`);
    continue;
  }

  const active = aRoom.continuousVentType === 'mvhr' && aRoom.continuousVentRateM3h > 0;
  if (!active) {
    inactiveCount++;
    console.log(`        room ${bRow.id} (project ${bRow.project_id}): MVHR not active ` +
                `(type ${aRoom.continuousVentType}, rate ${aRoom.continuousVentRateM3h}) — efficiency unused`);
    if (!identical) inactiveDiffs.push(`room ${bRow.id}`);
    continue;
  }
  activeCount++;

  if (!FIGS.every(f => a[f] > 0)) notPositive.push(`room ${bRow.id}: ${FIGS.map(f => `${f} ${a[f]}`).join(', ')}`);
  if (!Object.is(a.stages.leakage.approximateRoomLeakageRate, b.stages.leakage.approximateRoomLeakageRate)) {
    leakageDiffs.push(`room ${bRow.id}`);
  }

  // The client's MVHR term, taken from its outputs: generator figure minus the
  // leakage part. Independent formula, not via the client code:
  //   rate × (Ti − Te) × (1 − eff) × 0.34
  // Inputs use the same defaults as the calculation (Ti ?? 21, Te,ref ?? 10.6).
  const Ti    = aRoom.internalTemp ?? 21;
  const Te    = aProject.externalTemp ?? -3;
  const TeRef = aProject.referenceTemp ?? 10.6;
  const rate  = aRoom.continuousVentRateM3h, eff = aRoom.mvhrEfficiency;
  const clientDesign  = a.ventGeneratorDesign  - a.stages.factors.leakageFactorDesign  * SPECIFIC_AIR;
  const clientTypical = a.ventGeneratorTypical - a.stages.factors.leakageFactorTypical * SPECIFIC_AIR;
  const indepDesign   = rate * (Ti - Te)    * (1 - eff) * SPECIFIC_AIR;
  const indepTypical  = rate * (Ti - TeRef) * (1 - eff) * SPECIFIC_AIR;
  const dD = Math.abs(clientDesign - indepDesign), dT = Math.abs(clientTypical - indepTypical);
  if (!(dD <= TOLERANCE_W) || !(dT <= TOLERANCE_W)) {
    termDiffs.push(`room ${bRow.id}: design ${clientDesign} vs ${indepDesign}, typical ${clientTypical} vs ${indepTypical}`);
  }
  console.log(`        room ${bRow.id} (project ${bRow.project_id}): eff ${bRow.mvhr_efficiency} → ${eff}; ` +
              `generator design ${b.ventGeneratorDesign.toFixed(2)} → ${a.ventGeneratorDesign.toFixed(2)} W; ` +
              `MVHR term design ${clientDesign.toFixed(4)} vs formula ${indepDesign.toFixed(4)} W, ` +
              `typical ${clientTypical.toFixed(4)} vs ${indepTypical.toFixed(4)} W`);
}
console.error = consoleError;

check('resolveQ50 logged no errors on either side', resolveErrors.length === 0, list(resolveErrors));
check('every after figure is finite', nonFinite.length === 0, list(nonFinite));
check(`unaffected rooms: ${FIGS.join(', ')} identical (${unaffectedCount} rooms)`,
  unaffectedDiffs.length === 0, list(unaffectedDiffs));
check(`affected rooms with MVHR active: all three figures now > 0 (${activeCount} rooms)`,
  notPositive.length === 0, list(notPositive));
check(`affected rooms with MVHR active: leakage rate unchanged (${activeCount} rooms)`,
  leakageDiffs.length === 0, list(leakageDiffs));
check(`affected rooms with MVHR active: MVHR term = rate × (Ti − Te) × (1 − eff) × 0.34 within ${TOLERANCE_W} W, design and typical (${activeCount} rooms)`,
  termDiffs.length === 0, list(termDiffs));
check(`affected rooms with MVHR not active: figures identical (${inactiveCount} rooms)`,
  inactiveDiffs.length === 0, list(inactiveDiffs));

// ---------------------------------------------------------------------------
const failed = results.filter(r => !r.pass);
console.log(`\nSummary: ${after.rooms.length} rooms, ${after.designParams.length} design_params rows, ` +
            `${Object.keys(after.tableCounts).length} tables; converted ${affectedRooms.size} rooms row(s) ` +
            `(${activeCount} with MVHR active) and ${affectedDps.size} design_params row(s).`);
console.log(`== GATE ${failed.length ? 'FAILED' : 'PASSED'}: ${results.length - failed.length}/${results.length} checks ==`);
process.exit(failed.length ? 1 : 0);
