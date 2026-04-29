/**
 * constructionLibrary.js
 *
 * Utility functions for looking up U-values from the RdSAP10 construction library.
 *
 * Source: RdSAP10 Specification, 9th June 2025
 * Tables: 6-10 (walls by region), 12 (stone formula), 13 (brick formula),
 *         16 (roof by insulation thickness), 18 (roof age-band defaults), 20 (exposed floors)
 *
 * Key design decisions:
 * - Formula rows (solid brick / stone, age bands A-E) return null from getUValue()
 *   and must be resolved via the formula functions below, which require wall thickness.
 * - All other rows return a fixed u_value.
 * - Region is derived from project postcode via regionFromPostcode().
 * - Ground floors are excluded — calculated separately via BS EN ISO 13370.
 */

// ---------------------------------------------------------------------------
// Region detection from UK postcode
// ---------------------------------------------------------------------------

/**
 * Derives the RdSAP region from a UK postcode string.
 * Returns one of: 'england' | 'scotland' | 'wales' | 'ni' | 'iom'
 * Defaults to 'england' if unrecognised (not England prioritised — just the residual).
 *
 * @param {string} postcode
 * @returns {string}
 */
export function regionFromPostcode(postcode) {
  if (!postcode || typeof postcode !== 'string') return 'england';

  const area = postcode.trim().toUpperCase().match(/^([A-Z]{1,2})/)?.[1] ?? '';

  // Northern Ireland
  if (area === 'BT') return 'ni';

  // Isle of Man
  if (area === 'IM') return 'iom';

  // Scotland — postcode areas wholly in Scotland
  const scotlandAreas = [
    'AB', 'DD', 'DG', 'EH', 'FK', 'HS', 'IV', 'KA', 'KW', 'KY',
    'ML', 'PA', 'PH', 'ZE',
    'G',  // Glasgow (single-letter)
  ];
  if (scotlandAreas.includes(area)) return 'scotland';

  // TD straddles England/Scotland border — default to scotland
  if (area === 'TD') return 'scotland';

  // Wales — postcode areas wholly in Wales
  const walesAreas = ['CF', 'LD', 'LL', 'NP', 'SA'];
  if (walesAreas.includes(area)) return 'wales';

  // Straddling areas — SY and HR cover both England and Wales
  // We default these to england but the UI should offer an override
  // for border properties.

  return 'england';
}

// ---------------------------------------------------------------------------
// Wall U-value formulas (Table 12 & 13) — age bands A-E only
// ---------------------------------------------------------------------------

/**
 * Solid brick wall U-value from measured wall thickness (Table 13).
 * Applies to age bands A-E only.
 *
 * @param {number} thicknessMm - wall thickness in mm (include plaster both sides)
 * @returns {number} U-value in W/m²K
 */
export function solidBrickUValue(thicknessMm) {
  if (thicknessMm <= 200) return 2.5;
  if (thicknessMm <= 280) return 1.7;
  if (thicknessMm <= 420) return 1.4;
  return 1.1;
}

/**
 * Stone: granite or whinstone U-value from measured wall thickness (Table 12).
 * Applies to age bands A-E only.
 *
 * @param {number} thicknessMm - wall thickness in mm
 * @returns {number} U-value in W/m²K
 */
export function stoneGraniteUValue(thicknessMm) {
  return 45.315 * Math.pow(thicknessMm, -0.513);
}

/**
 * Stone: sandstone or limestone U-value from measured wall thickness (Table 12).
 * Applies to age bands A-E only.
 *
 * @param {number} thicknessMm - wall thickness in mm
 * @returns {number} U-value in W/m²K
 */
export function stoneSandstoneUValue(thicknessMm) {
  return 54.876 * Math.pow(thicknessMm, -0.561);
}

/**
 * Resolves a U-value from a library record, applying the appropriate formula
 * if the record has formula_type set.
 *
 * @param {object} record - a record from the construction library
 * @param {number|null} thicknessMm - measured wall thickness, required for formula rows
 * @returns {number|null} U-value, or null if thickness is required but not provided
 */
export function getUValue(record, thicknessMm = null) {
  if (!record.formula_type) {
    return record.u_value;
  }

  if (thicknessMm == null) return null; // caller must supply thickness

  switch (record.formula_type) {
    case 'brick_thickness':
      return solidBrickUValue(thicknessMm);
    case 'stone_granite':
      return stoneGraniteUValue(thicknessMm);
    case 'stone_sandstone':
      return stoneSandstoneUValue(thicknessMm);
    default:
      console.warn(`Unknown formula_type: ${record.formula_type}`);
      return null;
  }
}

// ---------------------------------------------------------------------------
// Age band helpers
// ---------------------------------------------------------------------------

/**
 * RdSAP10 age bands with their date ranges.
 * Use for UI display and for determining the age band from a known build year.
 */
export const AGE_BANDS = [
  { band: 'A', label: 'pre-1900',   from: 0,    to: 1899 },
  { band: 'B', label: '1900–1929',  from: 1900, to: 1929 },
  { band: 'C', label: '1930–1949',  from: 1930, to: 1949 },
  { band: 'D', label: '1950–1966',  from: 1950, to: 1966 },
  { band: 'E', label: '1967–1975',  from: 1967, to: 1975 },
  { band: 'F', label: '1976–1982',  from: 1976, to: 1982 },
  { band: 'G', label: '1983–1990',  from: 1983, to: 1990 },
  { band: 'H', label: '1991–1995',  from: 1991, to: 1995 },
  { band: 'I', label: '1996–2002',  from: 1996, to: 2002 },
  { band: 'J', label: '2003–2006',  from: 2003, to: 2006 },
  { band: 'K', label: '2007–2011',  from: 2007, to: 2011 },
  { band: 'L', label: '2012–2022',  from: 2012, to: 2022 },
  { band: 'M', label: '2023+',      from: 2023, to: 9999 },
];

/**
 * Returns the age band letter for a given construction year.
 *
 * @param {number} year - four-digit construction year
 * @returns {string|null} age band letter, or null if year is invalid
 */
export function ageBandFromYear(year) {
  const match = AGE_BANDS.find(b => year >= b.from && year <= b.to);
  return match ? match.band : null;
}

// ---------------------------------------------------------------------------
// Wall type display labels
// ---------------------------------------------------------------------------

export const WALL_TYPE_LABELS = {
  solid_brick:      'Solid brick',
  stone_granite:    'Stone: granite or whinstone',
  stone_sandstone:  'Stone: sandstone or limestone',
  cavity_unfilled:  'Cavity wall — unfilled',
  cavity_filled:    'Cavity wall — filled (CWI)',
  timber_frame:     'Timber frame',
  system_build:     'System build',
  cob:              'Cob',
};

export const ROOF_TYPE_LABELS = {
  pitched_joists:   'Pitched roof — insulation at joists (thickness known)',
  pitched_rafters:  'Pitched roof — insulation at rafters (thickness known)',
  pitched_unknown:  'Pitched roof — insulation unknown / as built',
  flat:             'Flat roof — insulation unknown / as built',
  room_in_roof:     'Room in roof — insulation unknown / as built',
};

// ---------------------------------------------------------------------------
// Window and door label maps
// ---------------------------------------------------------------------------

export const GLAZING_TYPE_LABELS = {
  single:           'Single glazed',
  double:           'Double glazed (pre-2002 / unknown date)',
  triple:           'Triple glazed (pre-2002)',
  double_or_triple: 'Double or triple glazed (post-2002)',
  secondary:        'Secondary glazing',
};

export const GLAZING_PERIOD_LABELS = {
  pre_cutoff:  'Before 2002 (E/W) · 2003 (Scot) · 2006 (NI)',
  post_cutoff: '2002+ (E/W) · 2003+ (Scot) · 2006+ (NI)',
  post_2022:   '2022+ (E/W & NI) · 2023+ (Scot) — current standard',
  any:         'Any period',
};

export const FRAME_TYPE_LABELS = {
  pvc_wood: 'PVC or wood frame',
  metal:    'Metal frame',
};

export const GAP_LABELS = {
  6:  '6mm gap',
  12: '12mm gap',
  16: '16mm or more',
};

// ---------------------------------------------------------------------------
// Formula row detection
// ---------------------------------------------------------------------------

/**
 * Returns true if this library record requires a wall thickness input
 * before a U-value can be calculated.
 *
 * @param {object} record
 * @returns {boolean}
 */
export function requiresThickness(record) {
  return !!record.formula_type;
}
