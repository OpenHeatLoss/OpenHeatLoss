// client/src/utils/q50Selection.js
//
// Pure logic for the B25 air permeability UI (AirPermeabilitySettings.jsx,
// Q50CandidatePicker.jsx): building a Table 2-11 selection, the candidate picker,
// the opened-project snapshot, and the live change in building totals.
//
// No formulas live here. The change in totals is the difference between two
// calls to calculateBuildingVentilationEN12831() — the same function Summary
// uses for its building totals. Fabric loss does not depend on q50, so the
// ventilation difference IS the difference in generator and emitter totals.

import {
  Q50_TABLE_2_11,
  Q50_STATISTICS,
  Q50_CATEGORY_FIELD,
  Q50_CATEGORY_LABELS,
  Q50_INPUT_MIN,
  Q50_INPUT_MAX,
  lookupDefaultQ50,
} from './en12831VentilationData';
import { resolveQ50, calculateBuildingVentilationEN12831 } from './en12831Calculations';

// The project fields that define air permeability. Snapshot and comparison
// both work on exactly this set.
export const AIR_PERMEABILITY_FIELDS = [
  'airPermeabilityMethod', 'q50',
  'q50SelectionBasis', 'q50BuiltForm', 'q50AgeBand', 'q50WallConstruction', 'q50Statistic',
];

/**
 * Field updates that put a project on default_table with a complete
 * selection, or null if the selection is incomplete or not in Table 2-11.
 *
 * All three category fields are always written: the one for the basis gets
 * the category, the other two are cleared to null. q50 is set to the looked-up
 * value so the stored column matches what the calculation uses.
 *
 * The server's COALESCE cannot clear a category column, so the cleared ones
 * may come back from the database on reload. That is harmless: resolveQ50
 * only reads the category matching q50SelectionBasis, and because this
 * function never returns a basis without its category, the matching column is
 * always the one just written.
 *
 * @param {Object} sel
 * @param {string} sel.basis      'built_form' | 'age_band' | 'wall_construction' | 'all_dwellings'
 * @param {string} [sel.category] row key (not used for 'all_dwellings')
 * @param {string} sel.statistic  'mean' | 'median' | 'q1' | 'q3'
 * @returns {Object|null}
 */
export const buildQ50SelectionUpdate = ({ basis, category = null, statistic } = {}) => {
  const isAll = basis === 'all_dwellings';
  if (!isAll && !Object.hasOwn(Q50_CATEGORY_FIELD, basis ?? '')) return null;
  // Explicit: lookupDefaultQ50 would default a missing statistic to 'mean',
  // which would save a value with q50Statistic undefined.
  if (!Q50_STATISTICS.includes(statistic)) return null;
  const q50 = lookupDefaultQ50({ basis, category: isAll ? null : category, statistic });
  if (q50 === null) return null;

  const update = {
    airPermeabilityMethod: 'default_table',
    q50,
    q50SelectionBasis:   basis,
    q50BuiltForm:        null,
    q50AgeBand:          null,
    q50WallConstruction: null,
    q50Statistic:        statistic,
  };
  if (!isAll) update[Q50_CATEGORY_FIELD[basis]] = category;
  return update;
};

/**
 * One Table 2-11 candidate for display: the selectable statistics for a
 * basis/category, or null if there is no such row.
 */
export const q50Candidate = (basis, category) => {
  const row = basis === 'all_dwellings'
    ? Q50_TABLE_2_11.all
    : (Object.hasOwn(Q50_CATEGORY_FIELD, basis ?? '') && Object.hasOwn(Q50_TABLE_2_11[basis], category ?? ''))
      ? Q50_TABLE_2_11[basis][category]
      : null;
  if (!row) return null;
  return { basis, category, mean: row.mean, q1: row.q1, median: row.median, q3: row.q3 };
};

// ---------------------------------------------------------------------------
// Candidate picker (Q50CandidatePicker.jsx) — used for default_table projects
// ('select' mode) and for the legacy_sap update ('update-legacy' mode)
// ---------------------------------------------------------------------------

// The candidates offered, in display order. 'all_dwellings' has no category.
export const Q50_PICKER_BASES = ['built_form', 'age_band', 'wall_construction', 'all_dwellings'];

/**
 * Picker state with nothing chosen: no category in any column, no candidate
 * picked, no statistic.
 */
export const initialQ50Picker = () => ({
  categories: { built_form: null, age_band: null, wall_construction: null },
  pickedBasis: null,
  statistic: null,
});

/**
 * The selection a default_table project is using, or null when it has none
 * (still on the all-dwellings fallback) or is on another method. Derived from
 * resolveQ50, so it is exactly the selection the calculation reads.
 *
 * @returns {{ basis, category, statistic }|null}
 */
export const savedQ50Selection = (project) => {
  if (project?.airPermeabilityMethod !== 'default_table' || resolveQ50(project).defaulted) return null;
  const basis = project.q50SelectionBasis;
  if (!Q50_PICKER_BASES.includes(basis)) return null;
  const statistic = project.q50Statistic ?? 'mean';   // resolveQ50's default
  if (!Q50_STATISTICS.includes(statistic)) return null;
  const category = basis === 'all_dwellings' ? null : project[Q50_CATEGORY_FIELD[basis]];
  return { basis, category, statistic };
};

/**
 * What the picker shows: the local state, with the project's own selection
 * (if any) laid over it. The selected column and statistic therefore always
 * reflect the project; the other columns are local comparison only.
 */
export const q50PickerView = (local, project) => {
  const saved = savedQ50Selection(project);
  if (!saved) return local;
  return {
    categories: saved.basis === 'all_dwellings'
      ? local.categories
      : { ...local.categories, [saved.basis]: saved.category },
    pickedBasis: saved.basis,
    statistic: saved.statistic,
  };
};

/** True when the column can be picked: a category is chosen, or All dwellings. */
export const q50PickerColumnReady = (state, basis) =>
  basis === 'all_dwellings' || (Object.hasOwn(Q50_CATEGORY_FIELD, basis ?? '') && state.categories?.[basis] != null);

/**
 * Apply one user action to the picker state. Pure; returns a new state.
 * Invalid actions (unknown basis/category, min/max/SD, picking a column with
 * no category) return the state unchanged.
 *
 * @param {Object} state
 * @param {Object} change  { category: [basis, category|null] } | { pick: basis } | { statistic }
 */
export const q50PickerChange = (state, change) => {
  if (change.category) {
    const [basis, raw] = change.category;
    const category = raw || null;
    if (!Object.hasOwn(Q50_CATEGORY_FIELD, basis ?? '')) return state;
    if (category !== null && !Object.hasOwn(Q50_TABLE_2_11[basis], category)) return state;
    return {
      ...state,
      categories: { ...state.categories, [basis]: category },
      // Clearing the picked column's category un-picks it.
      pickedBasis: state.pickedBasis === basis && category === null ? null : state.pickedBasis,
    };
  }
  if (change.pick !== undefined) {
    if (!Q50_PICKER_BASES.includes(change.pick) || !q50PickerColumnReady(state, change.pick)) return state;
    return { ...state, pickedBasis: change.pick };
  }
  if (change.statistic !== undefined) {
    if (!Q50_STATISTICS.includes(change.statistic)) return state;
    return { ...state, statistic: change.statistic };
  }
  return state;
};

/**
 * The selection update the picker would apply, or null until a candidate
 * (with its category) AND a statistic are picked.
 */
export const q50PickerUpdate = (state) => {
  if (!state || !Q50_PICKER_BASES.includes(state.pickedBasis)) return null;
  if (!q50PickerColumnReady(state, state.pickedBasis)) return null;
  const category = state.pickedBasis === 'all_dwellings' ? null : state.categories[state.pickedBasis];
  return buildQ50SelectionUpdate({ basis: state.pickedBasis, category, statistic: state.statistic });
};

/**
 * 'select' mode: apply one action and say what the project should receive.
 * The update is null unless the selection the project uses actually changes —
 * a category chosen in a comparison column, or re-picking the selection
 * already in use, changes nothing.
 *
 * @returns {{ state, update: Object|null }}
 */
export const q50PickerApply = (view, change, project) => {
  const state  = q50PickerChange(view, change);
  const update = q50PickerUpdate(state);
  const saved  = savedQ50Selection(project);
  const unchanged = update !== null && saved !== null
    && update.q50SelectionBasis === saved.basis
    && update.q50Statistic === saved.statistic
    && (saved.basis === 'all_dwellings' || update[Q50_CATEGORY_FIELD[saved.basis]] === saved.category);
  return { state, update: unchanged ? null : update };
};

/**
 * Dropdown option label with the value for the chosen statistic, or the mean
 * when no statistic is chosen yet: "Detached — 8.7".
 */
export const q50CategoryOptionLabel = (basis, category, statistic) => {
  const candidate = q50Candidate(basis, category);
  if (!candidate) return null;
  const stat = Q50_STATISTICS.includes(statistic) ? statistic : 'mean';
  return `${Q50_CATEGORY_LABELS[basis]?.[category] ?? category} — ${candidate[stat].toFixed(1)}`;
};

// ---------------------------------------------------------------------------
// Auto-save rules (stopgap until a single design_params save path exists —
// see BACKLOG). Outside legacy_sap, each discrete choice saves at once:
// "Use this candidate", the statistic, the category on the card in use
// (q50PickerApply returns an update only for these), and a method switch.
// Typed numbers save on blur, only when valid and changed. Categories on
// cards not in use are comparison only and never save.
// ---------------------------------------------------------------------------

const round1 = (x) => parseFloat(x.toFixed(1));

/** The q50 the calculation uses (measured shows its stored value, 12 if none). */
export const effectiveQ50 = (project) =>
  project.airPermeabilityMethod === 'measured' ? (project.q50 ?? 12.0) : resolveQ50(project).q50;

/**
 * Fields for switching a non-legacy project to another method, or null when
 * there is nothing to switch. default_table resolves its own value (restoring
 * a stored selection); measured / design target are seeded with the current
 * effective value rounded to 1 dp.
 */
export const methodSwitchUpdate = (project, target) => {
  if (!project || target === project.airPermeabilityMethod) return null;
  if (target === 'default_table') {
    const next = { ...project, airPermeabilityMethod: 'default_table' };
    return { airPermeabilityMethod: 'default_table', q50: resolveQ50(next).q50 };
  }
  if (target === 'measured' || target === 'design_target') {
    return { airPermeabilityMethod: target, q50: round1(effectiveQ50(project)) };
  }
  return null;
};

/**
 * Fields to save when a typed q50 loses focus, or null: nothing is saved
 * when the text is invalid or the value equals the last saved value.
 */
export const q50BlurSave = (text, lastSavedQ50) => {
  const r = validateQ50Input(text);
  if (r.error !== undefined || Object.is(r.value, lastSavedQ50)) return null;
  return { q50: r.value };
};

/**
 * True when a design_params save did not succeed. api.updateDesignParams
 * resolves with the response JSON even on an HTTP error, which the server
 * sends as { error }; a network failure rejects instead.
 */
export const saveFailed = (result) =>
  result == null || typeof result !== 'object' || Object.hasOwn(result, 'error');

/**
 * Save status after the user types or chooses anything: "Saved" is cleared
 * so it never sits beside unsaved or invalid input. 'saving' and 'error'
 * stay — the save is still in flight, or the choice is still unsaved.
 */
export const statusAfterInput = (status) => (status?.state === 'saved' ? null : status);

/**
 * Run saves one at a time, in the order requested, so an earlier save can
 * never land after a later one. onStatus receives only the LATEST save's
 * outcome: each save sends the whole current design params, so a later
 * success covers an earlier failure.
 *
 * The save function is passed with each request and captured then, so a
 * queued save always goes to the project it was made for.
 *
 * save.noteInput() records that the user typed or chose something: a save
 * requested before that input never reports 'saved' (it reports null — the
 * screen no longer matches what it saved). Errors are still reported.
 *
 * @param {Function} onStatus ({ state: 'saving'|'saved'|'error', fields?, message? }) => void
 * @returns {Function} save(fields, saveFn) → Promise that settles when that save is done;
 *                     saveFn is (fields) => Promise<API response>
 */
export const createSerialSaver = (onStatus) => {
  let queue = Promise.resolve();
  let seq = 0;
  let inputAt = 0;   // seq of the latest save requested before the latest input
  const save = (fields, saveFn) => {
    const n = ++seq;
    onStatus({ state: 'saving', fields });
    queue = queue
      .then(() => saveFn(fields))
      .then((result) => {
        if (saveFailed(result)) throw new Error(result?.error ?? 'No response from the server');
        if (n === seq) onStatus(n > inputAt ? { state: 'saved' } : null);
      })
      .catch((err) => {
        if (n === seq) onStatus({ state: 'error', fields, message: err?.message || 'Save failed' });
      });
    return queue;
  };
  save.noteInput = () => { inputAt = seq; };
  return save;
};

// ---------------------------------------------------------------------------
// Opened-project snapshot and change in totals
// ---------------------------------------------------------------------------

/**
 * Snapshot of the air permeability fields as loaded. Stored on the project
 * object as airPermeabilityAtOpen — UI-only: buildDesignParamsPayload is a
 * whitelist and never sends it.
 */
export const airPermeabilitySnapshot = (project) =>
  Object.freeze(Object.fromEntries(AIR_PERMEABILITY_FIELDS.map(f => [f, project[f] ?? null])));

/**
 * Change in building ventilation (and therefore generator / emitter totals)
 * between two sets of air permeability fields, everything else equal.
 * Returns null when there is nothing meaningful to show: not the EN 12831
 * method, no rooms, or a missing set of fields.
 *
 * @param {Object} project        current project (rooms, shielding, temperatures)
 * @param {Object} baselineFields air permeability fields to compare from
 * @param {Object} candidateFields air permeability fields to compare to
 * @returns {{ baselineQ50, candidateQ50, generatorDeltaW, emitterDeltaW }|null}
 */
export const ventilationTotalsChange = (project, baselineFields, candidateFields) => {
  const rooms = project?.rooms ?? [];
  const isEN12831 = (project?.ventilationMethod ?? 'en12831_cibse2026') === 'en12831_cibse2026';
  if (!isEN12831 || rooms.length === 0 || !baselineFields || !candidateFields) return null;

  const baselineProject  = { ...project, ...baselineFields };
  const candidateProject = { ...project, ...candidateFields };
  const base = calculateBuildingVentilationEN12831(rooms, baselineProject);
  const cand = calculateBuildingVentilationEN12831(rooms, candidateProject);
  const out = {
    baselineQ50:     resolveQ50(baselineProject).q50,
    candidateQ50:    resolveQ50(candidateProject).q50,
    generatorDeltaW: cand.buildingVentGeneratorDesign - base.buildingVentGeneratorDesign,
    emitterDeltaW:   cand.buildingVentEmitter         - base.buildingVentEmitter,
  };
  // Never show a wrong number: anything non-finite means no readout.
  return Object.values(out).every(Number.isFinite) ? out : null;
};

/**
 * Format a change in W as signed kW to two decimals: "+0.12 kW", "−0.05 kW",
 * "0.00 kW". Rounds first, so a tiny negative never shows as "−0.00".
 */
export const formatSignedKW = (deltaW) => {
  const kw = Math.round(deltaW / 10) / 100;
  if (kw === 0) return '0.00 kW';
  return `${kw > 0 ? '+' : '−'}${Math.abs(kw).toFixed(2)} kW`;
};

/**
 * Validate a typed q50 (design target). Returns { value } or { error }.
 */
export const validateQ50Input = (text) => {
  const trimmed = String(text ?? '').trim();
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(value) || value < Q50_INPUT_MIN || value > Q50_INPUT_MAX) {
    return { error: `Enter a value between ${Q50_INPUT_MIN} and ${Q50_INPUT_MAX} m³/(h·m²).` };
  }
  return { value };
};
