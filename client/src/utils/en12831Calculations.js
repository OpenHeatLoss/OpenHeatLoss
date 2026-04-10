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

import {
  SAP_STRUCTURAL_INFILTRATION,
  SAP_FLOOR_INFILTRATION,
  SAP_WINDOW_DOOR_INFILTRATION,
  SAP_TO_50PA_FACTOR,
  PA50_TO_TYPICAL_FACTOR,
  BACKGROUND_VENT_ADDITIONS_M3H,
  MIN_ROOM_ACH,
  getStoreyInfiltration,
  getHeightBand,
  getRoomMinACHCategory,
} from './en12831VentilationData';

// ---------------------------------------------------------------------------
// STAGE 1 — BUILDING AIR PERMEABILITY (q50)
// CIBSE DHDG 2026 section 2.5.4.1
// ---------------------------------------------------------------------------

/**
 * Estimate building air permeability at 50 Pa using the SAP 10.2 component method.
 * Use when no measured or designed value is available.
 *
 * Process:
 *   1. Sum four ACH additions (structural + floor + window/door + storeys)
 *   2. Multiply by shielding/height conversion factor (Table 2-15) → q50 in m³/(h·m²)
 *
 * @param {Object} params
 * @param {string}  params.structural        'masonry' | 'timber_steel'
 * @param {string}  params.floor             'unsealed_suspended' | 'sealed_suspended' | 'other'
 * @param {number}  params.windowDraughtPct  0 | 25 | 50 | 75 | 100
 * @param {boolean} params.draughtLobby      true if draught lobby present
 * @param {number}  params.storeys           number of storeys
 * @param {string}  params.shielding         'intensive' | 'normal' | 'none'
 * @returns {Object} { q50, breakdown }
 */
export const estimateQ50SAP = ({
  structural = 'masonry',
  floor = 'other',
  windowDraughtPct = 100,
  draughtLobby = false,
  storeys = 2,
  shielding = 'normal',
}) => {
  // Round draught percentage to nearest valid table key
  const draughtKey = [0, 25, 50, 75, 100].reduce((prev, curr) =>
    Math.abs(curr - windowDraughtPct) < Math.abs(prev - windowDraughtPct) ? curr : prev
  );

  const structuralACH = SAP_STRUCTURAL_INFILTRATION[structural]?.ach ?? 0.35;
  const floorACH      = SAP_FLOOR_INFILTRATION[floor]?.ach ?? 0.00;
  const windowRow     = SAP_WINDOW_DOOR_INFILTRATION[draughtKey] ?? SAP_WINDOW_DOOR_INFILTRATION[100];
  const windowACH     = draughtLobby ? windowRow.withLobby : windowRow.withoutLobby;
  const storeyACH     = getStoreyInfiltration(storeys);

  const totalACH   = structuralACH + floorACH + windowACH + storeyACH;
  const heightBand = getHeightBand(storeys);
  const convFactor = SAP_TO_50PA_FACTOR[shielding]?.[heightBand] ?? 20;
  const q50        = totalACH * convFactor;

  return {
    q50,
    breakdown: { structuralACH, floorACH, windowACH, storeyACH, totalACH, heightBand, convFactor, q50 },
  };
};

/**
 * Resolve the effective q50 for a project, regardless of method.
 *
 * Reads camelCase fields as set by App.jsx loadProject():
 *   project.airPermeabilityMethod  'measured' | 'estimated'
 *   project.q50                    measured value (m³/h·m²)
 *   project.sapStructural          'masonry' | 'timber_steel'
 *   project.sapFloor               'unsealed_suspended' | 'sealed_suspended' | 'other'
 *   project.sapWindowDraughtPct    0 | 25 | 50 | 75 | 100
 *   project.sapDraughtLobby        0 | 1
 *   project.buildingStoreys        number
 *   project.buildingShielding      'intensive' | 'normal' | 'none'
 *
 * @param {Object} project - project object from React state
 * @returns {number} q50 in m³/(h·m²)
 */
export const resolveQ50 = (project) => {
  if (project.airPermeabilityMethod === 'measured') {
    return project.q50 ?? 12.0;
  }
  const { q50 } = estimateQ50SAP({
    structural:       project.sapStructural       ?? 'masonry',
    floor:            project.sapFloor            ?? 'other',
    windowDraughtPct: project.sapWindowDraughtPct ?? 100,
    draughtLobby:     !!project.sapDraughtLobby,
    storeys:          project.buildingStoreys     ?? 2,
    shielding:        project.buildingShielding   ?? 'normal',
  });
  return q50;
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
 *   backgroundTotal50Pa = sum of Table 2-16 additions
 *   totalAt50Pa         = baseLeakage50Pa + backgroundTotal50Pa
 *   approximateRate     = totalAt50Pa × conversionFactor (Table 2-17)
 *
 * Also calculates and checks minimum room leakage rate (Table 2-18).
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

  // Background ventilation additions (Table 2-16)
  const bgVent      = (room.bgVentCount      ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.vent;
  const bgFan       = (room.bgFanCount       ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.fan;
  const bgFlueSmall = (room.bgFlueSmallCount ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.flue_small;
  const bgFlueLarge = (room.bgFlueLargeCount ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.flue_large;
  const bgOpenFire  = (room.bgOpenFireCount  ?? 0) * BACKGROUND_VENT_ADDITIONS_M3H.open_fire;
  const backgroundTotal50Pa = bgVent + bgFan + bgFlueSmall + bgFlueLarge + bgOpenFire;

  const totalAt50Pa = baseLeakage50Pa + backgroundTotal50Pa;

  // 50 Pa to typical pressure conversion (Table 2-17)
  // CIBSE DHDG 2026 section 2.5.4.2 "50 Pa to Typical Conversion Factor"
  const heightBand = getHeightBand(storeys);
  const convFactor = PA50_TO_TYPICAL_FACTOR[shielding]?.[heightBand] ?? 0.05;
  const approximateRoomLeakageRate = totalAt50Pa * convFactor;

  // Minimum room leakage rate check (Table 2-18)
  // CIBSE DHDG 2026 section 2.5.4.2 "Minimum Room Leakage Rate"
  const minACHCategory     = getRoomMinACHCategory(room.roomType ?? 'living_room');
  const minACH             = MIN_ROOM_ACH[minACHCategory] ?? 0.5;
  const volume             = room.volume ?? 0;
  const minimumRoomLeakageRate = minACH * volume;

  const belowMinimum = approximateRoomLeakageRate < minimumRoomLeakageRate && minimumRoomLeakageRate > 0;

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
 *                      airPermeabilityMethod, q50, sapStructural, sapFloor,
 *                      sapWindowDraughtPct, sapDraughtLobby
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
  const q50          = resolveQ50(project);
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
    stages: { q50, leakage: leakageStage, factors: factorsStage, loss: lossStage },
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
