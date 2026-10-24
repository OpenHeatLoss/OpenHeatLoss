// client/src/utils/en12831VentilationData.js
//
// Reference data for BS EN 12831-1:2017 ventilation heat loss calculation,
// as implemented by the CIBSE Domestic Heating Design Guide 2026 (section 2.5.4).
//
// Sources:
//   - CIBSE Domestic Heating Design Guide 2026, Tables 2-11 to 2-14, numbered as
//     corrected by DHDG-2026-1-COR-001 (the corrigendum withdrew the SAP 10.2
//     estimate tables, old 2-11 to 2-15, so old 2-16/2-17/2-18 are now 2-12/2-13/2-14)
//   - DESNZ / Roberts et al. 2025 (underlying source for Table 2-11)
//   - SAP 10.2 specification (underlying source for Table 2-12)
//   - BS EN 12831-1:2017, Annex B (underlying source for Tables 2-13, 2-14)
//   - MCS MGD007 Table B1: Met Office mean monthly and annual external air temperatures

// ---------------------------------------------------------------------------
// BUILDING AIR PERMEABILITY — DEFAULT q50 (CIBSE DHDG 2026 section 2.5.4.1)
// Direct lookup, entered with no conversion and no adjustment (B25).
// ---------------------------------------------------------------------------

/**
 * Table 2-11: Default air permeability at 50 Pa, q50 in m³/(h·m²)
 * Source: CIBSE DHDG 2026-01 as corrected by DHDG-2026-1-COR-001, Table 2-11.
 *
 * Replaces the withdrawn SAP 10.2 component estimate (old Tables 2-11 to 2-15).
 * Each row gives the distribution for that dwelling characteristic:
 * mean, sd, min, q1, median, q3, max.
 */
const r = (mean, sd, min, q1, median, q3, max) => ({ mean, sd, min, q1, median, q3, max });
export const Q50_TABLE_2_11 = {
  all: r(8.6, 3.3, 0.6, 6.5, 8.1, 10.2, 46.2),
  built_form: {
    flat: r(7.3,3.5,0.6,5.0,6.8,9.2,23.7), terrace: r(9.1,3.0,1.6,7.0,8.6,10.6,36.5),
    semi_detached: r(9.2,3.2,1.8,7.1,8.6,10.8,46.2), detached: r(8.7,3.2,1.7,6.7,8.2,10.2,29.6),
    bungalow: r(7.6,3.4,1.6,5.4,7.0,9.3,44.0) },
  age_band: {
    pre1919: r(8.9,3.2,1.8,6.8,8.3,10.5,46.2), '1919_1944': r(8.7,2.8,2.0,6.9,8.3,10.2,27.8),
    '1945_1964': r(8.1,3.6,0.8,5.7,7.7,9.9,36.5), '1965_1980': r(7.9,3.3,0.6,5.9,7.7,9.9,44.0),
    '1981_1990': r(8.6,2.6,4.1,7.0,8.0,9.8,17.8), post1990: r(9.3,3.5,1.6,6.7,8.5,11.1,21.5) },
  wall_construction: {
    cavity_uninsulated: r(8.2,3.9,0.6,5.8,7.8,10.3,36.5), cavity_insulated: r(8.6,3.1,1.3,6.5,8.1,10.2,28.3),
    solid_uninsulated: r(8.9,3.1,2.0,6.9,8.4,10.4,46.2), solid_insulated: r(8.2,3.4,1.8,5.9,7.5,9.6,27.8),
    other: r(7.9,3.4,1.0,5.8,7.7,9.6,44.0) },
};

// Statistics a designer may select. sd, min and max are deliberately not
// offered (B25 decision) — they stay in the table for reference only.
export const Q50_STATISTICS = ['mean', 'median', 'q1', 'q3'];

// Which project field holds the Table 2-11 category for each selection basis.
// 'all_dwellings' has no category.
export const Q50_CATEGORY_FIELD = {
  built_form:        'q50BuiltForm',
  age_band:          'q50AgeBand',
  wall_construction: 'q50WallConstruction',
};

/**
 * UI labels for the Table 2-11 selection
 */
export const Q50_BASIS_OPTIONS = {
  built_form:        { label: 'Built form' },
  age_band:          { label: 'Age band' },
  wall_construction: { label: 'Wall construction' },
  all_dwellings:     { label: 'All dwellings' },
};

export const Q50_CATEGORY_LABELS = {
  built_form: {
    flat: 'Flat', terrace: 'Terrace', semi_detached: 'Semi-detached',
    detached: 'Detached', bungalow: 'Bungalow',
  },
  age_band: {
    pre1919: 'Pre-1919', '1919_1944': '1919–1944', '1945_1964': '1945–1964',
    '1965_1980': '1965–1980', '1981_1990': '1981–1990', post1990: 'Post-1990',
  },
  wall_construction: {
    cavity_uninsulated: 'Cavity, uninsulated', cavity_insulated: 'Cavity, insulated',
    solid_uninsulated: 'Solid, uninsulated', solid_insulated: 'Solid, insulated',
    other: 'Other',
  },
};

export const Q50_STATISTIC_OPTIONS = {
  mean:   { label: 'Mean' },
  median: { label: 'Median' },
  q1:     { label: 'Lower quartile (Q1)' },
  q3:     { label: 'Upper quartile (Q3)' },
};

// Range accepted for a typed q50 (measured / design target), m³/(h·m²).
// Same limits as the existing measured-value input (min 0.5, max 50).
export const Q50_INPUT_MIN = 0.5;
export const Q50_INPUT_MAX = 50;

/**
 * Look up a default q50 from Table 2-11.
 *
 * Unknown basis, category or statistic returns null — never a guessed value.
 * The caller decides what to do with null.
 *
 * @param {Object} params
 * @param {string} params.basis      'built_form' | 'age_band' | 'wall_construction' | 'all_dwellings'
 * @param {string} params.category   row key within the basis (ignored for 'all_dwellings')
 * @param {string} [params.statistic='mean']  'mean' | 'median' | 'q1' | 'q3'
 * @returns {number|null} q50 in m³/(h·m²)
 */
export const lookupDefaultQ50 = ({ basis, category, statistic = 'mean' } = {}) => {
  if (!Q50_STATISTICS.includes(statistic)) return null;
  let row;
  if (basis === 'all_dwellings') {
    row = Q50_TABLE_2_11.all;
  } else if (basis === 'built_form' || basis === 'age_band' || basis === 'wall_construction') {
    // Object.hasOwn so inherited keys ('constructor', 'toString') are not rows.
    const rows = Q50_TABLE_2_11[basis];
    row = Object.hasOwn(rows, category) ? rows[category] : undefined;
  }
  return row ? row[statistic] : null;
};

// ---------------------------------------------------------------------------
// ROOM LEAKAGE RATE CALCULATION (CIBSE DHDG 2026 section 2.5.4.2)
// ---------------------------------------------------------------------------

/**
 * Table 2-12: Background ventilation supply rate additions (m³/h at 50 Pa)
 * Source: SAP 10.2 specification, converted via BS EN 12831-1:2017 equation 30
 *
 * These are added to the base room leakage rate (exposedEnvelope × q50)
 * before applying the 50 Pa to typical conversion factor.
 */
export const BACKGROUND_VENT_ADDITIONS_M3H = {
  vent:        54,   // Fixed or controllable vent / trickle vent (per vent)
  fan:         54,   // Intermittent extract fan, non-sealing (when not operating)
  flue_small:  109,  // Unconnected flue, diameter < 200 mm
  flue_large:  435,  // Unconnected flue, diameter >= 200 mm
  open_fire:   109,  // Blocked-off flue or open fire
};

/**
 * Table 2-13: 50 Pa to typical pressure conversion factor
 * Source: BS EN 12831-1:2017 (via CIBSE DHDG 2026)
 *
 * Multiply the room leakage rate at 50 Pa by this factor to get the
 * approximate room leakage rate at typical pressure conditions (m³/h).
 *
 * Structure: [shielding][heightBand] → factor
 */
export const PA50_TO_TYPICAL_FACTOR = {
  intensive: { '1_2': 0.03, '2_4': 0.05, '4_8': 0.08, '8+': 0.11 },
  normal:    { '1_2': 0.05, '2_4': 0.05, '4_8': 0.08, '8+': 0.11 },
  none:      { '1_2': 0.07, '2_4': 0.07, '4_8': 0.08, '8+': 0.11 },
};

/**
 * Table 2-14: Minimum air changes per hour for minimum room leakage rate check
 * Source: BS EN 12831-1:2017 Table B.7 (via CIBSE DHDG 2026)
 *
 * If the calculated room leakage rate falls below this minimum, ventilation
 * adequacy should be checked — not a hard stop, but a flag to the designer.
 */
export const MIN_ROOM_ACH = {
  living:   0.5,   // Living areas (living rooms, offices, studies, etc.)
  wet:      0.5,   // Kitchens, bathrooms, WCs with windows
  other:    0.0,   // Internal corridors, unheated spaces, etc.
};

/**
 * Map a room type string to a minimum ACH category
 * @param {string} roomType
 * @returns {'living' | 'wet' | 'other'}
 */
export const getRoomMinACHCategory = (roomType) => {
  const wetRooms = ['kitchen', 'bathroom', 'shower_room', 'cloakroom_wc', 'toilet',
                    'utility_room', 'family_breakfast', 'bedroom_ensuite'];
  const otherRooms = ['internal_corridor', 'landing', 'store_room'];

  if (otherRooms.includes(roomType)) return 'other';
  if (wetRooms.includes(roomType)) return 'wet';
  return 'living';
};

// ---------------------------------------------------------------------------
// HEIGHT BAND HELPER
// ---------------------------------------------------------------------------

/**
 * Determine height band string from number of storeys for the Table 2-13 lookup
 * @param {number} storeys
 * @returns {'1_2' | '2_4' | '4_8' | '8+'}
 */
export const getHeightBand = (storeys) => {
  if (storeys <= 2)  return '1_2';
  if (storeys <= 4)  return '2_4';
  if (storeys <= 8)  return '4_8';
  return '8+';
};

// ---------------------------------------------------------------------------
// REGIONAL REFERENCE TEMPERATURES (MGD007 Table B1)
// Met Office mean annual air temperatures 1981-2010, used as Te,ref for
// typical temperature calculations (CIBSE DHDG 2026 section 2.5.2.3 / 5.7.2)
// ---------------------------------------------------------------------------

export const REGIONAL_REFERENCE_TEMPS = {
  default:        { label: 'Default — Mean UK average',    annualMean: 10.0, isDefault: true },
  ne_scotland:    { label: 'NE Scotland (Dyce)',           annualMean: 8.5 },
  nw_scotland:    { label: 'NW Scotland (Stornoway)',      annualMean: 8.6 },
  e_scotland:     { label: 'E Scotland (Leuchars)',        annualMean: 8.8 },
  borders:        { label: 'Borders (Boulmer)',            annualMean: 9.0 },
  w_scotland:     { label: 'W Scotland (Abbotsinch)',      annualMean: 9.1 },
  n_ireland:      { label: 'N Ireland (Aldergrove)',       annualMean: 9.4 },
  north_eastern:  { label: 'North-eastern (Leeming)',      annualMean: 9.4 },
  north_western:  { label: 'North-western (Carlisle)',     annualMean: 9.4 },
  midlands:       { label: 'Midlands (Elmdon)',            annualMean: 9.8 },
  wales:          { label: 'Wales (Aberporth)',            annualMean: 9.9 },
  e_pennines:     { label: 'E Pennines (Finningley)',      annualMean: 10.0 },
  w_pennines:     { label: 'W Pennines (Ringway)',         annualMean: 10.0 },
  east_anglia:    { label: 'East Anglia (Honington)',      annualMean: 10.1 },
  south_eastern:  { label: 'South-eastern (Gatwick)',      annualMean: 10.2 },
  southern:       { label: 'Southern (Hurn)',              annualMean: 10.4 },
  severn_valley:  { label: 'Severn Valley (Filton)',       annualMean: 10.6 },
  south_western:  { label: 'South-western (Plymouth)',     annualMean: 11.0 },
  thames_valley:  { label: 'Thames Valley (Heathrow)',     annualMean: 11.3 },
};

/**
 * Building shielding options for UI dropdowns
 */
export const BUILDING_SHIELDING_OPTIONS = {
  intensive: { label: 'Intensive shielding — city centre or dense forest' },
  normal:    { label: 'Normal shielding — surrounded by a few buildings or trees' },
  none:      { label: 'No shielding — building is in the open' },
};

/**
 * Continuous ventilation type options
 */
export const CONTINUOUS_VENT_TYPES = {
  none: { label: 'None' },
  mev:  { label: 'Continuous mechanical extract (MEV) — not balanced' },
  mvhr: { label: 'Mechanical ventilation with heat recovery (MVHR) — balanced' },
};
