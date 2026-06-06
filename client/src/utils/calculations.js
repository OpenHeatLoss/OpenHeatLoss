// client/src/utils/calculations.js
//
// Core room and building heat loss calculations.
// Transmission loss applies thermal bridging addition per CIBSE DHDG 2026 Table 2-9.
// Ventilation loss routes to the EN 12831-1 / CIBSE 2026 module by default.
//
// ─── LOAD TYPES — READ THIS BEFORE CALLING ANY FUNCTION ────────────────────
//
// Three distinct heat loss figures are used throughout the codebase:
//
//   EMITTER LOAD   = fabric (design) + ventEmitter
//                    The load the emitters and pipework must meet.
//                    Ventilation term uses ×2 orientation factor on leakage.
//                    Always HIGHER than generator load for naturally ventilated buildings.
//                    Source: calculateRoomTotal() / calculateBuildingTotal()
//
//   GENERATOR LOAD = fabric (design) + ventGeneratorDesign
//                    The load used to select the heat pump rated output.
//                    Ventilation term uses ×1 orientation factor on leakage.
//                    Source: calculateTransmissionLoss() + ventGeneratorDesign from
//                            calculateRoomVentilationEN12831()
//
//   TYPICAL LOAD   = fabric (Te,ref) + ventGeneratorTypical
//                    Used for modulation check and oversizing verification (MCS 5.7.2).
//                    Source: calculateTransmissionLoss(room, referenceTemp) + ventGeneratorTypical
//                            from calculateRoomVentilationEN12831()
//
// See CALCULATIONS.md for the full reference including which function to call for
// each purpose and the critical field naming requirements.
//
// ─── FIELD NAMING WARNING ───────────────────────────────────────────────────
//
// All functions here expect camelCase field names as mapped by App.jsx loadProject().
// Do NOT call these functions on raw DB rows or raw API response objects —
// snake_case fields (u_value, custom_delta_t etc.) will silently return zero
// for transmission loss because el.uValue will be undefined.
//
// Safe callers: any React component receiving project/rooms via App.jsx props.
// Unsafe callers: raw fetch() responses before loadProject() mapping.

import { calculateRoomVentilationEN12831 } from './en12831Calculations';

// ---------------------------------------------------------------------------
// TRANSMISSION (FABRIC) HEAT LOSS
// BS EN 12831-1:2017 section 6.3.1
// CIBSE DHDG 2026 section 2.5.3 — thermal bridging addition per Table 2-9
// ---------------------------------------------------------------------------

/**
 * Calculate fabric/transmission heat loss for a room at a given external temperature.
 *
 * Returns fabric loss only — no ventilation component.
 * Pass different temperatures to get design or typical fabric loss:
 *   Design:  calculateTransmissionLoss(room, project.externalTemp)
 *   Typical: calculateTransmissionLoss(room, project.referenceTemp)
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
 *                    otherwise (Ti − Te)
 *
 * @param {Object} room         - room record from React state (camelCase fields required)
 * @param {number} externalTemp - Te in °C; caller chooses design or reference temperature
 * @returns {number} Fabric heat loss in Watts
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
 * Returns the EMITTER ventilation loss (ventEmitter) — the figure with the
 * ×2 orientation factor applied to the leakage term per CIBSE DHDG 2026 s.2.5.4.4.
 *
 * This is NOT the generator ventilation loss. To get all three ventilation
 * figures (emitter, generator design, generator typical), call
 * calculateRoomVentilationEN12831() directly.
 *
 * Currently always routes to en12831_cibse2026. The legacy simple method
 * (airDensity/specificHeat path) is retained for compatibility but is not
 * used in any current project.
 *
 * @param {Object} room         - room record from React state
 * @param {number} externalTemp - Te,design in °C (used by legacy path only)
 * @param {number} airDensity   - kg/m³ (legacy path only)
 * @param {number} specificHeat - W·h/m³·K (legacy path only)
 * @param {Object} project      - project record from React state
 * @returns {number} Emitter ventilation heat loss in Watts
 */
export const calculateVentilationLoss = (room, externalTemp, airDensity, specificHeat, project = null) => {
  const method = project?.ventilationMethod ?? 'en12831_cibse2026';

  if (method === 'en12831_cibse2026' && project) {
    const result = calculateRoomVentilationEN12831(room, project);
    return result.ventEmitter;
  }

  // Legacy simple method — not used in current projects
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

/**
 * Calculate total room heat loss for EMITTER SIZING.
 *
 * Returns: fabric loss at design temp + emitter ventilation loss (×2 orientation factor)
 *
 * ⚠ THIS IS THE EMITTER LOAD — NOT THE GENERATOR LOAD.
 * Emitter load is always higher than generator load for naturally ventilated buildings
 * because the ×2 orientation factor on ventilation leakage accounts for worst-case
 * wind direction per CIBSE DHDG 2026 section 2.5.4.4.
 *
 * Use this for:
 *   - Radiator/emitter sizing
 *   - Pipe section heat load (room-connected sections)
 *   - System flow rate calculation
 *   - Pipe sizing staleness detection
 *
 * Do NOT use this for heat pump selection — use generator load figures from
 * calculateRoomVentilationEN12831() instead.
 *
 * ⚠ FIELD NAMING: room must have camelCase fields as mapped by App.jsx loadProject().
 * Calling this on raw DB rows (snake_case) will silently return near-zero transmission
 * loss because el.uValue will be undefined.
 *
 * @param {Object} room    - room record from React state (camelCase fields)
 * @param {Object} project - project record from React state
 * @returns {number} Emitter heat loss in Watts
 */
export const calculateRoomTotal = (room, project) =>
  calculateTransmissionLoss(room, project.externalTemp) +
  calculateVentilationLoss(room, project.externalTemp, project.airDensity, project.specificHeat, project);

/**
 * Sum emitter heat loss across all rooms.
 *
 * Returns the building total emitter load in Watts — the "Emitter Heat Load"
 * figure shown in the Summary tab and used for pipe sizing.
 *
 * @param {Array}  rooms   - array of room records from React state
 * @param {Object} project - project record from React state
 * @returns {number} Total emitter heat loss in Watts
 */
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

// ---------------------------------------------------------------------------
// SEGMENT GEOMETRY
// Per-segment volume and ceiling area for flat, mono-pitch and dual-pitch types.
// All dimensions in metres; results in m³ (volume) and m² (ceiling area).
//
// ceiling_type = 'flat'
//   Cross-section: rectangle. height_low = single height. height_high unused.
//   volume       = l × w × h
//   ceiling_area = l × w  (horizontal plane)
//
// ceiling_type = 'mono_pitch'
//   Cross-section: trapezoid (two different wall heights across the width).
//   height_low = low eaves, height_high = high eaves.
//   volume       = ½ × (h_low + h_high) × w × l
//   ceiling_area = √(w² + (h_high − h_low)²) × l  (sloped rafter plane)
//
// ceiling_type = 'dual_pitch'
//   Cross-section: symmetric pentagon (equal eaves, central ridge).
//   height_low = eaves height, height_high = ridge height.
//   volume       = (h_low + ½ × (h_high − h_low)) × w × l
//                = ½ × (h_low + h_high) × w × l  (same formula as mono_pitch)
//   ceiling_area = 2 × √((w/2)² + (h_high − h_low)²) × l  (two rafter planes)
// ---------------------------------------------------------------------------

/**
 * Calculate volume (m³) for a single segment.
 * Accepts both camelCase (React state) and snake_case (raw DB rows).
 * @param {Object} seg — { length, width, ceilingType|ceiling_type, heightLow|height_low, heightHigh|height_high }
 * @returns {number} Volume in m³
 */
export const calculateSegmentVolume = (seg) => {
  const l         = seg.length ?? 0;
  const w         = seg.width  ?? 0;
  const ceilType  = seg.ceilingType  ?? seg.ceiling_type  ?? 'flat';
  const hLow      = seg.heightLow    ?? seg.height_low    ?? 0;
  const hHighRaw  = seg.heightHigh   ?? seg.height_high   ?? null;
  if (!l || !w || !hLow) return 0;
  if (ceilType === 'mono_pitch' || ceilType === 'dual_pitch') {
    const hHi = hHighRaw ?? hLow;
    return 0.5 * (hLow + hHi) * w * l;
  }
  // flat (default)
  return l * w * hLow;
};

/**
 * Calculate ceiling/roof area (m²) for a single segment.
 * For flat ceilings this equals the floor area. For pitched types it is the
 * actual rafter-plane area — the figure the engineer needs for the ceiling element.
 * Accepts both camelCase (React state) and snake_case (raw DB rows).
 * @param {Object} seg — { length, width, ceilingType|ceiling_type, heightLow|height_low, heightHigh|height_high }
 * @returns {number} Ceiling/roof area in m²
 */
export const calculateSegmentCeilingArea = (seg) => {
  const l        = seg.length ?? 0;
  const w        = seg.width  ?? 0;
  const ceilType = seg.ceilingType ?? seg.ceiling_type ?? 'flat';
  const hLow     = seg.heightLow   ?? seg.height_low   ?? 0;
  const hHighRaw = seg.heightHigh  ?? seg.height_high  ?? null;
  if (!l || !w) return 0;
  if (ceilType === 'mono_pitch') {
    const hHi = hHighRaw ?? hLow;
    const rise = hHi - hLow;
    return Math.sqrt(w * w + rise * rise) * l;
  }
  if (ceilType === 'dual_pitch') {
    const hHi = hHighRaw ?? hLow;
    const rise = hHi - hLow;
    const halfW = w / 2;
    return 2 * Math.sqrt(halfW * halfW + rise * rise) * l;
  }
  // flat
  return l * w;
};

/**
 * Sum volume (m³) across all segments for a room.
 * @param {Array} segments
 * @returns {number} Total volume in m³
 */
export const calculateSegmentsVolume = (segments) =>
  (segments || []).reduce((sum, s) => sum + calculateSegmentVolume(s), 0);

/**
 * Sum floor area (m²) across all segments for a room.
 * Always l × w regardless of ceiling type — floor area is not affected by roof pitch.
 * @param {Array} segments
 * @returns {number} Total floor area in m²
 */
export const calculateSegmentsFloorArea = (segments) =>
  (segments || []).reduce((sum, s) => {
    const l = s.length ?? 0;
    const w = s.width  ?? 0;
    return sum + (l > 0 && w > 0 ? l * w : 0);
  }, 0);
