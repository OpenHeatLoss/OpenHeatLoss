// scripts/b25_baseline.mjs
//
// B25 baseline — READ-ONLY. Computes ventilation and heat loss figures for
// every project in the scratch DB using the CURRENT client calculation code,
// so the same script can be re-run after commit 2 (migration 023) and the two
// outputs compared. After commit 2 every number must be identical.
//
// Usage (DATABASE_URL already set in the environment, never from .env):
//   node scripts/b25_baseline.mjs                 → scripts/out/b25_before.json
//   node scripts/b25_baseline.mjs b25_after.json  → scripts/out/b25_after.json
//
// The DB rows are mapped to camelCase with the SAME expressions (including
// fallbacks) as App.jsx loadProject(), restricted to the fields the
// calculation reads. If loadProject's mapping for any of these fields changes,
// this mapping must change with it.

import { registerHooks } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { connectScratch, SCRATCH_DB } from './lib/scratchDbGuard.mjs';

// The client code uses Vite-style extensionless imports ('./en12831VentilationData').
// Teach Node to resolve those to .js so we run the real modules, unmodified.
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

// Namespace import: estimateQ50SAP is deleted in B25 commit 3, so treat it as optional.
const en12831 = await import('../client/src/utils/en12831Calculations.js');
const { resolveQ50, calculateRoomVentilationEN12831 } = en12831;
const { calculateTransmissionLoss, calculateRoomTotal, calculateBuildingTotal } =
  await import('../client/src/utils/calculations.js');
const { getMCSDataFromPostcode } = await import('../client/src/utils/mcsData.js');

const outName = process.argv[2] ?? 'b25_before.json';
if (!/^[\w.-]+\.json$/.test(outName)) {
  console.error(`Output name must be a plain .json filename, got "${outName}"`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Field mapping — copied from App.jsx loadProject(). Each entry is
// [camelCase name, raw column, mapper]. The raw column is kept so we can tell
// "column missing from the DB row" apart from "column present but NULL".
// ---------------------------------------------------------------------------

const PROJECT_FIELDS = [
  ['externalTemp',          'external_temp',           dp => dp.external_temp           ?? -3],
  ['airDensity',            'air_density',             dp => dp.air_density             ?? 1.2],
  ['specificHeat',          'specific_heat',           dp => dp.specific_heat           ?? 0.34],
  ['ventilationMethod',     'ventilation_method',      dp => dp.ventilation_method      || 'en12831_cibse2026'],
  // B25 commit 2 removed loadProject's `|| 'estimated'` / `?? 12.0` fallbacks.
  // Both columns are NOT NULL (audit: 0 NULLs), so before/after are equivalent.
  ['airPermeabilityMethod', 'air_permeability_method', dp => dp.air_permeability_method],
  ['q50',                   'q50',                     dp => dp.q50],
  ['sapStructural',         'sap_structural',          dp => dp.sap_structural          || 'masonry'],
  ['sapFloor',              'sap_floor',               dp => dp.sap_floor               || 'other'],
  ['sapWindowDraughtPct',   'sap_window_draught_pct',  dp => dp.sap_window_draught_pct  ?? 100],
  ['sapDraughtLobby',       'sap_draught_lobby',       dp => dp.sap_draught_lobby       ?? 0],
  ['buildingStoreys',       'building_storeys',        dp => dp.building_storeys        ?? 2],
  ['buildingShielding',     'building_shielding',      dp => dp.building_shielding      || 'normal'],
  ['referenceTemp',         'reference_temp',          dp => dp.reference_temp          ?? 10.0],
];

const ROOM_FIELDS = [
  ['internalTemp',            'internal_temp',             r => r.internal_temp],
  ['volume',                  'volume',                    r => r.volume],
  ['roomType',                'room_type',                 r => r.room_type                 || 'living_room'],
  ['thermalBridgingAddition', 'thermal_bridging_addition', r => r.thermal_bridging_addition ?? 0.10],
  ['exposedEnvelopeM2',       'exposed_envelope_m2',       r => r.exposed_envelope_m2       ?? 0],
  ['bgVentCount',             'bg_vent_count',             r => r.bg_vent_count             ?? 0],
  ['bgFanCount',              'bg_fan_count',              r => r.bg_fan_count              ?? 0],
  ['bgFlueSmallCount',        'bg_flue_small_count',       r => r.bg_flue_small_count       ?? 0],
  ['bgFlueLargeCount',        'bg_flue_large_count',       r => r.bg_flue_large_count       ?? 0],
  ['bgOpenFireCount',         'bg_open_fire_count',        r => r.bg_open_fire_count        ?? 0],
  ['continuousVentType',      'continuous_vent_type',      r => r.continuous_vent_type      || 'none'],
  ['continuousVentRateM3h',   'continuous_vent_rate_m3h',  r => r.continuous_vent_rate_m3h  ?? 0],
  ['mvhrEfficiency',          'mvhr_efficiency',           r => r.mvhr_efficiency           ?? 0],
];

const ELEMENT_FIELDS = [
  ['area',                  'area',                     e => e.area],
  ['uValue',                'u_value',                  e => e.u_value],
  ['tempFactor',            'temp_factor',              e => e.temp_factor],
  ['customDeltaT',          'custom_delta_t',           e => e.custom_delta_t],
  ['subtractFromElementId', 'subtract_from_element_id', e => e.subtract_from_element_id],
];

// Field audit: per field, how many rows had the column missing, NULL in the
// DB, and undefined after mapping.
const audit = {};
const tally = (scope, fields, raw) => {
  const mapped = {};
  for (const [name, col, map] of fields) {
    const key = `${scope}.${name}`;
    const a = (audit[key] ??= { column: col, rows: 0, columnMissing: 0, dbNull: 0, mappedUndefined: 0 });
    a.rows++;
    if (!(col in raw)) a.columnMissing++;
    else if (raw[col] === null) a.dbNull++;
    const v = map(raw);
    if (v === undefined) a.mappedUndefined++;
    mapped[name] = v;
  }
  return mapped;
};

// ---------------------------------------------------------------------------
// Load everything inside a READ ONLY transaction
// ---------------------------------------------------------------------------

const client = await connectScratch();
await client.query('BEGIN TRANSACTION READ ONLY');

// Sequential: a single pg.Client cannot run queries concurrently.
const q = async (sql) => (await client.query(sql)).rows;
const projects  = await q('SELECT id FROM projects ORDER BY id');
const dps       = await q('SELECT * FROM design_params');
const rooms     = await q('SELECT * FROM rooms ORDER BY id');               // same order as rooms.getByProjectId
const elements  = await q('SELECT * FROM elements ORDER BY room_id, id');   // same order as getCompleteProject
const addresses = await q(`SELECT pa.project_id, a.postcode, pa.is_primary
                             FROM addresses a JOIN project_addresses pa ON pa.address_id = a.id
                            ORDER BY pa.project_id, pa.is_primary DESC, a.id ASC`);

await client.query('ROLLBACK');
await client.end();

const groupBy = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ??= []).push(r), m), {});
const dpByProject   = groupBy(dps, 'project_id');
const roomsByProj   = groupBy(rooms, 'project_id');
const elsByRoom     = groupBy(elements, 'room_id');
const addrByProject = groupBy(addresses, 'project_id');

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------

const nonFinite = [];
const check = (where, obj) => {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && !Number.isFinite(v)) nonFinite.push(`${where}.${k}=${v}`);
  }
  return obj;
};

const results = projects.map(({ id }) => {
  const dpRows = dpByProject[id] ?? [];
  if (dpRows.length > 1) throw new Error(`project ${id} has ${dpRows.length} design_params rows`);
  const dp = dpRows[0] ?? {};

  const project = tally('project', PROJECT_FIELDS, dp);

  // Mirror loadProject's postcode auto-apply of externalTemp (App.jsx ~:497).
  // Primary address first, else first address — same as loadProject.
  const postcode = addrByProject[id]?.[0]?.postcode || '';
  let externalTempAutoApplied = false;
  if (postcode && project.externalTemp === -3) {
    const mcs = getMCSDataFromPostcode(postcode);
    if (mcs) { project.externalTemp = mcs.lowTemp; externalTempAutoApplied = true; }
  }

  project.rooms = (roomsByProj[id] ?? []).map(r => ({
    id: r.id,
    name: r.name,
    ...tally('room', ROOM_FIELDS, r),
    ventilation: {
      minAirFlow:        r.min_air_flow,
      infiltrationRate:  r.infiltration_rate,
      mechanicalSupply:  r.mechanical_supply,
      mechanicalExtract: r.mechanical_extract,
    },
    elements: (elsByRoom[r.id] ?? []).map(e => ({ id: e.id, ...tally('element', ELEMENT_FIELDS, e) })),
  }));

  const resolvedQ50 = resolveQ50(project);
  // Informational only (not compared by the gate): the live SAP breakdown for 'estimated' rows.
  const sapEstimate = (project.airPermeabilityMethod !== 'estimated' || !en12831.estimateQ50SAP) ? null : en12831.estimateQ50SAP({
    structural:       project.sapStructural       ?? 'masonry',
    floor:            project.sapFloor            ?? 'other',
    windowDraughtPct: project.sapWindowDraughtPct ?? 100,
    draughtLobby:     !!project.sapDraughtLobby,
    storeys:          project.buildingStoreys     ?? 2,
    shielding:        project.buildingShielding   ?? 'normal',
  }).breakdown;

  const roomResults = project.rooms.map(room => {
    const v = calculateRoomVentilationEN12831(room, project);
    const fabricDesign  = calculateTransmissionLoss(room, project.externalTemp);
    const fabricTypical = calculateTransmissionLoss(room, project.referenceTemp);
    return check(`project ${id} room ${room.id}`, {
      roomId:               room.id,
      exposedEnvelopeM2:    room.exposedEnvelopeM2,
      roomLeakageRate:      v.stages.leakage.approximateRoomLeakageRate,
      ventEmitter:          v.ventEmitter,
      ventGeneratorDesign:  v.ventGeneratorDesign,
      ventGeneratorTypical: v.ventGeneratorTypical,
      fabricDesign,
      fabricTypical,
      emitterLoad:          calculateRoomTotal(room, project),
      generatorDesignLoad:  fabricDesign  + v.ventGeneratorDesign,
      generatorTypicalLoad: fabricTypical + v.ventGeneratorTypical,
    });
  });

  const sum = (k) => roomResults.reduce((s, r) => s + r[k], 0);
  const totals = check(`project ${id} totals`, {
    ventEmitter:          sum('ventEmitter'),
    ventGeneratorDesign:  sum('ventGeneratorDesign'),
    ventGeneratorTypical: sum('ventGeneratorTypical'),
    fabricDesign:         sum('fabricDesign'),
    fabricTypical:        sum('fabricTypical'),
    emitterLoad:          calculateBuildingTotal(project.rooms, project),
    generatorDesignLoad:  sum('generatorDesignLoad'),
    generatorTypicalLoad: sum('generatorTypicalLoad'),
  });

  return {
    projectId: id,
    hasDesignParams: dpRows.length === 1,
    airPermeabilityMethod: project.airPermeabilityMethod,
    rawAirPermeabilityMethod: dp.air_permeability_method ?? null,
    inputs: {
      storedQ50: dp.q50 ?? null,
      sapStructural: project.sapStructural, sapFloor: project.sapFloor,
      sapWindowDraughtPct: project.sapWindowDraughtPct, sapDraughtLobby: project.sapDraughtLobby,
      buildingStoreys: project.buildingStoreys, buildingShielding: project.buildingShielding,
      externalTemp: project.externalTemp, externalTempAutoApplied, referenceTemp: project.referenceTemp,
    },
    resolvedQ50,
    sapEstimate,
    roomCount: roomResults.length,
    rooms: roomResults,
    totals,
  };
});

// ---------------------------------------------------------------------------
// Write + report
// ---------------------------------------------------------------------------

const outDir = new URL('./out/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const outFile = new URL(outName, outDir);
writeFileSync(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  database: SCRATCH_DB,
  projectCount: results.length,
  projects: results,
}, null, 2));

const count = (pred) => results.filter(pred).length;
const methods = results.reduce((m, r) => ((m[r.airPermeabilityMethod] = (m[r.airPermeabilityMethod] ?? 0) + 1), m), {});
const allRooms = results.flatMap(r => r.rooms);

console.log(`Wrote ${outFile.pathname}`);
console.log(`Projects: ${results.length}  (${Object.entries(methods).map(([k, v]) => `${k}: ${v}`).join(', ')})`);
console.log(`  without design_params row: ${count(r => !r.hasDesignParams)}`);
console.log(`  with zero rooms:           ${count(r => r.roomCount === 0)}`);
console.log(`  externalTemp auto-applied from postcode: ${count(r => r.inputs.externalTempAutoApplied)}`);
console.log(`Rooms: ${allRooms.length}   Elements: ${elements.length}`);
console.log(`  rooms with exposedEnvelopeM2 = 0: ${allRooms.filter(r => !r.exposedEnvelopeM2).length}`);

const q50s = results.map(r => r.resolvedQ50);
console.log(`Resolved q50 range: ${Math.min(...q50s).toFixed(3)} – ${Math.max(...q50s).toFixed(3)} m³/(h·m²)`);
const outOfBand = results.filter(r => r.resolvedQ50 < 1 || r.resolvedQ50 > 60);
console.log(`  outside 1–60 sane band: ${outOfBand.length}${outOfBand.length ? ' → ' + outOfBand.map(r => `${r.projectId}:${r.resolvedQ50}`).join(', ') : ''}`);

console.log(`Non-finite outputs: ${nonFinite.length}`);
for (const n of nonFinite.slice(0, 20)) console.log(`  ${n}`);

console.log('\nField audit (column missing / NULL in DB / undefined after mapping, of N rows):');
let flagged = 0;
for (const [key, a] of Object.entries(audit)) {
  const flag = a.columnMissing === a.rows ? '  ← COLUMN NOT IN DB ROW — wrong mapping?'
             : a.mappedUndefined === a.rows ? '  ← UNDEFINED IN EVERY ROW — wrong mapping?'
             : a.mappedUndefined > 0 ? '  ← some undefined'
             : '';
  if (flag) flagged++;
  console.log(`  ${key.padEnd(32)} ${String(a.columnMissing).padStart(5)} ${String(a.dbNull).padStart(6)} ${String(a.mappedUndefined).padStart(6)}  / ${a.rows}${flag}`);
}
console.log(flagged ? `\n${flagged} field(s) flagged above.` : '\nNo field is undefined after mapping.');
