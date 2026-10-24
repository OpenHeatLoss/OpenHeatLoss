// scripts/b25_gate.mjs
//
// B25 commit 2 verification gate. EXACT equality — no tolerance anywhere.
// The freeze stores the q50 the app computes today, so any difference is a bug.
//
// Sequence (scratch DB ohl_b25_check only):
//   1. If migration 023 is not yet applied: take the "before" baseline
//      (scripts/b25_baseline.mjs → b25_before.json) and a design_params
//      snapshot (b25_before_db.json). If it is already applied, both files
//      must exist from the earlier run.
//   2. node server/migrate.js (child process, DATABASE_URL from environment).
//   3. "After" baseline → b25_after.json.
//   4. Compare: resolved q50 for every project; every room-level figure and
//      every building total for every project with rooms.
//   5. Database assertions: no 'estimated' left; 164 legacy_sap; 10 measured;
//      each migrated q50 === before resolved q50; sap_* columns, measured
//      rows and updated_at unchanged; new columns present with NULL / 'mean'.
//   6. node server/migrate.js a second time: design_params must be identical.
//   7. Old-client save: designParams.update with method 'estimated', q50 12
//      and no q50_* fields must raise no error and change nothing.
//
// Exit code 0 only if every check passes.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertScratchUrl, connectScratch } from './lib/scratchDbGuard.mjs';

assertScratchUrl();

const EXPECT = { projects: 174, legacySap: 164, measured: 10, withRooms: 99 };

const root    = fileURLToPath(new URL('..', import.meta.url));
const outPath = (name) => fileURLToPath(new URL(`./out/${name}`, import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(outPath(name), 'utf8'));

const results = [];
const check = (label, pass, detail = '') => {
  results.push({ label, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  return pass;
};

const run = (label, args) => {
  console.log(`\n$ node ${args.join(' ')}`);
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: process.env });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  console.log(out.trimEnd().split('\n').map(l => `    ${l}`).join('\n'));
  if (r.status !== 0) {
    console.error(`\n${label} exited with status ${r.status} — gate aborted.`);
    process.exit(1);
  }
  return out;
};

// All design_params columns, ordered, as JSON-comparable rows keyed by project_id.
const snapshotDesignParams = async (client) => {
  const { rows } = await client.query('SELECT * FROM design_params ORDER BY project_id');
  return Object.fromEntries(rows.map(r => [r.project_id, r]));
};
const toJson = (v) => JSON.stringify(v, (_, x) => (x instanceof Date ? x.toISOString() : x));

const migrationApplied = async (version) => {
  const c = await connectScratch();
  try {
    return (await c.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version])).rowCount > 0;
  } finally { await c.end(); }
};

// ---------------------------------------------------------------------------
// 1. Before
// ---------------------------------------------------------------------------
console.log('== 1. Before ==');
const alreadyApplied = await migrationApplied('023');
if (!alreadyApplied) {
  run('baseline (before)', ['scripts/b25_baseline.mjs', 'b25_before.json']);
  const c = await connectScratch();
  const snap = await snapshotDesignParams(c);
  await c.end();
  writeFileSync(outPath('b25_before_db.json'), toJson(snap));
  console.log(`  design_params snapshot: ${Object.keys(snap).length} rows → scripts/out/b25_before_db.json`);
} else {
  console.log('  023 already applied — using the existing before files.');
  for (const f of ['b25_before.json', 'b25_before_db.json']) {
    if (!existsSync(outPath(f))) {
      console.error(`  ${f} missing and 023 already applied. Restore the scratch DB and re-run.`);
      process.exit(1);
    }
  }
}
const before   = readJson('b25_before.json');
const beforeDb = readJson('b25_before_db.json');

// ---------------------------------------------------------------------------
// 2. Migrate (first run)
// ---------------------------------------------------------------------------
console.log('\n== 2. Migrate (first run) ==');
const firstOut = run('migrate.js (first run)', ['server/migrate.js']);
if (!alreadyApplied) {
  check('first run applied migration 023', /Applying migration 023/.test(firstOut));
}

// ---------------------------------------------------------------------------
// 3. After
// ---------------------------------------------------------------------------
console.log('\n== 3. After ==');
run('baseline (after)', ['scripts/b25_baseline.mjs', 'b25_after.json']);
const after = readJson('b25_after.json');

// ---------------------------------------------------------------------------
// 4. Compare before / after — exact
// ---------------------------------------------------------------------------
console.log('\n== 4. Compare before / after (exact) ==');
const byId = (list) => new Map(list.map(p => [p.projectId, p]));
const B = byId(before.projects), A = byId(after.projects);

check(`project count ${before.projects.length} → ${after.projects.length} (expect ${EXPECT.projects})`,
  before.projects.length === EXPECT.projects && after.projects.length === EXPECT.projects);
check('same project ids before and after',
  before.projects.length === A.size && before.projects.every(p => A.has(p.projectId)));

// Object.is: exact, and distinguishes -0 / NaN rather than hiding them.
const q50Diffs = [];
for (const [id, b] of B) {
  const a = A.get(id);
  if (!a || !Object.is(a.resolvedQ50, b.resolvedQ50)) q50Diffs.push(`${id}: ${b.resolvedQ50} → ${a?.resolvedQ50}`);
}
check(`resolved q50 identical for all ${B.size} projects`, q50Diffs.length === 0,
  q50Diffs.slice(0, 10).join('; '));

const withRooms = before.projects.filter(p => p.roomCount > 0);
check(`projects with rooms: ${withRooms.length} (expect ${EXPECT.withRooms})`, withRooms.length === EXPECT.withRooms);

const ROOM_FIELDS = Object.keys(withRooms[0]?.rooms[0] ?? {}).filter(k => k !== 'roomId');
const TOTAL_FIELDS = Object.keys(withRooms[0]?.totals ?? {});
const roomDiffs = [];
let roomsCompared = 0, valuesCompared = 0;
for (const b of withRooms) {
  const a = A.get(b.projectId);
  const aRooms = new Map((a?.rooms ?? []).map(r => [r.roomId, r]));
  if (a?.rooms.length !== b.rooms.length) roomDiffs.push(`project ${b.projectId}: room count ${b.rooms.length} → ${a?.rooms.length}`);
  for (const br of b.rooms) {
    const ar = aRooms.get(br.roomId);
    roomsCompared++;
    if (!ar) { roomDiffs.push(`project ${b.projectId} room ${br.roomId}: missing after`); continue; }
    for (const k of ROOM_FIELDS) {
      valuesCompared++;
      if (!Object.is(ar[k], br[k])) roomDiffs.push(`project ${b.projectId} room ${br.roomId} ${k}: ${br[k]} → ${ar[k]}`);
    }
  }
  for (const k of TOTAL_FIELDS) {
    valuesCompared++;
    if (!Object.is(a?.totals[k], b.totals[k])) roomDiffs.push(`project ${b.projectId} total ${k}: ${b.totals[k]} → ${a?.totals[k]}`);
  }
}
check(`room-level figures identical: ${roomsCompared} rooms × ${ROOM_FIELDS.length} fields + ${TOTAL_FIELDS.length} totals per project (${valuesCompared} values)`,
  roomDiffs.length === 0, roomDiffs.slice(0, 10).join('; '));
console.log(`        room fields: ${ROOM_FIELDS.join(', ')}`);

// ---------------------------------------------------------------------------
// 5. Database assertions
// ---------------------------------------------------------------------------
console.log('\n== 5. Database ==');
const db = await connectScratch();
const afterDb = await snapshotDesignParams(db);

const counts = Object.values(afterDb).reduce((m, r) => ((m[r.air_permeability_method] = (m[r.air_permeability_method] ?? 0) + 1), m), {});
check(`no 'estimated' rows remain`, !counts.estimated, JSON.stringify(counts));
check(`legacy_sap rows = ${counts.legacy_sap ?? 0} (expect ${EXPECT.legacySap})`, counts.legacy_sap === EXPECT.legacySap);
check(`measured rows = ${counts.measured ?? 0} (expect ${EXPECT.measured})`, counts.measured === EXPECT.measured);
check('design_params row set unchanged',
  toJson(Object.keys(afterDb)) === toJson(Object.keys(beforeDb)));

const SAP_COLS = ['sap_structural', 'sap_floor', 'sap_window_draught_pct', 'sap_draught_lobby',
                  'building_storeys', 'building_shielding'];
const migratedQ50Diffs = [], sapDiffs = [], measuredDiffs = [], updatedAtDiffs = [], otherColDiffs = [];
const NEW_COLS = ['q50_built_form', 'q50_age_band', 'q50_wall_construction', 'q50_selection_basis', 'q50_statistic'];
for (const [id, b] of Object.entries(beforeDb)) {
  const a = afterDb[id];
  if (b.air_permeability_method === 'estimated') {
    if (a.air_permeability_method !== 'legacy_sap') migratedQ50Diffs.push(`${id}: method ${a.air_permeability_method}`);
    const expected = B.get(Number(id))?.resolvedQ50;
    if (!Object.is(a.q50, expected)) migratedQ50Diffs.push(`${id}: stored ${a.q50} vs baseline ${expected}`);
  }
  if (b.air_permeability_method === 'measured') {
    if (a.air_permeability_method !== 'measured' || !Object.is(a.q50, b.q50)) measuredDiffs.push(`${id}`);
  }
  for (const c of SAP_COLS) if (!Object.is(a[c], b[c])) sapDiffs.push(`${id}.${c}: ${b[c]} → ${a[c]}`);
  if (toJson(a.updated_at) !== toJson(b.updated_at)) updatedAtDiffs.push(id);
  // Every other pre-existing column must be untouched too.
  for (const c of Object.keys(b)) {
    if (['q50', 'air_permeability_method'].includes(c)) continue;
    if (toJson(a[c]) !== toJson(b[c])) otherColDiffs.push(`${id}.${c}`);
  }
}
check(`each migrated q50 === baseline resolved q50, method legacy_sap (${EXPECT.legacySap} rows)`,
  migratedQ50Diffs.length === 0, migratedQ50Diffs.slice(0, 10).join('; '));
check('measured rows untouched (method and q50)', measuredDiffs.length === 0, measuredDiffs.join(', '));
check('sap_* / storeys / shielding columns unchanged', sapDiffs.length === 0, sapDiffs.slice(0, 10).join('; '));
check('updated_at unchanged on every row', updatedAtDiffs.length === 0, updatedAtDiffs.slice(0, 10).join(', '));
check('no other pre-existing column changed', otherColDiffs.length === 0, otherColDiffs.slice(0, 10).join(', '));

const { rows: colRows } = await db.query(`
  SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
   WHERE table_name = 'design_params' AND column_name = ANY($1)
   ORDER BY column_name`, [NEW_COLS]);
const cols = Object.fromEntries(colRows.map(r => [r.column_name, r]));
check('five new columns exist, TEXT',
  NEW_COLS.every(c => cols[c]?.data_type === 'text'), colRows.map(r => r.column_name).join(', '));
check(`q50_statistic NOT NULL DEFAULT 'mean'`,
  cols.q50_statistic?.is_nullable === 'NO' && /'mean'/.test(cols.q50_statistic?.column_default ?? ''));
check('other four nullable, no default',
  NEW_COLS.slice(0, 4).every(c => cols[c]?.is_nullable === 'YES' && cols[c]?.column_default === null));
check(`every row: four selection columns NULL, q50_statistic 'mean'`,
  Object.values(afterDb).every(r => NEW_COLS.slice(0, 4).every(c => r[c] === null) && r.q50_statistic === 'mean'));
await db.end();

// ---------------------------------------------------------------------------
// 6. Migrate (second run) — must change nothing
// ---------------------------------------------------------------------------
console.log('\n== 6. Migrate (second run) ==');
const secondOut = run('migrate.js (second run)', ['server/migrate.js']);
check('second run skipped 023', /Migration 023 already applied/.test(secondOut));
const db2 = await connectScratch();
const afterSecond = await snapshotDesignParams(db2);
await db2.end();
check('design_params identical after second run (every column, every row)', toJson(afterSecond) === toJson(afterDb));

// ---------------------------------------------------------------------------
// 7. Old-client save
// ---------------------------------------------------------------------------
console.log('\n== 7. Old-client save ==');
// database.js has no dotenv; its pool uses the (already guarded) DATABASE_URL.
const require = createRequire(import.meta.url);
const { designParams } = require('../server/database.js');

// Rebuild a full camelCase payload from a stored row, using the column →
// field mapping of designParams.update (verified by b25_check_params.mjs).
const COLUMN_TO_FIELD = {
  external_temp: 'externalTemp', annual_avg_temp: 'annualAvgTemp', design_flow_temp: 'designFlowTemp',
  design_return_temp: 'designReturnTemp', air_density: 'airDensity', specific_heat: 'specificHeat',
  mcs_postcode_prefix: 'mcsPostcodePrefix', mcs_degree_days: 'mcsDegreeDays', mcs_outdoor_low_temp: 'mcsOutdoorLowTemp',
  use_sap_ventilation: 'useSAPVentilation', building_category: 'buildingCategory', dwelling_type: 'dwellingType',
  number_of_storeys: 'numberOfStoreys', shelter_factor: 'shelterFactor', number_of_bedrooms: 'numberOfBedrooms',
  has_blower_test: 'hasBlowerTest', sap_age_band: 'sapAgeBand', air_permeability_q50: 'airPermeabilityQ50',
  number_of_chimneys: 'numberOfChimneys', number_of_open_flues: 'numberOfOpenFlues',
  number_of_intermittent_fans: 'numberOfIntermittentFans', number_of_passive_vents: 'numberOfPassiveVents',
  ventilation_system_type: 'ventilationSystemType', mvhr_efficiency: 'mvhrEfficiency',
  heat_pump_manufacturer: 'heatPumpManufacturer', heat_pump_model: 'heatPumpModel',
  heat_pump_rated_output: 'heatPumpRatedOutput', heat_pump_min_modulation: 'heatPumpMinModulation',
  heat_pump_flow_temp: 'heatPumpFlowTemp', heat_pump_return_temp: 'heatPumpReturnTemp',
  mcs_heat_pump_type: 'mcsHeatPumpType', mcs_emitter_type: 'mcsEmitterType', mcs_ufh_type: 'mcsUFHType',
  mcs_system_provides: 'mcsSystemProvides', mcs_bedrooms: 'mcsBedrooms', mcs_occupants: 'mcsOccupants',
  mcs_cylinder_volume: 'mcsCylinderVolume', mcs_pasteurization_freq: 'mcsPasteurizationFreq',
  mcs_heat_pump_sound_power: 'mcsHeatPumpSoundPower', mcs_sound_assessments: 'mcsSoundAssessments',
  mcs_sound_snapshot: 'mcsSoundSnapshot', mcs_calculation_snapshot: 'mcsCalculationSnapshot',
  circuits: 'circuits', pipe_sections: 'pipeSections',
  epc_space_heating_demand: 'epcSpaceHeatingDemand', epc_hot_water_demand: 'epcHotWaterDemand',
  epc_total_floor_area: 'epcTotalFloorArea', heat_pump_internal_volume: 'heatPumpInternalVolume',
  buffer_vessel_volume: 'bufferVesselVolume', en14511_test_points: 'en14511TestPoints', defrost_pct: 'defrostPct',
  ventilation_method: 'ventilationMethod', air_permeability_method: 'airPermeabilityMethod', q50: 'q50',
  sap_structural: 'sapStructural', sap_floor: 'sapFloor', sap_window_draught_pct: 'sapWindowDraughtPct',
  sap_draught_lobby: 'sapDraughtLobby', building_storeys: 'buildingStoreys', building_shielding: 'buildingShielding',
  reference_temp: 'referenceTemp', balance_point: 'balancePoint', scop_emitter_type: 'scopEmitterType',
  mvhr_whole_house_rate_m3h: 'mvhrWholeHouseRate',
  q50_built_form: 'q50BuiltForm', q50_age_band: 'q50AgeBand', q50_wall_construction: 'q50WallConstruction',
  q50_selection_basis: 'q50SelectionBasis', q50_statistic: 'q50Statistic',
};
const payloadFromRow = (row) =>
  Object.fromEntries(Object.entries(COLUMN_TO_FIELD).map(([col, field]) => [field, row[col]]));

const getRow = async (id) => {
  const c = await connectScratch();
  try { return (await c.query('SELECT * FROM design_params WHERE project_id = $1', [id])).rows[0]; }
  finally { await c.end(); }
};
const withoutUpdatedAt = (r) => { const { updated_at, ...rest } = r; return toJson(rest); };

// Reference project 238 if it is legacy_sap, else the first legacy_sap row with rooms.
const target = [238, ...withRooms.map(p => p.projectId)].find(id => afterDb[id]?.air_permeability_method === 'legacy_sap');
console.log(`  test row: project ${target}`);

// a) A save from the CURRENT client (same values) — establishes the row as
//    any save leaves it (a save may normalise unrelated NULLs to defaults).
await designParams.update(target, payloadFromRow(await getRow(target)));
const r1 = await getRow(target);
check('current-client save keeps method legacy_sap and frozen q50',
  r1.air_permeability_method === 'legacy_sap' && Object.is(r1.q50, B.get(target).resolvedQ50));

// b) An OLD client: method 'estimated', stale q50 12, no q50_* fields at all.
const oldPayload = { ...payloadFromRow(r1), airPermeabilityMethod: 'estimated', q50: 12 };
for (const f of ['q50BuiltForm', 'q50AgeBand', 'q50WallConstruction', 'q50SelectionBasis', 'q50Statistic']) delete oldPayload[f];
let oldErr = null;
try { await designParams.update(target, oldPayload); } catch (e) { oldErr = e; }
check('old-client save raises no error', oldErr === null, oldErr?.message ?? '');
const r2 = await getRow(target);
check('old-client save: row unchanged (every column except updated_at)', withoutUpdatedAt(r2) === withoutUpdatedAt(r1),
  `method ${r2.air_permeability_method}, q50 ${r2.q50}, q50_statistic ${r2.q50_statistic}`);

// c) Method and q50 missing entirely.
const missingPayload = payloadFromRow(r1);
delete missingPayload.airPermeabilityMethod; delete missingPayload.q50;
let missErr = null;
try { await designParams.update(target, missingPayload); } catch (e) { missErr = e; }
const r3 = await getRow(target);
check('save with method and q50 undefined: no error, row unchanged',
  missErr === null && withoutUpdatedAt(r3) === withoutUpdatedAt(r1), missErr?.message ?? '');

// ---------------------------------------------------------------------------
const failed = results.filter(r => !r.pass);
console.log(`\n== GATE ${failed.length ? 'FAILED' : 'PASSED'}: ${results.length - failed.length}/${results.length} checks ==`);
process.exit(failed.length ? 1 : 0);
