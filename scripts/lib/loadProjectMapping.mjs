// scripts/lib/loadProjectMapping.mjs
//
// Raw DB rows → the camelCase objects the client calculation reads, with the
// SAME expressions (including fallbacks) as App.jsx loadProject(), restricted
// to the fields calculateRoomVentilationEN12831 reads. If loadProject's
// mapping for any of these fields changes, this must change with it.
//
// Same mapping as scripts/b25_baseline.mjs (which keeps its own copy, so the
// B25 tooling is unchanged). Pure: no database access.

// [camelCase field, mapper] — App.jsx loadProject, design params section.
const PROJECT_FIELDS = [
  ['externalTemp',          dp => dp.external_temp           ?? -3],
  ['ventilationMethod',     dp => dp.ventilation_method      || 'en12831_cibse2026'],
  ['airPermeabilityMethod', dp => dp.air_permeability_method],
  ['q50',                   dp => dp.q50],
  ['q50BuiltForm',          dp => dp.q50_built_form          ?? null],
  ['q50AgeBand',            dp => dp.q50_age_band            ?? null],
  ['q50WallConstruction',   dp => dp.q50_wall_construction   ?? null],
  ['q50SelectionBasis',     dp => dp.q50_selection_basis     ?? null],
  ['q50Statistic',          dp => dp.q50_statistic           ?? 'mean'],
  ['buildingStoreys',       dp => dp.building_storeys        ?? 2],
  ['buildingShielding',     dp => dp.building_shielding      || 'normal'],
  ['referenceTemp',         dp => dp.reference_temp          ?? 10.0],
];

// App.jsx loadProject, rooms section.
const ROOM_FIELDS = [
  ['internalTemp',          r => r.internal_temp],
  ['volume',                r => r.volume],
  ['roomType',              r => r.room_type                 || 'living_room'],
  ['exposedEnvelopeM2',     r => r.exposed_envelope_m2       ?? 0],
  ['bgVentCount',           r => r.bg_vent_count             ?? 0],
  ['bgFanCount',            r => r.bg_fan_count              ?? 0],
  ['bgFlueSmallCount',      r => r.bg_flue_small_count       ?? 0],
  ['bgFlueLargeCount',      r => r.bg_flue_large_count       ?? 0],
  ['bgOpenFireCount',       r => r.bg_open_fire_count        ?? 0],
  ['continuousVentType',    r => r.continuous_vent_type      || 'none'],
  ['continuousVentRateM3h', r => r.continuous_vent_rate_m3h  ?? 0],
  ['mvhrEfficiency',        r => r.mvhr_efficiency           ?? 0],
];

const mapFields = (fields, raw) => Object.fromEntries(fields.map(([name, map]) => [name, map(raw)]));

/**
 * Project object as loadProject builds it, for the ventilation calculation.
 * postcode: the project's installation postcode (primary address, else first)
 * or ''. getMCSDataFromPostcode: from client/src/utils/mcsData.js. Mirrors
 * loadProject's auto-apply of externalTemp when it is still the seeded -3.
 */
export const mapProject = (dpRow, postcode, getMCSDataFromPostcode) => {
  const project = mapFields(PROJECT_FIELDS, dpRow ?? {});
  if (postcode && project.externalTemp === -3) {
    const mcs = getMCSDataFromPostcode(postcode);
    if (mcs) project.externalTemp = mcs.lowTemp;
  }
  return project;
};

export const mapRoom = (roomRow) => ({ id: roomRow.id, ...mapFields(ROOM_FIELDS, roomRow) });
