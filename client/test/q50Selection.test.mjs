// client/test/q50Selection.test.mjs
//
// B25 commits 4 and 4a: pure logic behind the rebuilt air permeability UI.
// Run with `npm test` in client/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Q50_TABLE_2_11, Q50_CATEGORY_FIELD } from '../src/utils/en12831VentilationData.js';
import { resolveQ50, calculateBuildingVentilationEN12831 } from '../src/utils/en12831Calculations.js';
import { calculateTransmissionLoss } from '../src/utils/calculations.js';
import { buildDesignParamsPayload } from '../src/utils/projectPayloads.js';
import {
  AIR_PERMEABILITY_FIELDS,
  buildQ50SelectionUpdate,
  q50Candidate,
  Q50_PICKER_BASES,
  initialQ50Picker,
  savedQ50Selection,
  q50PickerView,
  q50PickerChange,
  q50PickerApply,
  q50PickerUpdate,
  q50CategoryOptionLabel,
  airPermeabilitySnapshot,
  ventilationTotalsChange,
  formatSignedKW,
  validateQ50Input,
} from '../src/utils/q50Selection.js';

const BASES = ['built_form', 'age_band', 'wall_construction', 'all_dwellings'];
const STATS = ['mean', 'median', 'q1', 'q3'];
const CATEGORY_KEYS = ['q50BuiltForm', 'q50AgeBand', 'q50WallConstruction'];

// The server's designParams.update for the q50_* columns: COALESCE($n, column)
// — a null in the payload keeps the stored value. Method/q50 are written when
// non-null and not 'estimated'.
const serverMerge = (stored, payload) => {
  const out = { ...stored };
  for (const k of ['q50SelectionBasis', 'q50Statistic', ...CATEGORY_KEYS]) out[k] = payload[k] ?? stored[k];
  if (payload.airPermeabilityMethod && payload.airPermeabilityMethod !== 'estimated') {
    out.airPermeabilityMethod = payload.airPermeabilityMethod;
    if (payload.q50 != null) out.q50 = payload.q50;
  }
  return out;
};

// Every complete selection in Table 2-11.
const allSelections = () => BASES.flatMap(basis =>
  (basis === 'all_dwellings' ? [null] : Object.keys(Q50_TABLE_2_11[basis])).flatMap(category =>
    STATS.map(statistic => ({ basis, category, statistic }))));

// ---------------------------------------------------------------------------
// Selection and category clearing
// ---------------------------------------------------------------------------

test('buildQ50SelectionUpdate: sets the basis category and clears the other two', () => {
  assert.deepEqual(buildQ50SelectionUpdate({ basis: 'age_band', category: '1945_1964', statistic: 'mean' }), {
    airPermeabilityMethod: 'default_table', q50: 8.1,
    q50SelectionBasis: 'age_band',
    q50BuiltForm: null, q50AgeBand: '1945_1964', q50WallConstruction: null,
    q50Statistic: 'mean',
  });
  assert.deepEqual(buildQ50SelectionUpdate({ basis: 'all_dwellings', statistic: 'q3' }), {
    airPermeabilityMethod: 'default_table', q50: 10.2,
    q50SelectionBasis: 'all_dwellings',
    q50BuiltForm: null, q50AgeBand: null, q50WallConstruction: null,
    q50Statistic: 'q3',
  });
});

test('buildQ50SelectionUpdate: incomplete or invalid selections give null, never a partial update', () => {
  assert.equal(buildQ50SelectionUpdate({ basis: 'built_form', category: null, statistic: 'mean' }), null);
  assert.equal(buildQ50SelectionUpdate({ basis: 'built_form', category: 'pre1919', statistic: 'mean' }), null);
  assert.equal(buildQ50SelectionUpdate({ basis: 'tenure', category: 'flat', statistic: 'mean' }), null);
  assert.equal(buildQ50SelectionUpdate({ basis: null, statistic: 'mean' }), null);
  for (const statistic of ['min', 'max', 'sd', undefined, null]) {
    assert.equal(buildQ50SelectionUpdate({ basis: 'built_form', category: 'detached', statistic }), null, String(statistic));
  }
  assert.equal(buildQ50SelectionUpdate(), null);
});

test('every complete selection: the update carries the Table 2-11 value and resolves to it', () => {
  for (const sel of allSelections()) {
    const u = buildQ50SelectionUpdate(sel);
    const row = sel.basis === 'all_dwellings' ? Q50_TABLE_2_11.all : Q50_TABLE_2_11[sel.basis][sel.category];
    assert.equal(u.q50, row[sel.statistic], JSON.stringify(sel));
    assert.deepEqual(resolveQ50(u), { q50: row[sel.statistic], defaulted: false }, JSON.stringify(sel));
    // Exactly one category key is non-null (none for all dwellings).
    assert.equal(CATEGORY_KEYS.filter(k => u[k] !== null).length, sel.basis === 'all_dwellings' ? 0 : 1);
  }
});

test('stale categories the server cannot clear are never used (COALESCE round trip)', () => {
  // Start from every possible stored row, including a stale value in EVERY
  // category column, then save every selection through the server's merge.
  const staleStored = {
    airPermeabilityMethod: 'default_table', q50: 8.6, q50Statistic: 'mean',
    q50SelectionBasis: 'built_form',
    q50BuiltForm: 'detached', q50AgeBand: 'pre1919', q50WallConstruction: 'solid_insulated',
  };
  for (const sel of allSelections()) {
    const update = buildQ50SelectionUpdate(sel);
    const reloaded = serverMerge(staleStored, update);
    // What the screen showed before saving === what reloads from the database.
    assert.deepEqual(resolveQ50(reloaded), resolveQ50(update), JSON.stringify(sel));
    // The basis is always saved with its own category, freshly written.
    if (sel.basis !== 'all_dwellings') {
      assert.equal(reloaded[Q50_CATEGORY_FIELD[sel.basis]], sel.category);
    }
  }
});

// ---------------------------------------------------------------------------
// Candidates (legacy comparison)
// ---------------------------------------------------------------------------

test('q50Candidate: values for the guide example characteristics, statistics only', () => {
  assert.deepEqual(q50Candidate('built_form', 'semi_detached'),
    { basis: 'built_form', category: 'semi_detached', mean: 9.2, q1: 7.1, median: 8.6, q3: 10.8 });
  assert.deepEqual(q50Candidate('age_band', '1945_1964'),
    { basis: 'age_band', category: '1945_1964', mean: 8.1, q1: 5.7, median: 7.7, q3: 9.9 });
  assert.deepEqual(q50Candidate('wall_construction', 'cavity_uninsulated'),
    { basis: 'wall_construction', category: 'cavity_uninsulated', mean: 8.2, q1: 5.8, median: 7.8, q3: 10.3 });
  assert.deepEqual(q50Candidate('all_dwellings'),
    { basis: 'all_dwellings', category: undefined, mean: 8.6, q1: 6.5, median: 8.1, q3: 10.2 });
  // min, max and sd are deliberately not exposed.
  for (const k of ['min', 'max', 'sd']) assert.equal(k in q50Candidate('built_form', 'flat'), false, k);
  assert.equal(q50Candidate('built_form', 'castle'), null);
  assert.equal(q50Candidate('built_form', 'constructor'), null);
  assert.equal(q50Candidate('built_form', null), null);
  assert.equal(q50Candidate('tenure', 'flat'), null);
});

// ---------------------------------------------------------------------------
// Candidate picker (both modes)
// ---------------------------------------------------------------------------

// Apply a sequence of actions the way the component does.
const act = (state, ...changes) => changes.reduce(q50PickerChange, state);
const freshProject = {
  id: 9, airPermeabilityMethod: 'default_table', q50: 8.6, q50Statistic: 'mean',
  q50SelectionBasis: null, q50BuiltForm: null, q50AgeBand: null, q50WallConstruction: null,
};

test('picker: four candidates including All dwellings, nothing preselected', () => {
  assert.deepEqual(Q50_PICKER_BASES, ['built_form', 'age_band', 'wall_construction', 'all_dwellings']);
  const s = initialQ50Picker();
  assert.deepEqual(s, {
    categories: { built_form: null, age_band: null, wall_construction: null },
    pickedBasis: null, statistic: null,
  });
  assert.equal(q50PickerUpdate(s), null);
  // A fresh object each time — no shared mutable default.
  assert.notEqual(initialQ50Picker(), initialQ50Picker());
  assert.notEqual(initialQ50Picker().categories, initialQ50Picker().categories);
});

test('picker: a project with no saved selection shows nothing selected', () => {
  // New project on the all-dwellings fallback, basis chosen without category,
  // and other methods (legacy_sap, measured) — even with stale q50_* values.
  for (const p of [
    freshProject,
    { ...freshProject, q50SelectionBasis: 'age_band' },
    { ...freshProject, airPermeabilityMethod: 'legacy_sap', q50: 16.6, q50SelectionBasis: 'built_form', q50BuiltForm: 'detached' },
    { ...freshProject, airPermeabilityMethod: 'measured',   q50: 5.2,  q50SelectionBasis: 'built_form', q50BuiltForm: 'detached' },
  ]) {
    assert.equal(savedQ50Selection(p), null, JSON.stringify(p));
    assert.deepEqual(q50PickerView(initialQ50Picker(), p), initialQ50Picker());
  }
});

test('picker: a saved selection shows that candidate and statistic; other cards start empty', () => {
  const saved = { ...freshProject, ...buildQ50SelectionUpdate({ basis: 'age_band', category: '1945_1964', statistic: 'q3' }),
                  q50BuiltForm: 'detached' };   // stale, must not show
  assert.deepEqual(savedQ50Selection(saved), { basis: 'age_band', category: '1945_1964', statistic: 'q3' });
  assert.deepEqual(q50PickerView(initialQ50Picker(), saved), {
    categories: { built_form: null, age_band: '1945_1964', wall_construction: null },
    pickedBasis: 'age_band', statistic: 'q3',
  });
  const all = { ...freshProject, ...buildQ50SelectionUpdate({ basis: 'all_dwellings', statistic: 'median' }) };
  assert.deepEqual(q50PickerView(initialQ50Picker(), all), { ...initialQ50Picker(), pickedBasis: 'all_dwellings', statistic: 'median' });
  // A missing statistic is shown as the one resolveQ50 uses ('mean').
  assert.equal(savedQ50Selection({ ...saved, q50Statistic: null }).statistic, 'mean');
});

test('picker select mode: comparing other cards changes nothing until "Use this candidate"', () => {
  const saved = { ...freshProject, ...buildQ50SelectionUpdate({ basis: 'built_form', category: 'semi_detached', statistic: 'mean' }) };
  let view = q50PickerView(initialQ50Picker(), saved);
  // Choose categories on the other cards: no update.
  let r = q50PickerApply(view, { category: ['age_band', 'pre1919'] }, saved);
  assert.equal(r.update, null);
  r = q50PickerApply(q50PickerView(r.state, saved), { category: ['wall_construction', 'solid_uninsulated'] }, saved);
  assert.equal(r.update, null);
  // Re-picking the card already in use, or the statistic already in use: no update.
  view = q50PickerView(r.state, saved);
  assert.equal(q50PickerApply(view, { pick: 'built_form' }, saved).update, null);
  assert.equal(q50PickerApply(view, { statistic: 'mean' }, saved).update, null);
  // Picking a card with no category: ignored.
  assert.equal(q50PickerApply(q50PickerView(initialQ50Picker(), saved), { pick: 'age_band' }, saved).update, null);
  // "Use this candidate" on a different card: a complete update, other categories cleared.
  r = q50PickerApply(view, { pick: 'age_band' }, saved);
  assert.deepEqual(r.update, {
    airPermeabilityMethod: 'default_table', q50: Q50_TABLE_2_11.age_band.pre1919.mean,
    q50SelectionBasis: 'age_band',
    q50BuiltForm: null, q50AgeBand: 'pre1919', q50WallConstruction: null,
    q50Statistic: 'mean',
  });
  // The comparison cards keep what was chosen on them (built form stays shown).
  assert.equal(r.state.categories.built_form, 'semi_detached');
  // Statistic change on the picked card, and category change on the picked card, apply.
  assert.equal(q50PickerApply(view, { statistic: 'q1' }, saved).update.q50, 7.1);
  assert.equal(q50PickerApply(view, { category: ['built_form', 'detached'] }, saved).update.q50BuiltForm, 'detached');
});

test('picker select mode: no saved selection — applies only once candidate AND statistic are picked', () => {
  let r = q50PickerApply(q50PickerView(initialQ50Picker(), freshProject), { category: ['wall_construction', 'cavity_insulated'] }, freshProject);
  assert.equal(r.update, null);
  r = q50PickerApply(r.state, { pick: 'wall_construction' }, freshProject);
  assert.equal(r.update, null);                              // no statistic yet
  r = q50PickerApply(r.state, { statistic: 'median' }, freshProject);
  assert.equal(r.update.q50SelectionBasis, 'wall_construction');
  assert.equal(r.update.q50WallConstruction, 'cavity_insulated');
  assert.equal(r.update.q50, Q50_TABLE_2_11.wall_construction.cavity_insulated.median);
  // Statistic first, then All dwellings (no category needed).
  r = q50PickerApply(initialQ50Picker(), { statistic: 'q3' }, freshProject);
  assert.equal(r.update, null);
  r = q50PickerApply(r.state, { pick: 'all_dwellings' }, freshProject);
  assert.deepEqual(r.update, buildQ50SelectionUpdate({ basis: 'all_dwellings', statistic: 'q3' }));
  assert.equal(r.update.q50, 10.2);
});

test('picker update-legacy mode: needs a deliberate candidate AND statistic', () => {
  const cats = act(initialQ50Picker(),
    { category: ['built_form', 'semi_detached'] }, { category: ['age_band', '1945_1964'] },
    { category: ['wall_construction', 'cavity_uninsulated'] });
  assert.equal(q50PickerUpdate(cats), null);                                   // no pick, no statistic
  assert.equal(q50PickerUpdate(act(cats, { statistic: 'mean' })), null);       // statistic, no pick
  assert.equal(q50PickerUpdate(act(cats, { pick: 'age_band' })), null);        // pick, no statistic
  // Clearing the picked card's category un-picks it.
  assert.equal(act(cats, { pick: 'age_band' }, { category: ['age_band', ''] }).pickedBasis, null);
  // min/max/sd and unknown categories are ignored.
  for (const statistic of ['min', 'max', 'sd']) assert.equal(act(cats, { statistic }).statistic, null, statistic);
  assert.equal(act(cats, { category: ['age_band', 'castle'] }).categories.age_band, '1945_1964');
  assert.equal(act(cats, { category: ['tenure', 'flat'] }), cats);
  // Complete: only the picked candidate's category is saved.
  assert.deepEqual(q50PickerUpdate(act(cats, { pick: 'age_band' }, { statistic: 'q3' })), {
    airPermeabilityMethod: 'default_table', q50: 9.9,
    q50SelectionBasis: 'age_band',
    q50BuiltForm: null, q50AgeBand: '1945_1964', q50WallConstruction: null,
    q50Statistic: 'q3',
  });
  // All dwellings is a valid candidate here too.
  assert.equal(q50PickerUpdate(act(cats, { pick: 'all_dwellings' }, { statistic: 'mean' })).q50, 8.6);
});

test('picker: every pick saved over stale columns reloads to what the screen showed', () => {
  const staleStored = {
    airPermeabilityMethod: 'default_table', q50: 8.6, q50Statistic: 'mean',
    q50SelectionBasis: 'built_form',
    q50BuiltForm: 'detached', q50AgeBand: 'pre1919', q50WallConstruction: 'solid_insulated',
  };
  for (const sel of allSelections()) {
    const state = act(initialQ50Picker(),
      ...(sel.category ? [{ category: [sel.basis, sel.category] }] : []),
      { pick: sel.basis }, { statistic: sel.statistic });
    const update = q50PickerUpdate(state);
    assert.deepEqual(update, buildQ50SelectionUpdate(sel), JSON.stringify(sel));
    const reloaded = serverMerge(staleStored, update);
    assert.deepEqual(resolveQ50(reloaded), resolveQ50(update), JSON.stringify(sel));
    // Reloaded, the picker shows exactly the pick.
    const view = q50PickerView(initialQ50Picker(), reloaded);
    assert.equal(view.pickedBasis, sel.basis);
    assert.equal(view.statistic, sel.statistic);
    if (sel.category) assert.equal(view.categories[sel.basis], sel.category);
  }
});

test('q50CategoryOptionLabel: value for the chosen statistic, mean when none', () => {
  assert.equal(q50CategoryOptionLabel('built_form', 'detached', null), `Detached — ${Q50_TABLE_2_11.built_form.detached.mean.toFixed(1)}`);
  assert.equal(q50CategoryOptionLabel('built_form', 'semi_detached', 'mean'), 'Semi-detached — 9.2');
  assert.equal(q50CategoryOptionLabel('built_form', 'semi_detached', 'q1'), 'Semi-detached — 7.1');
  assert.equal(q50CategoryOptionLabel('built_form', 'semi_detached', 'median'), 'Semi-detached — 8.6');
  assert.equal(q50CategoryOptionLabel('built_form', 'semi_detached', 'q3'), 'Semi-detached — 10.8');
  assert.equal(q50CategoryOptionLabel('age_band', '1945_1964', 'q3'), '1945–1964 — 9.9');
  assert.equal(q50CategoryOptionLabel('wall_construction', 'cavity_uninsulated', 'max'), 'Cavity, uninsulated — 8.2');   // not offered → mean
  assert.equal(q50CategoryOptionLabel('built_form', 'castle', 'mean'), null);
});

// ---------------------------------------------------------------------------
// Change in totals
// ---------------------------------------------------------------------------

const room = (id, extra = {}) => ({
  id, name: `Room ${id}`, internalTemp: 21, volume: 40, roomType: 'living_room',
  exposedEnvelopeM2: 45, bgVentCount: 1, bgFanCount: 1,
  thermalBridgingAddition: 0.1,
  elements: [{ id: id * 10, area: 12, uValue: 0.3, tempFactor: 1, customDeltaT: null, subtractFromElementId: null }],
  ...extra,
});
const project = {
  id: 1, ventilationMethod: 'en12831_cibse2026',
  buildingShielding: 'normal', buildingStoreys: 2, externalTemp: -3, referenceTemp: 10.1,
  airPermeabilityMethod: 'legacy_sap', q50: 16.649999999999995,
  q50SelectionBasis: null, q50BuiltForm: null, q50AgeBand: null, q50WallConstruction: null, q50Statistic: 'mean',
  rooms: [room(1), room(2, { exposedEnvelopeM2: 20, continuousVentType: 'mvhr', continuousVentRateM3h: 39, mvhrEfficiency: 0.84 })],
};

test('ventilationTotalsChange: is the difference of two calls to the building calculation', () => {
  const update = buildQ50SelectionUpdate({ basis: 'built_form', category: 'semi_detached', statistic: 'mean' });
  const c = ventilationTotalsChange(project, airPermeabilitySnapshot(project), update);
  const base = calculateBuildingVentilationEN12831(project.rooms, project);
  const cand = calculateBuildingVentilationEN12831(project.rooms, { ...project, ...update });
  assert.equal(c.baselineQ50, 16.649999999999995);
  assert.equal(c.candidateQ50, 9.2);
  assert.equal(c.generatorDeltaW, cand.buildingVentGeneratorDesign - base.buildingVentGeneratorDesign);
  assert.equal(c.emitterDeltaW,   cand.buildingVentEmitter         - base.buildingVentEmitter);
  assert.ok(c.generatorDeltaW < 0 && c.emitterDeltaW < c.generatorDeltaW);   // lower q50, emitter moves twice as much

  // Same as the change in Summary's full totals (fabric + ventilation): fabric
  // does not depend on q50.
  const fabric = (p) => p.rooms.reduce((s, r) => s + calculateTransmissionLoss(r, p.externalTemp ?? -3), 0);
  const summaryGenerator = (p) => fabric(p) + calculateBuildingVentilationEN12831(p.rooms, p).buildingVentGeneratorDesign;
  const summaryEmitter   = (p) => fabric(p) + calculateBuildingVentilationEN12831(p.rooms, p).buildingVentEmitter;
  const candProject = { ...project, ...update };
  assert.ok(Math.abs((summaryGenerator(candProject) - summaryGenerator(project)) - c.generatorDeltaW) < 1e-9);
  assert.ok(Math.abs((summaryEmitter(candProject)   - summaryEmitter(project))   - c.emitterDeltaW)   < 1e-9);
});

test('ventilationTotalsChange: zero for identical fields; null when nothing reliable to show', () => {
  const same = ventilationTotalsChange(project, airPermeabilitySnapshot(project), airPermeabilitySnapshot(project));
  assert.equal(same.generatorDeltaW, 0);
  assert.equal(same.emitterDeltaW, 0);
  assert.equal(ventilationTotalsChange(project, undefined, airPermeabilitySnapshot(project)), null);   // no snapshot
  assert.equal(ventilationTotalsChange({ ...project, rooms: [] }, airPermeabilitySnapshot(project), airPermeabilitySnapshot(project)), null);
  assert.equal(ventilationTotalsChange({ ...project, ventilationMethod: 'legacy' }, airPermeabilitySnapshot(project), airPermeabilitySnapshot(project)), null);
  // A non-finite input never produces a number.
  assert.equal(ventilationTotalsChange(project, airPermeabilitySnapshot(project), { airPermeabilityMethod: 'measured', q50: NaN }), null);
});

test('formatSignedKW: signed kW to two decimals, no "−0.00"', () => {
  assert.equal(formatSignedKW(123), '+0.12 kW');
  assert.equal(formatSignedKW(-54), '−0.05 kW');
  assert.equal(formatSignedKW(-1), '0.00 kW');
  assert.equal(formatSignedKW(0), '0.00 kW');
  assert.equal(formatSignedKW(1000), '+1.00 kW');
  assert.equal(formatSignedKW(-1234.5), '−1.23 kW');
});

// ---------------------------------------------------------------------------
// Opened-project snapshot never reaches the database
// ---------------------------------------------------------------------------

test('airPermeabilitySnapshot: exactly the air permeability fields, frozen', () => {
  const snap = airPermeabilitySnapshot({ ...project, unrelated: 1 });
  assert.deepEqual(Object.keys(snap), AIR_PERMEABILITY_FIELDS);
  assert.equal(snap.q50, 16.649999999999995);
  assert.ok(Object.isFrozen(snap));
});

test('buildDesignParamsPayload never includes the airPermeabilityAtOpen snapshot', () => {
  const withSnap = { ...project, airPermeabilityAtOpen: airPermeabilitySnapshot(project) };
  const payload = buildDesignParamsPayload(withSnap);
  assert.equal('airPermeabilityAtOpen' in payload, false);
  assert.equal(JSON.stringify(payload).includes('airPermeabilityAtOpen'), false);
  // Overrides are the only other way in; none of the call sites pass it.
  assert.equal('airPermeabilityAtOpen' in buildDesignParamsPayload(withSnap, { q50: 5 }), false);
});

test('no client source spreads or Object.assigns a whole project object (the snapshot could leak)', () => {
  // A spread of the project into an API payload would carry airPermeabilityAtOpen
  // (and rooms etc.) to the server. State updates use `...prev`, not these names.
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(name) && !/\([a-z]\)\./.test(name)) files.push(p);   // skip "(a)" backups
    }
  };
  walk(root);
  const hits = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/\.\.\.\s*(currentProject|project|proj|withSnap)\b/.test(line) ||
          /Object\.assign\([^)]*\b(currentProject|project|proj)\b/.test(line)) {
        hits.push(`${f.slice(root.length)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  // Reviewed allowlist — every entry is a state update or a calculation-only
  // copy, never an API payload. A new spread fails this test until reviewed.
  const ALLOWED = [
    // loadProject: the new React state object (adds the snapshot itself).
    /^App\.jsx:\d+: \.\.\.project,$/,
    // Calculation-only copies for resolveQ50 / the building calculation.
    /^components\/project\/AirPermeabilitySettings\.jsx:\d+: const next = \{ \.\.\.project, airPermeabilityMethod: 'default_table' \};$/,
    /^utils\/q50Selection\.js:\d+: const baselineProject  = \{ \.\.\.project, \.\.\.baselineFields \};$/,
    /^utils\/q50Selection\.js:\d+: const candidateProject = \{ \.\.\.project, \.\.\.candidateFields \};$/,
  ];
  assert.deepEqual(hits.filter(h => !ALLOWED.some(re => re.test(h))), []);
  // And each allowlisted spread still exists exactly once (the list stays honest).
  for (const re of ALLOWED) assert.equal(hits.filter(h => re.test(h)).length, 1, String(re));
});

// ---------------------------------------------------------------------------
// Design target input
// ---------------------------------------------------------------------------

test('validateQ50Input: same range as the measured input (0.5–50)', () => {
  for (const ok of ['0.5', '5', '5.0', '12.3', '50', ' 7 ']) {
    assert.equal(validateQ50Input(ok).error, undefined, ok);
  }
  assert.equal(validateQ50Input('5').value, 5);
  for (const bad of ['', '  ', 'abc', '0.4', '50.1', '-1', 'NaN', 'Infinity', null, undefined]) {
    assert.match(validateQ50Input(bad).error ?? '', /between 0\.5 and 50/, String(bad));
  }
});
