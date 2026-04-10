// client/src/utils/calculations.js
//
// Core room and building heat loss calculations.
// Transmission loss applies thermal bridging addition per CIBSE DHDG 2026 Table 2-9.
// Ventilation loss routes to the EN 12831-1 / CIBSE 2026 module by default.

import { calculateRoomVentilationEN12831 } from './en12831Calculations';

// ---------------------------------------------------------------------------
// TRANSMISSION (FABRIC) HEAT LOSS
// BS EN 12831-1:2017 section 6.3.1
// CIBSE DHDG 2026 section 2.5.3 — thermal bridging addition per Table 2-9
// ---------------------------------------------------------------------------

/**
 * Calculate fabric/transmission heat loss for a room at a given external temperature.
 *
 * For each element:
 *   Q = effectiveArea × (U + ΔU_tb) × tempFactor × ΔT
 *
 * Where:
 *   effectiveArea  = element area minus any sub-elements (windows in walls etc.)
 *   U              = element U-value as entered
 *   ΔU_tb          = room thermal bridging addition (CIBSE DHDG 2026 Table 2-9)
 *   tempFactor     = 1.0 for external elements; <1.0 for elements to unheated spaces
 *   ΔT             = customDeltaT if set (party walls, basement slabs etc.),
 *                    otherwise (Ti - Te)
 *
 * Passing different externalTemp values gives design or typical results:
 *   design:  calculateTransmissionLoss(room, project.externalTemp)
 *   typical: calculateTransmissionLoss(room, project.referenceTemp)
 *
 * @param {Object} room         - room record with elements array
 * @param {number} externalTemp - Te in °C (design or reference temperature)
 * @returns {number} Total transmission loss in Watts
 */
export const calculateTransmissionLoss = (room, externalTemp) => {
  if (!room.elements) return 0;
  const defaultTempDiff = room.internalTemp - externalTemp;

  // Thermal bridging addition (CIBSE DHDG 2026 Table 2-9)
  // Added to every element U-value in this room.
  // Set per-room so mixed-construction properties (e.g. modern extension on older
  // building) can use the appropriate value for each area of the property.
  // Default 0.10 W/m²·K = "All other buildings" — safe conservative fallback.
  const thermalBridging = room.thermalBridgingAddition ?? 0.10;

  return room.elements.reduce((sum, el) => {
    // Effective area: subtract any child elements (windows in walls, doors in walls)
    const subtractions   = room.elements.filter(s => s.subtractFromElementId === el.id);
    const subtractedArea = subtractions.reduce((s, sub) => s + sub.area, 0);
    const effectiveArea  = Math.max(0, el.area - subtractedArea);

    // Effective U-value = entered U-value + thermal bridging addition
    const effectiveUValue = (el.uValue ?? 0) + thermalBridging;

    // ΔT: customDeltaT overrides room default for elements with different
    // boundary conditions (party walls, basement slabs, unheated adjacent spaces)
    const tempDiff = (el.customDeltaT !== null && el.customDeltaT !== undefined)
      ? el.customDeltaT
      : defaultTempDiff;

    return sum + (effectiveArea * effectiveUValue * (el.tempFactor ?? 1.0) * tempDiff);
  }, 0);
};

// ---------------------------------------------------------------------------
// VENTILATION HEAT LOSS — routed by ventilation_method
// ---------------------------------------------------------------------------

/**
 * Calculate ventilation heat loss for a room.
 *
 * Default: EN 12831-1 / CIBSE 2026 reduced method — returns ventEmitter (W).
 * For generator sizing and typical load, call calculateRoomVentilationEN12831()
 * directly to access all three output figures.
 *
 * @param {Object} room         - room record
 * @param {number} externalTemp - Te,design in °C
 * @param {number} airDensity   - kg/m³ (legacy path only)
 * @param {number} specificHeat - W·h/m³·K (legacy path only)
 * @param {Object} project      - project record
 * @returns {number} Ventilation heat loss in Watts
 */
export const calculateVentilationLoss = (room, externalTemp, airDensity, specificHeat, project = null) => {
  const method = project?.ventilationMethod ?? 'en12831_cibse2026';

  if (method === 'en12831_cibse2026' && project) {
    const result = calculateRoomVentilationEN12831(room, project);
    return result.ventEmitter;
  }

  // Legacy simple method
  const tempDiff         = room.internalTemp - externalTemp;
  const infiltrationFlow = room.volume * (room.ventilation?.infiltrationRate ?? 0);
  const totalFlow        = Math.max(
    room.ventilation?.minAirFlow ?? 0,
    infiltrationFlow + (room.ventilation?.mechanicalSupply ?? 0)
  );
  return (airDensity ?? 1.2) * (specificHeat ?? 0.34) * totalFlow * tempDiff;
};

// ---------------------------------------------------------------------------
// ROOM AND BUILDING TOTALS
// ---------------------------------------------------------------------------

export const calculateRoomTotal = (room, project) =>
  calculateTransmissionLoss(room, project.externalTemp) +
  calculateVentilationLoss(room, project.externalTemp, project.airDensity, project.specificHeat, project);

export const calculateBuildingTotal = (rooms, project) => {
  if (!rooms) return 0;
  return rooms.reduce((sum, room) => sum + calculateRoomTotal(room, project), 0);
};

// ---------------------------------------------------------------------------
// DIMENSION HELPERS
// ---------------------------------------------------------------------------

export const calculateRoomVolume    = (l, w, h) => (l > 0 && w > 0 && h > 0) ? l * w * h : 0;
export const calculateRoomFloorArea = (l, w)    => (l > 0 && w > 0) ? l * w : 0;
export const calculateElementArea   = (l, h)    => (l > 0 && h > 0) ? l * h : 0;
