// client/src/utils/en12831VentilationData.js
//
// Reference data for BS EN 12831-1:2017 ventilation heat loss calculation,
// as implemented by the CIBSE Domestic Heating Design Guide 2026 (section 2.5.4).
//
// Sources:
//   - CIBSE Domestic Heating Design Guide 2026, Tables 2-11 to 2-18
//   - SAP 10.2 specification (underlying source for Tables 2-11 to 2-15)
//   - BS EN 12831-1:2017, Annex B (underlying source for Tables 2-17, 2-18)
//   - MCS MGD007 Table B1: Met Office mean monthly and annual external air temperatures

// ---------------------------------------------------------------------------
// BUILDING AIR PERMEABILITY ESTIMATION (CIBSE DHDG 2026 section 2.5.4.1)
// SAP 10.2 component method — produces ACH which is then converted to q50
// ---------------------------------------------------------------------------

/**
 * Table 2-11: Structural infiltration rate addition (ACH)
 * Source: SAP 10.2 specification
 */
export const SAP_STRUCTURAL_INFILTRATION = {
  masonry:      { label: 'Masonry',             ach: 0.35 },
  timber_steel: { label: 'Steel or timber frame', ach: 0.25 },
};

/**
 * Table 2-12: Floor infiltration rate addition (ACH)
 * Source: SAP 10.2 specification
 */
export const SAP_FLOOR_INFILTRATION = {
  unsealed_suspended: { label: 'Unsealed suspended wooden floor', ach: 0.20 },
  sealed_suspended:   { label: 'Sealed suspended wooden floor',   ach: 0.10 },
  other:              { label: 'Other ground floor (solid, etc)', ach: 0.00 },
};

/**
 * Table 2-13: Door and window infiltration rate addition (ACH)
 * Source: SAP 10.2 specification
 *
 * Key: percentage of external windows/doors that are draught-proofed (0/25/50/75/100)
 * Value: { withLobby, withoutLobby } — ACH addition depending on draught lobby presence
 */
export const SAP_WINDOW_DOOR_INFILTRATION = {
  0:   { withLobby: 0.25, withoutLobby: 0.30 },
  25:  { withLobby: 0.20, withoutLobby: 0.25 },
  50:  { withLobby: 0.15, withoutLobby: 0.20 },
  75:  { withLobby: 0.10, withoutLobby: 0.15 },
  100: { withLobby: 0.05, withoutLobby: 0.10 },
};

/**
 * Table 2-14: Additional infiltration rate addition (ACH) by number of storeys
 * Source: SAP 10.2 specification
 */
export const SAP_STOREY_INFILTRATION = {
  1:    0.00,
  2:    0.05,
  3:    0.07,
  4:    0.08,  // 4–6 storeys
};

/**
 * Get storey infiltration addition — handles 4+ storey case
 * @param {number} storeys
 * @returns {number} ACH addition
 */
export const getStoreyInfiltration = (storeys) => {
  if (storeys <= 1) return SAP_STOREY_INFILTRATION[1];
  if (storeys === 2) return SAP_STOREY_INFILTRATION[2];
  if (storeys === 3) return SAP_STOREY_INFILTRATION[3];
  return SAP_STOREY_INFILTRATION[4]; // 4–6
};

/**
 * Table 2-15: SAP ACH to 50 Pa conversion factor
 * Source: BS EN 12831-1:2017 (via CIBSE DHDG 2026)
 *
 * Multiply total ACH from Tables 2-11 to 2-14 by this factor to get
 * q50 in m³/(h·m²).
 *
 * Structure: [shielding][heightBand] → factor
 * heightBand: '1_2' = 5m or less (1-2 storeys)
 *             '2_4' = 5m–10m (2-4 storeys)
 *             '4_8' = 10m–20m (4-8 storeys)
 *             '8+'  = >20m (8+ storeys)
 */
export const SAP_TO_50PA_FACTOR = {
  intensive: { '1_2': 33.3, '2_4': 20.0, '4_8': 12.5, '8+': 9.1 },
  normal:    { '1_2': 20.0, '2_4': 20.0, '4_8': 12.5, '8+': 9.1 },
  none:      { '1_2': 14.3, '2_4': 14.3, '4_8': 12.5, '8+': 9.1 },
};

// ---------------------------------------------------------------------------
// ROOM LEAKAGE RATE CALCULATION (CIBSE DHDG 2026 section 2.5.4.2)
// ---------------------------------------------------------------------------

/**
 * Table 2-16: Background ventilation supply rate additions (m³/h at 50 Pa)
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
 * Table 2-17: 50 Pa to typical pressure conversion factor
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
 * Table 2-18: Minimum air changes per hour for minimum room leakage rate check
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
 * Determine height band string from number of storeys for table lookups
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
