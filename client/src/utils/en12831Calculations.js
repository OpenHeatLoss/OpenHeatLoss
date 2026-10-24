// client/src/utils/en12831Calculations.js
//
// BS EN 12831-1:2017 ventilation heat loss calculation
// Reduced implementation per CIBSE Domestic Heating Design Guide 2026, section 2.5.4
//
// Scope (CIBSE DHDG 2026 section 2.5.4 opening):
//   Applicable to domestic UK properties with no large openings, more than one
//   heated space, all heated spaces linked, no whole-house unbalanced mechanical
//   ventilation, and all combustion appliances room-sealed.
//
// All functions are pure (no side effects) and accept plain objects.
// Field names match the camelCase convention used throughout the React app —
// these are the names assigned in App.jsx loadProject(), not the raw DB column names.
// Calculation audit trail is preserved via the returned breakdown objects.
//
// ─── THREE VENTILATION OUTPUTS ───────────────────────────────────────────────
//
// The main entry point calculateRoomVentilationEN12831() returns three figures:
//
//   ventEmitter         (W) — used for EMITTER and PIPE sizing
//                            Leakage term uses ×2 orientation factor (CIBSE DHDG 2026
//                            s.2.5.4.4) — accounts for worst-case wind direction.
//                            Always higher than ventGeneratorDesign for naturally
//                            ventilated buildings.
//
//   ventGeneratorDesign (W) — used for HEAT PUMP OUTPUT selection
//                            Leakage term uses ×1 (no orientation factor).
//                            Not all rooms are simultaneously windward.
//
//   ventGeneratorTypical(W) — used for MODULATION CHECK (MCS 5.7.2)
//                            Leakage and continuous vent at Te,ref (annual mean).
//
// calculateVentilationLoss() in calculations.js returns ventEmitter only.
// Call calculateRoomVentilationEN12831() directly when all three figures are needed.
//
// See CALCULATIONS.md for the complete reference.

import {
  PA50_TO_TYPICAL_FACTOR,
  BACKGROUND_VENT_ADDITIONS_M3H,
  MIN_ROOM_ACH,
  Q50_TABLE_2_11,
  lookupDefaultQ50,
  getHeightBand,
  getRoomMinACHCategory,
} from './en12831VentilationData';

// ---------------------------------------------------------------------------
// STAGE 1 — BUILDING AIR PERMEABILITY (q50)
// CIBSE DHDG 2026 section 2.5.4.1
// ---------------------------------------------------------------------------

/**
 * Resolve the effective q50 for a project, regardless of method (B25).
 *
 * Reads camelCase fields as set by App.jsx loadProject():
 *   project.airPermeabilityMethod  'default_table' | 'measured' | 'design_target' | 'legacy_sap'
 *   project.q50                    stored value (m³/h·m²) — measured, design target,
 *                                  or the frozen SAP estimate (migration 023)
 *   project.q50SelectionBasis      'built_form' | 'age_band' | 'wall_construction' | 'all_dwellings'
 *   project.q50BuiltForm           Table 2-11 row when basis = 'built_form'
 *   project.q50AgeBand             Table 2-11 row when basis = 'age_band'
 *   project.q50WallConstruction    Table 2-11 row when basis = 'wall_construction'
 *   project.q50Statistic           'mean' | 'median' | 'q1' | 'q3'
 *
 * 'default_table' looks the value up in Table 2-11. With no basis or no
 * category selected it falls back to the all-dwellings mean and sets
 * defaulted: true, so callers can nudge the designer to make a selection.
 *
 * @param {Object} project - project object from React state
 * @returns {{ q50: number, defaulted: boolean }} q50 in m³/(h·m²)
 */
// Methods whose q50 is a stored number, used as-is.
const STORED_Q50_METHODS = ['measured', 'legacy_sap', 'design_target'];

// Which project field holds the Table 2-11 category for each selection basis.
const CATEGORY_FIELD = {
  built_form:        'q50BuiltForm',
  age_band:          'q50AgeBand',
  wall_construction: 'q50WallConstruction',
};

export const resolveQ50 = (project) => {
  const method = project.airPermeabilityMethod;
  if (STORED_Q50_METHODS.includes(method)) {
    return { q50: project.q50, defaulted: false };
  }
  if (method !== 'default_table') {
    // Includes 'estimated' (withdrawn; migrations 023/025 leave none).
    // Do not throw — there is no error boundary yet, so a throw blanks the screen.
    console.error(`resolveQ50: unknown airPermeabilityMethod "${method}" — using stored q50`);
    return { q50: project.q50, defaulted: false };
  }

  const fallback = { q50: Q50_TABLE_2_11.all.mean, defaulted: true };
  const basis = project.q50SelectionBasis ?? null;
  if (basis === null) return fallback;
  // Known basis with no category chosen yet → defaulted. An unknown basis falls
  // through to the lookup, which returns null and is reported below.
  const category = Object.hasOwn(CATEGORY_FIELD, basis) ? (project[CATEGORY_FIELD[basis]] ?? null) : null;
  if (Object.hasOwn(CATEGORY_FIELD, basis) && category === null) return fallback;

  const statistic = project.q50Statistic ?? 'mean';
  const q50 = lookupDefaultQ50({ basis, category, statistic });
  if (q50 === null) {
    console.error(`resolveQ50: no Table 2-11 value for basis "${basis}", category "${category}", ` +
                  `statistic "${statistic}" — using the all-dwellings mean`);
    return fallback;
  }
  return { q50, defaulted: false };
};

// ---------------------------------------------------------------------------
// STAGE 2 & 3 — ROOM LEAKAGE RATE
// CIBSE DHDG 2026 section 2.5.4.2
// ---------------------------------------------------------------------------

/**
 * Calculate approximate room leakage rate at typical pressure conditions.
 *
 * Formula:
 *   baseLeakage50Pa     = exposedEnvelope × q50
 *   backgroundTotal50Pa = sum of Table 2-12 additions
 *   totalAt50Pa         = baseLeakage50Pa + backgroundTotal50Pa
 *   approximateRate     = totalAt50Pa × conversionFactor (Table 2-13)
 *
 * Also calculates and checks minimum room leakage rate (Table 2-14).
 *
 * Reads camelCase fields as set by App.jsx loadProject():
 *   room.exposedEnvelopeM2    room.bgVentCount     room.bgFanCount
 *   room.bgFlueSmallCount     room.bgFlueLargeCount room.bgOpenFireCount
 *   room.roomType             room.volume
 *
 * @param {Object} room      - room object from React state
 * @param {number} q50       - building air permeability at 50 Pa (m³/h·m²)
 * @param {string} shielding - 'intensive' | 'normal' | 'none'
 * @param {number} storeys   - building storeys (for height band lookup)
 * @returns {Object}
 */
export const calculateRoomLeakageRate = (room, q50, shielding, storeys) => {
  const exposedEnvelope = room.exposedEnvelopeM2 ?? 0;

  // Base leakage from exposed envelope × building air permeability
  // CIBSE DHDG 2026 section 2.5.4.2 "Approximate Room Leakage Rate"
  const baseLeakage50Pa = exposedEnvelope * q50;

  // Background ventilation additions (Table 2-12)
  const bgVent      = (room.bgVentCount      ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.vent;
  const bgFan       = (room.bgFanCount       ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.fan;
  const bgFlueSmall = (room.bgFlueSmallCount ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.flue_small;
  const bgFlueLarge = (room.bgFlueLargeCount ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.flue_large;
  const bgOpenFire  = (room.bgOpenFireCount  ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.open_fire;
  const backgroundTotal50Pa = bgVent + bgFan + bgFlueSmall + bgFlueLarge + bgOpenFire;

  const totalAt50Pa = baseLeakage50Pa + backgroundTotal50Pa;

  // 50 Pa to typical pressure conversion (Table 2-13)
  // CIBSE DHDG 2026 section 2.5.4.2 "50 Pa to Typical Conversion Factor"
  const heightBand = getHeightBand(storeys);
  const convFactor = PA50_TO_TYPICAL_FACTOR[shielding]?.[heightBand] ?? 0.05;
  const approximateRoomLeakageRate = totalAt50Pa * convFactor;

  // Minimum room leakage rate check (Table 2-14)
  // CIBSE DHDG 2026 section 2.5.4.2 "Minimum Room Leakage Rate"
  const minACHCategory     = getRoomMinACHCategory(room.roomType ?? 'living_room');
  const minACH             = MIN_ROOM_ACH[minACHCategory] ?? 0.5;
  const volume             = room.volume ?? 0;
  const minimumRoomLeakageRate = minACH * volume;

  // Suppress the minimum leakage rate warning when MVHR is providing controlled
  // fresh air — the EN 12831-1 minimum infiltration check is intended to flag
  // rooms with inadequate uncontrolled ventilation. With active MVHR, adequate
  // ventilation is provided mechanically; the envelope leakage figure alone
  // understates total fresh air delivery and the warning is misleading.
  const hasMVHR = (room.continuousVentType === 'mvhr') && ((room.continuousVentRateM3h ?? 0) > 0);
  const belowMinimum = !hasMVHR && approximateRoomLeakageRate < minimumRoomLeakageRate && minimumRoomLeakageRate > 0;

  return {
    approximateRoomLeakageRate,
    minimumRoomLeakageRate,
    belowMinimum,
    breakdown: {
      exposedEnvelope, q50, baseLeakage50Pa,
      bgVent, bgFan, bgFlueSmall, bgFlueLarge, bgOpenFire, backgroundTotal50Pa,
      totalAt50Pa, heightBand, convFactor, approximateRoomLeakageRate,
      minACHCategory, minACH, volume, minimumRoomLeakageRate, belowMinimum,
    },
  };
};

// ---------------------------------------------------------------------------
// STAGE 4 — TEMPERATURE-WEIGHTED FACTORS
// CIBSE DHDG 2026 section 2.5.4.3
// ---------------------------------------------------------------------------

/**
 * Calculate temperature-weighted leakage and continuous ventilation factors
 * for both design and typical conditions.
 *
 * Reads camelCase fields as set by App.jsx loadProject():
 *   room.continuousVentType     'none' | 'mev' | 'mvhr'
 *   room.continuousVentRateM3h  m³/h supply/extract rate
 *   room.mvhrEfficiency         fraction 0–1
 *
 * @param {Object} room         - room object from React state
 * @param {number} approxRate   - approximate room leakage rate (m³/h) from Stage 3
 * @param {number} internalTemp - Ti in °C
 * @param {number} designTemp   - Te,design in °C
 * @param {number} refTemp      - Te,ref in °C (annual mean from MGD007)
 * @returns {Object}
 */
export const calculateTempWeightedFactors = (room, approxRate, internalTemp, designTemp, refTemp) => {
  const designTempDiff  = internalTemp - designTemp;
  const typicalTempDiff = internalTemp - refTemp;

  // Leakage factors
  // CIBSE DHDG 2026 section 2.5.4.3 "Temperature-Weighted Leakage Factors"
  const leakageFactorDesign  = approxRate * designTempDiff;
  const leakageFactorTypical = approxRate * typicalTempDiff;

  // Continuous ventilation factors
  // CIBSE DHDG 2026 section 2.5.4.3 "Temperature-Weighted Continuous Ventilation Factors"
  const contType   = room.continuousVentType    ?? 'none';
  const supplyRate = room.continuousVentRateM3h ?? 0;
  const mvhrEff    = room.mvhrEfficiency        ?? 0;

  let contVentFactorDesign  = 0;
  let contVentFactorTypical = 0;
  let contVentWarning       = null;
  let effectiveDesignDiff   = 0;
  let effectiveTypicalDiff  = 0;

  if (contType === 'mev') {
    // Unbalanced continuous extract: outside scope of reduced method
    // CIBSE DHDG 2026 section 2.5.4 note
    contVentWarning = 'mev_unbalanced';

  } else if (contType === 'mvhr' && supplyRate > 0) {
    // Balanced MVHR: supply temperature pre-warmed by heat recovery
    // CIBSE DHDG 2026 section 2.5.4.3
    const supplyTempDesign  = designTemp + (mvhrEff * (internalTemp - designTemp));
    const supplyTempTypical = refTemp    + (mvhrEff * (internalTemp - refTemp));
    effectiveDesignDiff     = internalTemp - supplyTempDesign;
    effectiveTypicalDiff    = internalTemp - supplyTempTypical;
    contVentFactorDesign    = supplyRate * effectiveDesignDiff;
    contVentFactorTypical   = supplyRate * effectiveTypicalDiff;
  }
  // 'none' or supplyRate === 0: factors remain 0

  return {
    leakageFactorDesign,
    leakageFactorTypical,
    contVentFactorDesign,
    contVentFactorTypical,
    contVentWarning,
    breakdown: {
      designTempDiff, typicalTempDiff, approxRate,
      leakageFactorDesign, leakageFactorTypical,
      contType, supplyRate, mvhrEff,
      effectiveDesignDiff, effectiveTypicalDiff,
      contVentFactorDesign, contVentFactorTypical,
    },
  };
};

// ---------------------------------------------------------------------------
// STAGE 5 — VENTILATION HEAT LOSS (three outputs)
// CIBSE DHDG 2026 section 2.5.4.4
// ---------------------------------------------------------------------------

/**
 * Calculate the three ventilation heat loss outputs from temperature-weighted factors.
 *
 * Orientation factor of 2 applies to the leakage term for emitter sizing only.
 * Generator sizing omits it — not all rooms are simultaneously windward.
 * This halves the ventilation contribution to generator sizing vs emitter sizing
 * for naturally ventilated buildings, consistent with EN 12831-1 fi-z factor.
 *
 * CIBSE DHDG 2026 section 2.5.4.4:
 *   QV,emitter          = ((leakageDesign × 2) + contVentDesign) × 0.34
 *   QV,generator,design = (leakageDesign + contVentDesign) × 0.34
 *   QV,generator,typical= (leakageTypical + contVentTypical) × 0.34
 *
 * @param {Object} factors - output from calculateTempWeightedFactors
 * @returns {Object} { ventEmitter, ventGeneratorDesign, ventGeneratorTypical, breakdown }
 */
export const calculateVentilationHeatLoss = (factors) => {
  const { leakageFactorDesign, leakageFactorTypical, contVentFactorDesign, contVentFactorTypical } = factors;

  // 0.34 W·h/m³·K — specific properties of air
  // CIBSE DHDG 2026 equation 2.2; BS EN 12831-1:2017 Annex B
  const SPECIFIC_AIR = 0.34;

  const ventEmitter          = ((leakageFactorDesign * 2) + contVentFactorDesign) * SPECIFIC_AIR;
  const ventGeneratorDesign  = (leakageFactorDesign + contVentFactorDesign) * SPECIFIC_AIR;
  const ventGeneratorTypical = (leakageFactorTypical + contVentFactorTypical) * SPECIFIC_AIR;

  return {
    ventEmitter,          // W — emitter/pipework sizing
    ventGeneratorDesign,  // W — generator rated output selection
    ventGeneratorTypical, // W — generator modulation/oversizing check (5.7.2)
    breakdown: {
      leakageFactorDesign, orientedLeakageDesign: leakageFactorDesign * 2,
      contVentFactorDesign, emitterTotal: (leakageFactorDesign * 2) + contVentFactorDesign,
      generatorDesignTotal: leakageFactorDesign + contVentFactorDesign,
      leakageFactorTypical, contVentFactorTypical,
      generatorTypicalTotal: leakageFactorTypical + contVentFactorTypical,
      SPECIFIC_AIR, ventEmitter, ventGeneratorDesign, ventGeneratorTypical,
    },
  };
};

// ---------------------------------------------------------------------------
// MAIN ENTRY POINT — single room, all stages
// ---------------------------------------------------------------------------

/**
 * Run the complete EN 12831-1 / CIBSE 2026 ventilation heat loss calculation
 * for a single room. Returns three figures plus full audit trail.
 *
 * Project fields read: buildingShielding, buildingStoreys, externalTemp, referenceTemp,
 *                      airPermeabilityMethod, q50, q50SelectionBasis, q50BuiltForm,
 *                      q50AgeBand, q50WallConstruction, q50Statistic
 * Room fields read:    internalTemp, exposedEnvelopeM2, bgVentCount, bgFanCount,
 *                      bgFlueSmallCount, bgFlueLargeCount, bgOpenFireCount,
 *                      continuousVentType, continuousVentRateM3h, mvhrEfficiency,
 *                      roomType, volume
 *
 * @param {Object} room    - room object from React state
 * @param {Object} project - project object from React state
 * @returns {Object}
 */
export const calculateRoomVentilationEN12831 = (room, project) => {
  const { q50, defaulted: q50Defaulted } = resolveQ50(project);
  const shielding    = project.buildingShielding ?? 'normal';
  const storeys      = project.buildingStoreys   ?? 2;
  const designTemp   = project.externalTemp      ?? -3;
  const refTemp      = project.referenceTemp     ?? 10.6;
  const internalTemp = room.internalTemp         ?? 21;

  const leakageStage = calculateRoomLeakageRate(room, q50, shielding, storeys);
  const factorsStage = calculateTempWeightedFactors(
    room, leakageStage.approximateRoomLeakageRate, internalTemp, designTemp, refTemp
  );
  const lossStage = calculateVentilationHeatLoss(factorsStage);

  return {
    ventEmitter:             lossStage.ventEmitter,
    ventGeneratorDesign:     lossStage.ventGeneratorDesign,
    ventGeneratorTypical:    lossStage.ventGeneratorTypical,
    belowMinimumVentilation: leakageStage.belowMinimum,
    contVentWarning:         factorsStage.contVentWarning,
    stages: { q50, q50Defaulted, leakage: leakageStage, factors: factorsStage, loss: lossStage },
  };
};

// ---------------------------------------------------------------------------
// BUILDING-LEVEL SUMMARY
// ---------------------------------------------------------------------------

/**
 * Aggregate ventilation heat loss across all rooms.
 *
 * buildingVentEmitter          → sum of per-room ventEmitter (emitter sizing verification)
 * buildingVentGeneratorDesign  → sum of per-room ventGeneratorDesign (generator sizing)
 * buildingVentGeneratorTypical → sum of per-room ventGeneratorTypical (modulation check)
 *
 * @param {Array}  rooms   - array of room objects from React state
 * @param {Object} project - project object from React state
 * @returns {Object}
 */
export const calculateBuildingVentilationEN12831 = (rooms, project) => {
  const roomResults = rooms.map(room => ({
    roomId: room.id, roomName: room.name,
    ...calculateRoomVentilationEN12831(room, project),
  }));

  return {
    buildingVentEmitter:          roomResults.reduce((s, r) => s + r.ventEmitter, 0),
    buildingVentGeneratorDesign:  roomResults.reduce((s, r) => s + r.ventGeneratorDesign, 0),
    buildingVentGeneratorTypical: roomResults.reduce((s, r) => s + r.ventGeneratorTypical, 0),
    roomResults,
    warnings: roomResults
      .filter(r => r.belowMinimumVentilation || r.contVentWarning)
      .map(r => ({
        roomId: r.roomId, roomName: r.roomName,
        belowMinimum: r.belowMinimumVentilation, contVentWarning: r.contVentWarning,
      })),
  };
};
