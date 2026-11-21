// client/src/utils/emitterCalculations.js
//
// Emitter sizing calculations — radiator output (EN 442 / CIBSE DHDG 2026
// correction factors), UFH output (EN 1264), room sufficiency, system
// analysis and the per-room emitter data used by the schedule PDF.
//
// Moved out of RadiatorSizing.jsx unchanged (2026-11-20) so the Heat Loss
// Summary's customer design information uses exactly the same figures as the
// Emitter Sizing tab, instead of a second copy that could drift. The three
// former closures — checkRoomSufficiency, analyseEmitterSystem (was
// getSystemAnalysis) and buildEmitterRoomData (was buildPdfRoomData) — now
// take `project` and `systemSettings` ({ flowTemp, returnTemp }) explicitly.

import { calculateRoomTotal } from './calculations';

//-----------------------------------------------------------------------------
// CIBSE Domestic Heating Design Guide 2026 correction factors
//-----------------------------------------------------------------------------
export const CONNECTION_TYPE_FACTORS = {
  'BOE':  0.96,
  'TBSE': 1.00,
  'TBOE': 1.05,
};

export const ENCLOSURE_OPTIONS = [
  { label: 'Fixed on plane surface', value: 1.00 },
  { label: 'Shelf over radiator',    value: 0.95 },
  { label: 'Fixed in open recess',   value: 0.90 },
  { label: 'Encased — well ventilated grille', value: 0.80 },
  { label: 'Encased — poorly ventilated grille', value: 0.70 },
];

export const FINISH_OPTIONS = [
  { label: 'Oil or water based paint', value: 1.00 },
  { label: 'Metallic based paint',     value: 0.85 },
];

// ---------------------------------------------------------------------------
// RADIATOR TYPE OPTIONS
// ---------------------------------------------------------------------------
export const RADIATOR_TYPES = {
  'Panel radiators': [
    'K1 / Type 11 — Single panel, single convector',
    'K2 / Type 22 — Double panel, double convector',
    'K3 / Type 33 — Triple panel, triple convector',
    'P+ / Type 21 — Double panel, single convector',
    'Type 20 — Double panel, no convector',
    'Type 10 — Single panel, no convector',
  ],
  'Column radiators': [
    'Single Column', 'Double Column', 'Triple Column', 'Quadruple Column',
  ],
  'Other': [
    'LST', 'Fan Convector', 'UFH', 'Towel Rail',
  ],
};

export const DEFAULT_RAD_TYPE = 'K2 / Type 22 — Double panel, double convector';

// ---------------------------------------------------------------------------
// UFH CALCULATION CONSTANTS
// ---------------------------------------------------------------------------

// EN 1264-2:2021 Type A screed system — geometry-based calculation
// q = KH × (MWT − T_room)
// 1/KH = (Su/λu) + (s/2πλu)×ln(s/π×d_i) + R_pipe_wall + Rλ,B + 1/α
//
// Where:
//   Su           = screed depth above pipe CENTRE = t_u + d_o/2           [m]
//   λu           = screed thermal conductivity                             [W/mK]
//   s            = pipe spacing                                            [m]
//   d_i          = pipe inner diameter (bore) — used in spacing log term  [m]
//   R_pipe_wall  = ln(d_o/d_i) / (2π×λ_pipe) × s  — pipe wall resistance [m²K/W]
//   λ_pipe       = 0.35 W/mK  (PEX / MLCP plastic, EN ISO 15875)
//   Rλ,B         = floor covering resistance                               [m²K/W]
//   α            = 10.8 W/m²K  (EN 1264-5 — combined convective + radiative)
//
// Reference: BS EN 1264-2:2021 §6 and Annex A; EN 1264-5:2021 §6.3
// Default geometry: 16mm OD / 12mm ID pipe, 45mm screed above pipe top,
// λ = 1.2 W/mK — matches BS EN 1264 reference charts to within ~3%
export const UFH_EN1264_ALPHA    = 10.8;  // W/m²K  — EN 1264-5:2021 §6.3
export const UFH_LAMBDA_PIPE     = 0.35;  // W/mK   — PEX/MLCP (EN ISO 15875)

// Pipe sizes: OD, ID per EN ISO 15875 / manufacturer tables
// 12mm: 3mm wall (MLCP), 16mm: 2mm wall, 20mm: 2mm wall
export const UFH_PIPE_DIAMETERS = [
  { label: '12 mm OD (9 mm bore)',  value: 0.012, id: 0.009 },
  { label: '16 mm OD (12 mm bore)', value: 0.016, id: 0.012 },
  { label: '20 mm OD (16 mm bore)', value: 0.020, id: 0.016 },
];

// Look up inner diameter from outer — falls back to (d_o - 0.004) if not found
export function getPipeIdM(pipeOdM) {
  const match = UFH_PIPE_DIAMETERS.find(p => p.value === pipeOdM);
  return match ? match.id : (pipeOdM - 0.004);
}
export const UFH_SCREED_CONDUCTIVITIES = [
  { label: 'Sand/cement screed — 1.2 W/mK',     value: 1.2 },
  { label: 'Anhydrite / CAF screed — 2.0 W/mK', value: 2.0 },
  { label: 'Lightweight screed — 0.8 W/mK',     value: 0.8 },
  { label: 'Custom',                             value: null },
];

// Empirical K-value curves for non-screed systems
// These are system-type approximations — actual output must be confirmed
// against manufacturer test data for the specific product being installed.
// K-values are NOT traceable to EN 1264-2 and are provided for indicative
// design purposes only.
export const UFH_CURVES_EMPIRICAL = {
  timber: {
    150: { K: 4.2, n: 1.0 },
    200: { K: 3.6, n: 1.0 },
    300: { K: 3.0, n: 1.0 },
  },
  overlay: {
    150: { K: 4.0, n: 1.0 },
    200: { K: 3.4, n: 1.0 },
    300: { K: 2.8, n: 1.0 },
  },
  retrofit: {
    150: { K: 3.5, n: 1.0 },
    200: { K: 3.0, n: 1.0 },
    300: { K: 2.5, n: 1.0 },
  },
};

export const FLOOR_TEMP_LIMITS = {
  occupied:  { limit: 29, label: 'Occupied area' },
  bathroom:  { limit: 33, label: 'Bathroom' },
  perimeter: { limit: 35, label: 'Perimeter zone' },
};

export const FLOOR_COVERINGS = [
  { label: 'Tiles / stone',   value: 'tiles',      rLambda: 0.00 },
  { label: 'Laminate',        value: 'laminate',   rLambda: 0.05 },
  { label: 'Engineered wood', value: 'eng_wood',   rLambda: 0.07 },
  { label: 'Carpet',          value: 'carpet',     rLambda: 0.10 },
  { label: 'Carpet — heavy',  value: 'carpet_hvy', rLambda: 0.15 },
  { label: 'Custom',          value: 'custom',     rLambda: null  },
];

export const FLOOR_CONSTRUCTIONS = [
  { value: 'screed',   label: 'Screed (wet system)' },
  { value: 'timber',   label: 'Timber / suspended floor' },
  { value: 'overlay',  label: 'Overlay / low-profile' },
  { value: 'retrofit', label: 'Retrofit overlay (thin system)' },
];

export const PIPE_SPACINGS = [100, 150, 200, 300];

//----------------------------------------------------------------------------
// Minimum Flow Temp Functions
//----------------------------------------------------------------------------

// Minimum flow temp at which this room's radiators meet `heatLoss`, holding the
// system flow/return ΔT constant (the design ΔT the user has set).
//
// Why ΔT is held constant: the flow temp you'd actually run at is "required MWT
// + ΔT/2". The previous version held the *return* temp fixed and searched on
// flow, which (a) silently changed ΔT, so the answer shifted 1:1 with whatever
// return temp was typed in, and (b) clamped at return + 0.5°C, so every
// comfortably-covered room tied at the clamp and the first room in the list
// was reported as "setting" the flow temp.
//
// All radiators use n = 1.3, so required MWAT has a closed form — no search,
// no clamp:  Q = ΣΔT50_eff × conn × (MWAT/50)^1.3
//        →  MWAT = 50 × (Q / (ΣΔT50_eff × conn))^(1/1.3)
//
// Connection factor is applied here to match checkRoomSufficiency and
// RoomRadiatorSchedule (it was previously computed but unused, making this
// figure ~3% optimistic for BOE vs the per-room display).
export function calcMinRoomFlowTemp(room, radiatorSpecs, flowReturnDelta, heatLoss, connectionType) {
  const retainedItems = (room.radiatorSchedule || []).filter(
    item => item.emitter_status !== 'existing_replace' && item.radiator_spec_id
  );
  if (retainedItems.length === 0) return null;
  if (!(heatLoss > 0)) return null; // nothing for radiators to do (e.g. UFH covers it)

  const connFactor = CONNECTION_TYPE_FACTORS[connectionType] || 0.96;
  const roomTemp = room.internalTemp ?? 21;

  const totalEffDt50 = retainedItems.reduce((sum, item) => {
    const spec = radiatorSpecs?.find(s => s.id === item.radiator_spec_id);
    if (!spec) return sum;
    return sum + effectiveDt50(spec.output_dt50, item.enclosure_factor, item.finish_factor) * (item.quantity || 1);
  }, 0);
  if (totalEffDt50 <= 0) return null;

  const requiredMWAT = 50 * Math.pow(heatLoss / (totalEffDt50 * connFactor), 1 / 1.3);
  return roomTemp + requiredMWAT + (flowReturnDelta / 2);
}

//----------------------------------------------------------------------------
// Radiator output functions
//----------------------------------------------------------------------------

export function effectiveDt50(outputDt50, enclosureFactor, finishFactor) {
  return outputDt50 * (enclosureFactor ?? 1.0) * (finishFactor ?? 1.0);
}

// The core EN442 output calculation — no connection factor here,
// that is applied separately at the effective ΔT50 level
export function calculateOutputAtMWAT(outputDt50, mwat) {
   const n = 1.3;
   if (mwat <= 0) return 0;
   return outputDt50 * Math.pow(mwat / 50, n);
}

// Radiator calculations
export function calculateMWAT(flowTemp, returnTemp, roomTemp) {
  return ((flowTemp + returnTemp) / 2) - roomTemp;
}


// ---------------------------------------------------------------------------
// UFH CALCULATION FUNCTIONS
// ---------------------------------------------------------------------------
// UFH output — screed: EN 1264-2:2021 geometry formula
//              other:  empirical K-value (manufacturer-dependent approximation)
// ---------------------------------------------------------------------------

// Nearest K-value lookup for empirical construction types
export function getEmpiricalCurve(construction, spacingMm) {
  const curves = UFH_CURVES_EMPIRICAL[construction];
  if (!curves) return { K: 3.6, n: 1.0 }; // safe fallback
  if (curves[spacingMm]) return curves[spacingMm];
  const available = Object.keys(curves).map(Number).sort((a, b) => a - b);
  const nearest = available.reduce((prev, curr) =>
    Math.abs(curr - spacingMm) < Math.abs(prev - spacingMm) ? curr : prev
  );
  return curves[nearest];
}

// EN 1264-2:2021 §6 / Annex A — screed (type A) system
// Returns q [W/m²] given MWT, room temp, and full screed geometry.
// pipeIdM = pipe inner diameter (bore) — used in log spacing term per Annex A
export function calcScreedException1264(mwt, roomTemp, spacingM, pipeOdM, pipeIdM, tUm, lambdaScreed, rLambda) {
  const deltaT = mwt - roomTemp;
  if (deltaT <= 0) return 0;
  const Su         = tUm + pipeOdM / 2;                              // depth to pipe centre [m]
  const R_screed   = Su / lambdaScreed;                              // screed conduction
  const R_spacing  = (spacingM / (2 * Math.PI * lambdaScreed))      // pipe spacing correction
                     * Math.log(spacingM / (Math.PI * pipeIdM));     // uses inner diameter per Annex A
  const R_pipewall = (Math.log(pipeOdM / pipeIdM)                   // pipe wall conduction
                     / (2 * Math.PI * UFH_LAMBDA_PIPE))              // λ_pipe = 0.35 W/mK (PEX/MLCP)
                     * spacingM;                                      // scale to m²K/W per unit area
  const R_surface  = 1 / UFH_EN1264_ALPHA;                          // surface film (EN 1264-5)
  const KH         = 1 / (R_screed + R_spacing + R_pipewall + rLambda + R_surface);
  return Math.max(0, KH * deltaT);
}

// Main output dispatcher — selects EN 1264-2 formula for screed, K-curve for others
// screedParams = { spacingM, pipeOdM, pipeIdM, tUm, lambdaScreed } — only used for screed
export function calcUFHOutput(mwt, roomTemp, construction, spacingMm, rLambda, screedParams) {
  if (construction === 'screed' && screedParams) {
    return calcScreedException1264(
      mwt, roomTemp,
      screedParams.spacingM,
      screedParams.pipeOdM,
      screedParams.pipeIdM,
      screedParams.tUm,
      screedParams.lambdaScreed,
      rLambda
    );
  }
  // Empirical K-value path for timber / overlay / retrofit
  const deltaT = mwt - roomTemp;
  if (deltaT <= 0) return 0;
  const { K, n } = getEmpiricalCurve(construction, spacingMm);
  const qBare   = K * Math.pow(deltaT, n);
  const qActual = qBare / (1 + rLambda * K * Math.pow(deltaT, n - 1));
  return Math.max(0, qActual);
}

// Binary search for minimum MWT needed to deliver targetOutputWm2
// screedParams required for screed systems
export function calcMinMWTForOutput(targetOutputWm2, roomTemp, construction, spacingMm, rLambda, screedParams) {
  if (targetOutputWm2 <= 0) return roomTemp;
  let lo = 0, hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const mwt = roomTemp + mid;
    const q   = calcUFHOutput(mwt, roomTemp, construction, spacingMm, rLambda, screedParams);
    if (q < targetOutputWm2) lo = mid; else hi = mid;
  }
  return roomTemp + hi;
}

export function mwtToFlowTemp(mwt, returnTemp) {
  return 2 * mwt - returnTemp;
}

// Floor surface temperature per EN 1264-5:2021 §6.3
// q = α × (T_surface − T_room), α = 10.8 W/m²K
export function calcFloorSurfaceTemp(roomTemp, outputWm2) {
  return roomTemp + outputWm2 / UFH_EN1264_ALPHA;
}

// ---------------------------------------------------------------------------
// Pure UFH output helper — usable outside the component (e.g. getSystemAnalysis)
// ---------------------------------------------------------------------------
export function getRoomUFHOutputPure(room, systemFlowTemp) {
  const ufh = room.ufhSpecs;
  if (!ufh) return 0;
  const hasUFHEmitter = room.emitters?.some(e => e.emitterType === 'UFH');
  if (!hasUFHEmitter) return 0;
  const ufhFlow   = ufh.ufhFlowTemp   ?? systemFlowTemp;
  const ufhReturn = ufh.ufhReturnTemp ?? (ufhFlow - 5);
  const mwt = (ufhFlow + ufhReturn) / 2;
  const screedParams = ufh.floorConstruction === 'screed' ? {
    spacingM:     (ufh.pipeSpacingMm || 150) / 1000,
    pipeOdM:      ufh.pipeOdM              ?? 0.016,
    pipeIdM:      getPipeIdM(ufh.pipeOdM   ?? 0.016),
    tUm:          ufh.screedDepthAbovePipeM ?? 0.045,
    lambdaScreed: ufh.lambdaScreed          ?? 1.2,
  } : null;
  const qWm2 = calcUFHOutput(
    mwt, room.internalTemp,
    ufh.floorConstruction, ufh.pipeSpacingMm, ufh.rLambda, screedParams
  );
  const activeArea = (room.floorArea || 0) * (ufh.activeAreaFactor || 1.0);
  return qWm2 * activeArea;
}

// ---------------------------------------------------------------------------
// Room and system analysis (formerly closures inside RadiatorSizing)
// ---------------------------------------------------------------------------

export function checkRoomSufficiency(room, project, systemSettings) {
  const heatLoss = calculateRoomTotal(room, project);
  const mwat = calculateMWAT(systemSettings.flowTemp, systemSettings.returnTemp, room.internalTemp);

  const radOutput = (room.radiatorSchedule || []).reduce((sum, item) => {
    if (item.emitter_status === 'existing_replace') return sum;
    const spec = project.radiatorSpecs?.find(s => s.id === item.radiator_spec_id);
    if (!spec) return sum;
    const ef = item.enclosure_factor ?? 1.00;
    const ff = item.finish_factor   ?? 1.00;
    const effDt50 = effectiveDt50(spec.output_dt50, ef, ff) * (item.quantity || 1);
    const connFactor = CONNECTION_TYPE_FACTORS[room.designConnectionType || 'BOE'] || 0.96;
    return sum + calculateOutputAtMWAT(effDt50, mwat) * connFactor;
  }, 0);

  const ufhOutput = getRoomUFHOutputPure(room, systemSettings.flowTemp);
  const totalOutput = radOutput + ufhOutput;
  return { sufficient: totalOutput >= heatLoss, totalOutput, radOutput, ufhOutput, heatLoss };
}

// System-level analysis
export function analyseEmitterSystem(project, systemSettings) {
  if (!project.rooms || project.rooms.length === 0) return null;
  let totalHeatLoss = 0, totalOutput = 0;
  let minRadFlowTemp = null, minUFHFlowTemp = null;
  let maxFloorTemp = null, floorTempWarning = false;
  let ufhRoomCount = 0, radRoomCount = 0;
  let drivingRadRoom = null; // room whose radiators require the highest flow temp
  // Room-level shortfalls, split by whether the designer has accepted them
  // (MCS allows a room below its heat loss where more emitter isn't feasible,
  // provided the whole house is still covered).
  const acceptedShortRooms = [];   // [{ name, shortfallW }]
  const unresolvedShortRooms = []; // [{ name, shortfallW }]

  for (const room of project.rooms) {
    const heatLoss = calculateRoomTotal(room, project);
    totalHeatLoss += heatLoss;
    const { totalOutput: ro, sufficient } = checkRoomSufficiency(room, project, systemSettings);
    totalOutput += ro;

    // A flag on a room that is now covered is ignored — it only means
    // something while the room is actually short.
    const isAcceptedShort = !sufficient && !!room.emitterShortfallAccepted;
    if (!sufficient) {
      const entry = { name: room.name || 'Unknown room', shortfallW: heatLoss - ro };
      (isAcceptedShort ? acceptedShortRooms : unresolvedShortRooms).push(entry);
    }

    const hasUFH = room.emitters?.some(e => e.emitterType === 'UFH');
    const hasRad = (room.radiatorSchedule || []).some(
      i => i.emitter_status !== 'existing_replace' && i.radiator_spec_id
    );

    // Accepted-shortfall rooms are excluded from the min flow temp: their
    // emitter can't be enlarged, so letting them set the system temperature
    // would stall the iterative selection workflow permanently.
    if (hasRad && !isAcceptedShort) {
      radRoomCount++;
      const ufhOutputForRoom = getRoomUFHOutputPure(room, systemSettings.flowTemp);
      const residualHeatLoss = Math.max(0, heatLoss - ufhOutputForRoom);
      const roomMinFlow = calcMinRoomFlowTemp(
        room,
        project.radiatorSpecs,
        systemSettings.flowTemp - systemSettings.returnTemp,
        residualHeatLoss,
        room.designConnectionType || 'BOE'
      );
      if (roomMinFlow !== null && (minRadFlowTemp === null || roomMinFlow > minRadFlowTemp)) {
        minRadFlowTemp = roomMinFlow;
        drivingRadRoom = room.name || 'Unknown room';
      }
    }

    if (hasUFH && room.ufhSpecs) {
      ufhRoomCount++;
      const ufh = room.ufhSpecs;
      const ufhFlow   = ufh.ufhFlowTemp   ?? systemSettings.flowTemp;
      const ufhReturn = ufh.ufhReturnTemp ?? (ufhFlow - 5);
      const mwt = (ufhFlow + ufhReturn) / 2;
      const activeArea = (room.floorArea || 0) * (ufh.activeAreaFactor || 1.0);
      const qWm2Target = activeArea > 0 ? Math.max(0, heatLoss / activeArea) : 0;
      const sp = ufh.floorConstruction === 'screed' ? {
        spacingM:     (ufh.pipeSpacingMm || 150) / 1000,
        pipeOdM:      ufh.pipeOdM              ?? 0.016,
        pipeIdM:      getPipeIdM(ufh.pipeOdM   ?? 0.016),
        tUm:          ufh.screedDepthAbovePipeM ?? 0.045,
        lambdaScreed: ufh.lambdaScreed          ?? 1.2,
      } : null;
      const minMWT  = calcMinMWTForOutput(qWm2Target, room.internalTemp, ufh.floorConstruction, ufh.pipeSpacingMm, ufh.rLambda, sp);
      // Use the UFH circuit's own return temp, not the system return temp.
      // mwtToFlowTemp(mwt, ret) = 2*mwt - ret; using system return gives a
      // nonsensically low result when the UFH ΔT differs from the system ΔT.
      const ufhDeltaT = ufhFlow - ufhReturn;
      const minFlow = minMWT + (ufhDeltaT / 2);
      if (minUFHFlowTemp === null || minFlow > minUFHFlowTemp) minUFHFlowTemp = minFlow;
      const currentQ  = calcUFHOutput(mwt, room.internalTemp, ufh.floorConstruction, ufh.pipeSpacingMm, ufh.rLambda, sp);
      const floorTemp = calcFloorSurfaceTemp(room.internalTemp, currentQ);
      const limit = FLOOR_TEMP_LIMITS[ufh.zoneType || 'occupied'].limit;
      if (maxFloorTemp === null || floorTemp > maxFloorTemp) maxFloorTemp = floorTemp;
      if (floorTemp > limit) floorTempWarning = true;
    }
  }

  const isMixed = ufhRoomCount > 0 && radRoomCount > 0;
  const blendingNeeded = isMixed && minRadFlowTemp !== null && minUFHFlowTemp !== null
    && minRadFlowTemp > (minUFHFlowTemp + 3);

  return {
    totalHeatLoss, totalOutput, minRadFlowTemp, minUFHFlowTemp,
    maxFloorTemp, floorTempWarning, isMixed, blendingNeeded,
    ufhRoomCount, radRoomCount, drivingRadRoom,
    acceptedShortRooms, unresolvedShortRooms,
  };
}

// Room data for the schedule PDF, customer pack and customer design
// information — one builder for all of them.
//   outputAtDesign = ONE radiator's output at design conditions
//   totalOutput    = outputAtDesign × quantity
// Both include the room's connection factor, so rows add up to the room
// total used by checkRoomSufficiency.
export function buildEmitterRoomData(project, systemSettings) {
  return (project.rooms || []).map(room => {
    const { heatLoss, totalOutput, sufficient } = checkRoomSufficiency(room, project, systemSettings);
    const mwat = calculateMWAT(systemSettings.flowTemp, systemSettings.returnTemp, room.internalTemp);
    const connFactor = CONNECTION_TYPE_FACTORS[room.designConnectionType || 'BOE'] || 0.96;
    const schedule = (room.radiatorSchedule || []).map(item => {
      const spec = project.radiatorSpecs?.find(s => s.id === item.radiator_spec_id);
      const qty  = item.quantity || 1;
      const unitEffDt50 = spec ? effectiveDt50(spec.output_dt50, item.enclosure_factor, item.finish_factor) : 0;
      const unitOutput  = calculateOutputAtMWAT(unitEffDt50, mwat) * connFactor;
      return {
        isExisting:     item.is_existing    || false,
        emitterStatus:  item.emitter_status || 'new',
        spec:           spec ? `${spec.manufacturer} ${spec.model} - ${spec.type} ${spec.height}x${spec.length}mm` : 'Unknown',
        connectionType: room.designConnectionType || item.connection_type || 'BOE',
        quantity:       qty,
        outputDt50:     spec ? spec.output_dt50 : 0,
        outputAtDesign: unitOutput,
        totalOutput:    unitOutput * qty,
        requiredFlowTemp: null, // kept for the PDF generator; was always null
        notes:          item.notes || '',
      };
    });

    // Append UFH row if the room has a UFH emitter with specs
    const hasUFHEmitter = room.emitters?.some(e => e.emitterType === 'UFH');
    if (hasUFHEmitter && room.ufhSpecs) {
      const ufh = room.ufhSpecs;
      const ufhOutput = getRoomUFHOutputPure(room, systemSettings.flowTemp);
      const ufhFlow   = ufh.ufhFlowTemp   ?? systemSettings.flowTemp;
      const ufhReturn = ufh.ufhReturnTemp ?? (ufhFlow - 5);
      const activeArea = (room.floorArea || 0) * (ufh.activeAreaFactor || 1.0);
      const constructionLabel = ufh.floorConstruction === 'screed' ? 'Screed' : 'Timber';
      const coveringLabel = ufh.floorCovering
        ? ufh.floorCovering.charAt(0).toUpperCase() + ufh.floorCovering.slice(1).replace(/_/g, ' ')
        : 'N/A';
      schedule.push({
        isUFH: true,
        spec: `UFH — ${constructionLabel}, ${ufh.pipeSpacingMm || 150}mm spacing, ${coveringLabel} covering, ${activeArea.toFixed(1)}m² active area, flow ${ufhFlow}°C / return ${ufhReturn}°C`,
        connectionType: 'UFH', quantity: 1, outputDt50: null,
        outputAtDesign: ufhOutput, totalOutput: ufhOutput, notes: '',
      });
    }

    // Accepted shortfall — only reported while the room is actually short
    const shortfallAccepted = !sufficient && !!room.emitterShortfallAccepted;
    return {
      name: room.name, internalTemp: room.internalTemp,
      floorArea: room.floorArea || 0, heatLoss, totalOutput, mwat, schedule,
      sufficient,
      shortfallW:        sufficient ? 0 : heatLoss - totalOutput,
      shortfallAccepted,
      shortfallReason:   shortfallAccepted ? (room.emitterShortfallReason || '') : '',
    };
  });
}
