// client/src/utils/q50Selection.js
//
// Pure logic for the B25 air permeability UI (VentilationSettings.jsx):
// building a Table 2-11 selection, the legacy_sap → default_table comparison,
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
// legacy_sap → default_table comparison
// ---------------------------------------------------------------------------

// The three candidates offered, in display order.
export const LEGACY_CANDIDATE_BASES = ['built_form', 'age_band', 'wall_construction'];

/**
 * Starting state of the comparison: nothing preselected — no category in any
 * column, no candidate picked, no statistic. The engineer must make every
 * choice deliberately.
 */
export const initialLegacyComparison = () => ({
  categories: { built_form: null, age_band: null, wall_construction: null },
  pickedBasis: null,
  statistic: null,
});

/**
 * The selection update the comparison would save, or null until the engineer
 * has picked a candidate (with its category chosen) AND a statistic.
 */
export const legacyComparisonUpdate = (state) => {
  if (!state?.pickedBasis || !LEGACY_CANDIDATE_BASES.includes(state.pickedBasis)) return null;
  if (!state.statistic || !Q50_STATISTICS.includes(state.statistic)) return null;
  const category = state.categories?.[state.pickedBasis] ?? null;
  if (category === null) return null;
  return buildQ50SelectionUpdate({ basis: state.pickedBasis, category, statistic: state.statistic });
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
