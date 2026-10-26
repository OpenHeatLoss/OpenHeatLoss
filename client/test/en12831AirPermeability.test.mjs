// client/test/en12831AirPermeability.test.mjs
//
// B25 commit 3: corrected Table 2-11 lookup, resolveQ50, and the CIBSE DHDG
// 2026 ventilation worked example end to end. Run with `npm test` in client/.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lookupDefaultQ50, Q50_TABLE_2_11 } from '../src/utils/en12831VentilationData.js';
import * as data from '../src/utils/en12831VentilationData.js';
import * as calc from '../src/utils/en12831Calculations.js';

const { resolveQ50, calculateRoomVentilationEN12831 } = calc;

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol,
    `${label}: ${actual} differs from ${expected} by ${Math.abs(actual - expected)} (tolerance ${tol})`);

// ---------------------------------------------------------------------------
// lookupDefaultQ50
// ---------------------------------------------------------------------------

test('lookupDefaultQ50: means for the guide example characteristics', () => {
  assert.equal(lookupDefaultQ50({ basis: 'built_form', category: 'semi_detached' }), 9.2);
  assert.equal(lookupDefaultQ50({ basis: 'age_band', category: '1945_1964' }), 8.1);
  assert.equal(lookupDefaultQ50({ basis: 'wall_construction', category: 'cavity_uninsulated' }), 8.2);
  assert.equal(lookupDefaultQ50({ basis: 'all_dwellings' }), 8.6);
  assert.equal(lookupDefaultQ50({ basis: 'all_dwellings', statistic: 'mean' }), 8.6);
});

test('lookupDefaultQ50: median, q1 and q3 spot checks', () => {
  assert.equal(lookupDefaultQ50({ basis: 'built_form', category: 'detached', statistic: 'median' }), 8.2);
  assert.equal(lookupDefaultQ50({ basis: 'age_band', category: 'pre1919', statistic: 'q1' }), 6.8);
  assert.equal(lookupDefaultQ50({ basis: 'wall_construction', category: 'solid_uninsulated', statistic: 'q3' }), 10.4);
  assert.equal(lookupDefaultQ50({ basis: 'all_dwellings', statistic: 'q3' }), 10.2);
});

test('lookupDefaultQ50: unknown inputs return null, never a guess', () => {
  assert.equal(lookupDefaultQ50({ basis: 'tenure', category: 'semi_detached' }), null);
  assert.equal(lookupDefaultQ50({ basis: 'built_form', category: 'castle' }), null);
  assert.equal(lookupDefaultQ50({ basis: 'built_form', category: 'pre1919' }), null);   // category from another basis
  assert.equal(lookupDefaultQ50({ basis: 'built_form', category: 'constructor' }), null); // inherited key
  assert.equal(lookupDefaultQ50({ basis: 'built_form', category: null }), null);
  assert.equal(lookupDefaultQ50({ basis: 'built_form', category: 'detached', statistic: 'max' }), null);
  assert.equal(lookupDefaultQ50({ basis: 'built_form', category: 'detached', statistic: 'sd' }), null);
  assert.equal(lookupDefaultQ50({ basis: 'all_dwellings', statistic: 'mode' }), null);
  assert.equal(lookupDefaultQ50({ basis: null }), null);
  assert.equal(lookupDefaultQ50({}), null);
  assert.equal(lookupDefaultQ50(), null);
});

test('SAP estimation pathway is gone from the client', () => {
  for (const name of ['estimateQ50SAP']) assert.equal(calc[name], undefined, name);
  for (const name of ['SAP_STRUCTURAL_INFILTRATION', 'SAP_FLOOR_INFILTRATION', 'SAP_WINDOW_DOOR_INFILTRATION',
                      'SAP_STOREY_INFILTRATION', 'SAP_TO_50PA_FACTOR', 'getStoreyInfiltration']) {
    assert.equal(data[name], undefined, name);
  }
  assert.equal(typeof data.getHeightBand, 'function');   // still needed by Table 2-13
});

// ---------------------------------------------------------------------------
// resolveQ50
// ---------------------------------------------------------------------------

test('resolveQ50: stored methods return project.q50 unchanged', () => {
  for (const method of ['measured', 'legacy_sap', 'design_target']) {
    assert.deepEqual(resolveQ50({ airPermeabilityMethod: method, q50: 16.649999999999995 }),
      { q50: 16.649999999999995, defaulted: false }, method);
  }
});

test('resolveQ50: default_table looks up the selection', () => {
  const base = { airPermeabilityMethod: 'default_table', q50: 8.6 };
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'built_form', q50BuiltForm: 'semi_detached', q50Statistic: 'mean' }),
    { q50: 9.2, defaulted: false });
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'age_band', q50AgeBand: '1945_1964', q50Statistic: 'q3' }),
    { q50: 9.9, defaulted: false });
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'wall_construction', q50WallConstruction: 'cavity_uninsulated', q50Statistic: 'median' }),
    { q50: 7.8, defaulted: false });
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'all_dwellings', q50Statistic: 'q1' }),
    { q50: 6.5, defaulted: false });
  // Statistic missing → mean
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'built_form', q50BuiltForm: 'bungalow' }),
    { q50: 7.6, defaulted: false });
  // Only the category for the selected basis counts; the others are inert.
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'age_band', q50AgeBand: 'post1990',
                                q50BuiltForm: 'flat', q50WallConstruction: 'other' }),
    { q50: 9.3, defaulted: false });
});

test('resolveQ50: default_table with nothing selected falls back to the all-dwellings mean, flagged', () => {
  const base = { airPermeabilityMethod: 'default_table', q50: 12 };   // stored q50 is ignored
  const fallback = { q50: Q50_TABLE_2_11.all.mean, defaulted: true };
  assert.equal(fallback.q50, 8.6);
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: null }), fallback);
  assert.deepEqual(resolveQ50(base), fallback);
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'built_form', q50BuiltForm: null }), fallback);
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'age_band' }), fallback);
  // Fallback is the mean even if another statistic is selected.
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'wall_construction', q50Statistic: 'q3' }), fallback);
});

test('resolveQ50: invalid default_table selection logs and falls back, flagged', (t) => {
  const err = t.mock.method(console, 'error', () => {});
  const base = { airPermeabilityMethod: 'default_table', q50: 12 };
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'tenure' }), { q50: 8.6, defaulted: true });
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'built_form', q50BuiltForm: 'castle' }), { q50: 8.6, defaulted: true });
  assert.deepEqual(resolveQ50({ ...base, q50SelectionBasis: 'built_form', q50BuiltForm: 'flat', q50Statistic: 'max' }), { q50: 8.6, defaulted: true });
  assert.equal(err.mock.callCount(), 3);
});

test("resolveQ50: unknown method (including 'estimated') logs and uses stored q50, no throw", (t) => {
  const err = t.mock.method(console, 'error', () => {});
  assert.deepEqual(resolveQ50({ airPermeabilityMethod: 'estimated', q50: 12 }), { q50: 12, defaulted: false });
  assert.deepEqual(resolveQ50({ airPermeabilityMethod: undefined, q50: 5 }), { q50: 5, defaulted: false });
  assert.equal(err.mock.callCount(), 2);
  assert.match(err.mock.calls[0].arguments[0], /unknown airPermeabilityMethod "estimated"/);
});

// ---------------------------------------------------------------------------
// CIBSE DHDG 2026 worked example — one room, end to end
//
// Exposed envelope 45 m², q50 10.4 m³/(h·m²), one trickle vent + one
// intermittent fan (+108 m³/h at 50 Pa, Table 2-12), normal shielding,
// 2 storeys (Table 2-13 factor 0.05) → leakage 28.8 m³/h. (The guide's intro
// quotes 19.3 m³/h; that is a typo — the worksheet uses 28.8.)
// MVHR 39 m³/h at 84% efficiency. Ti 21 °C, Te 0.9 °C, Te,ref 10.1 °C.
// Guide figures: emitter 436.1 W, generator design 239.3 W, typical 129.3 W.
// ---------------------------------------------------------------------------

const GUIDE = { emitter: 436.1, design: 239.3, typical: 129.3 };
const Ti = 21, Te = 0.9, TeRef = 10.1, ENVELOPE = 45, Q50 = 10.4, MVHR_RATE = 39, MVHR_EFF = 0.84;

test('worked example (a): guide worksheet arithmetic, 1 dp rounding as the guide does', () => {
  // The guide rounds supply temperatures and temperature-weighted factors to
  // 1 dp. Reproducing that rounding here (and ONLY here — not in the app)
  // shows our method is the guide's method; the residual is display rounding.
  const r1 = (x) => Math.round(x * 10) / 10;

  const leakage        = (ENVELOPE * Q50 + 54 + 54) * 0.05;          // 28.8 m³/h
  const leakDesign     = r1(leakage * (Ti - Te));                    // 578.9
  const leakTypical    = r1(leakage * (Ti - TeRef));                 // 313.9
  const supplyDesign   = r1(Te    + MVHR_EFF * (Ti - Te));           // 17.8 °C
  const supplyTypical  = r1(TeRef + MVHR_EFF * (Ti - TeRef));        // 19.3 °C
  const contDesign     = r1(MVHR_RATE * (Ti - supplyDesign));        // 124.8
  const contTypical    = r1(MVHR_RATE * (Ti - supplyTypical));       // 66.3

  near(leakage, 28.8, 1e-9, 'leakage');
  assert.deepEqual([leakDesign, leakTypical, supplyDesign, supplyTypical, contDesign, contTypical],
                   [578.9, 313.9, 17.8, 19.3, 124.8, 66.3]);

  near((leakDesign * 2 + contDesign) * 0.34, GUIDE.emitter, 0.05, 'emitter');   // 436.08
  near((leakDesign + contDesign) * 0.34,     GUIDE.design,  0.05, 'design');    // 239.26
  near((leakTypical + contTypical) * 0.34,   GUIDE.typical, 0.05, 'typical');   // 129.27
});

test('worked example (b): real unrounded calculation code', () => {
  const project = {
    airPermeabilityMethod: 'measured', q50: Q50,
    buildingShielding: 'normal', buildingStoreys: 2,
    externalTemp: Te, referenceTemp: TeRef,
  };
  const room = {
    exposedEnvelopeM2: ENVELOPE, bgVentCount: 1, bgFanCount: 1,
    internalTemp: Ti, roomType: 'living_room', volume: 40,
    continuousVentType: 'mvhr', continuousVentRateM3h: MVHR_RATE, mvhrEfficiency: MVHR_EFF,
  };
  const r = calculateRoomVentilationEN12831(room, project);

  near(r.stages.leakage.approximateRoomLeakageRate, 28.8, 1e-9, 'leakage');

  // Our unrounded figures.
  near(r.ventEmitter,          436.28, 0.01, 'emitter');
  near(r.ventGeneratorDesign,  239.46, 0.01, 'design');
  near(r.ventGeneratorTypical, 129.86, 0.01, 'typical');

  // Against the guide. The 0.7 W tolerance is derived, not chosen: the guide
  // rounds supply temperature to 1 dp, an error of up to 0.05 °C, and
  // 0.05 °C × 39 m³/h × 0.34 W·h/(m³·K) = 0.66 W on the MVHR term.
  // (The typical figure differs by 0.56 W for exactly this reason.)
  near(r.ventEmitter,          GUIDE.emitter, 0.7, 'emitter vs guide');
  near(r.ventGeneratorDesign,  GUIDE.design,  0.7, 'design vs guide');
  near(r.ventGeneratorTypical, GUIDE.typical, 0.7, 'typical vs guide');
});
