// client/src/components/calculations/RadiatorSizing.jsx
import { useState } from 'react';
import { calculateRoomTotal } from '../../utils/calculations';
import { RADIATOR_CONNECTION_TYPES, CONNECTION_TYPE_CORRECTIONS } from '../../utils/constants';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon, XIcon } from '../common/Icons';

//-----------------------------------------------------------------------------
// CIBSE Domestic Heating Design Guide 2026 correction factors
//-----------------------------------------------------------------------------
const CONNECTION_TYPE_FACTORS = {
  'BOE':  0.96,
  'TBSE': 1.00,
  'TBOE': 1.05,
};

const ENCLOSURE_OPTIONS = [
  { label: 'Fixed on plane surface', value: 1.00 },
  { label: 'Shelf over radiator',    value: 0.95 },
  { label: 'Fixed in open recess',   value: 0.90 },
  { label: 'Encased — well ventilated grille', value: 0.80 },
  { label: 'Encased — poorly ventilated grille', value: 0.70 },
];

const FINISH_OPTIONS = [
  { label: 'Oil or water based paint', value: 1.00 },
  { label: 'Metallic based paint',     value: 0.85 },
];

// ---------------------------------------------------------------------------
// RADIATOR TYPE OPTIONS
// ---------------------------------------------------------------------------
const RADIATOR_TYPES = {
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

const DEFAULT_RAD_TYPE = 'K2 / Type 22 — Double panel, double convector';

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
const UFH_EN1264_ALPHA    = 10.8;  // W/m²K  — EN 1264-5:2021 §6.3
const UFH_LAMBDA_PIPE     = 0.35;  // W/mK   — PEX/MLCP (EN ISO 15875)

// Pipe sizes: OD, ID per EN ISO 15875 / manufacturer tables
// 12mm: 3mm wall (MLCP), 16mm: 2mm wall, 20mm: 2mm wall
const UFH_PIPE_DIAMETERS = [
  { label: '12 mm OD (9 mm bore)',  value: 0.012, id: 0.009 },
  { label: '16 mm OD (12 mm bore)', value: 0.016, id: 0.012 },
  { label: '20 mm OD (16 mm bore)', value: 0.020, id: 0.016 },
];

// Look up inner diameter from outer — falls back to (d_o - 0.004) if not found
function getPipeIdM(pipeOdM) {
  const match = UFH_PIPE_DIAMETERS.find(p => p.value === pipeOdM);
  return match ? match.id : (pipeOdM - 0.004);
}
const UFH_SCREED_CONDUCTIVITIES = [
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
const UFH_CURVES_EMPIRICAL = {
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

const FLOOR_TEMP_LIMITS = {
  occupied:  { limit: 29, label: 'Occupied area' },
  bathroom:  { limit: 33, label: 'Bathroom' },
  perimeter: { limit: 35, label: 'Perimeter zone' },
};

const FLOOR_COVERINGS = [
  { label: 'Tiles / stone',   value: 'tiles',      rLambda: 0.00 },
  { label: 'Laminate',        value: 'laminate',   rLambda: 0.05 },
  { label: 'Engineered wood', value: 'eng_wood',   rLambda: 0.07 },
  { label: 'Carpet',          value: 'carpet',     rLambda: 0.10 },
  { label: 'Carpet — heavy',  value: 'carpet_hvy', rLambda: 0.15 },
  { label: 'Custom',          value: 'custom',     rLambda: null  },
];

const FLOOR_CONSTRUCTIONS = [
  { value: 'screed',   label: 'Screed (wet system)' },
  { value: 'timber',   label: 'Timber / suspended floor' },
  { value: 'overlay',  label: 'Overlay / low-profile' },
  { value: 'retrofit', label: 'Retrofit overlay (thin system)' },
];

const PIPE_SPACINGS = [100, 150, 200, 300];

//----------------------------------------------------------------------------
// Minimum Flow Temp Functions
//----------------------------------------------------------------------------

function calcMinRoomFlowTemp(room, radiatorSpecs, returnTemp, heatLoss, connectionType) {
  const retainedItems = (room.radiatorSchedule || []).filter(
    item => item.emitter_status !== 'existing_replace' && item.radiator_spec_id
  );
  if (retainedItems.length === 0) return null;

  const connFactor = CONNECTION_TYPE_FACTORS[connectionType] || 1.00;
  const roomTemp = room.internalTemp || 21;

  let lo = returnTemp + 0.5;
  let hi = 85;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const mwat = ((mid + returnTemp) / 2) - roomTemp;
    if (mwat <= 0) { lo = mid; continue; }

    const combinedOutput = retainedItems.reduce((sum, item) => {
      const spec = radiatorSpecs?.find(s => s.id === item.radiator_spec_id);
      if (!spec) return sum;
      const ef = item.enclosure_factor ?? 1.00;
      const ff = item.finish_factor   ?? 1.00;
      const effDt50 = spec.output_dt50 * ef * ff * (item.quantity || 1);
      return sum + (effDt50 * Math.pow(mwat / 50, 1.3));
    }, 0);

    // Target: combined output must meet heat loss
    // Connection factor already baked into required ΔT50 at design time
    // Here we just need combined output >= heat loss
    if (combinedOutput < heatLoss) lo = mid; else hi = mid;
  }

  return hi;
}

//----------------------------------------------------------------------------
// Radiator output functions
//----------------------------------------------------------------------------

function effectiveDt50(outputDt50, enclosureFactor, finishFactor) {
  return outputDt50 * (enclosureFactor ?? 1.0) * (finishFactor ?? 1.0);
}

// The core EN442 output calculation — no connection factor here,
// that is applied separately at the effective ΔT50 level
function calculateOutputAtMWAT(outputDt50, mwat) {
   const n = 1.3;
   if (mwat <= 0) return 0;
   return outputDt50 * Math.pow(mwat / 50, n);
}

// Radiator calculations
function calculateMWAT(flowTemp, returnTemp, roomTemp) {
  return ((flowTemp + returnTemp) / 2) - roomTemp;
}


// ---------------------------------------------------------------------------
// UFH CALCULATION FUNCTIONS
// ---------------------------------------------------------------------------
// UFH output — screed: EN 1264-2:2021 geometry formula
//              other:  empirical K-value (manufacturer-dependent approximation)
// ---------------------------------------------------------------------------

// Nearest K-value lookup for empirical construction types
function getEmpiricalCurve(construction, spacingMm) {
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
function calcScreedException1264(mwt, roomTemp, spacingM, pipeOdM, pipeIdM, tUm, lambdaScreed, rLambda) {
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
function calcUFHOutput(mwt, roomTemp, construction, spacingMm, rLambda, screedParams) {
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
function calcMinMWTForOutput(targetOutputWm2, roomTemp, construction, spacingMm, rLambda, screedParams) {
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

function mwtToFlowTemp(mwt, returnTemp) {
  return 2 * mwt - returnTemp;
}

// Floor surface temperature per EN 1264-5:2021 §6.3
// q = α × (T_surface − T_room), α = 10.8 W/m²K
function calcFloorSurfaceTemp(roomTemp, outputWm2) {
  return roomTemp + outputWm2 / UFH_EN1264_ALPHA;
}

// ---------------------------------------------------------------------------
// Pure UFH output helper — usable outside the component (e.g. getSystemAnalysis)
// ---------------------------------------------------------------------------
function getRoomUFHOutputPure(room, systemFlowTemp) {
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
// MAIN COMPONENT
// ---------------------------------------------------------------------------
export default function RadiatorSizing({
  project,
  onUpdateProject,
  onAddRadiatorSpec,
  onUpdateRadiatorSchedule,
  onUpdateUFHSpecs,
  onAddUFHEmitter,
}) {
  const [expandedRooms, setExpandedRooms] = useState(new Set());
  const [showAddRadiator, setShowAddRadiator] = useState(false);
  const [newRadiator, setNewRadiator] = useState({
    manufacturer: '', model: '', type: DEFAULT_RAD_TYPE,
    height: 600, length: 1000, outputDt50: 0,
    waterVolume: 0, notes: '', source: 'library', scope: 'company',
  });
  const [exporting, setExporting] = useState(false);

  const systemSettings = {
    flowTemp:   project.designFlowTemp   || 50,
    returnTemp: project.designReturnTemp || 40,
  };
  const flowReturnDelta = systemSettings.flowTemp - systemSettings.returnTemp;

  const toggleRoom = (roomId) => {
    const next = new Set(expandedRooms);
    next.has(roomId) ? next.delete(roomId) : next.add(roomId);
    setExpandedRooms(next);
  };
  const collapseAll = () => setExpandedRooms(new Set());
  const expandAll   = () => {
    if (project.rooms) setExpandedRooms(new Set(project.rooms.map(r => r.id)));
  };

  const calculateRequiredFlowTemp = (outputDt50, requiredOutput, roomTemp, connectionType = 'BOE') => {
    const n = 1.3;
    const cf = CONNECTION_TYPE_CORRECTIONS[connectionType] || 1.0;
    const reqMWAT = 50 * Math.pow(requiredOutput / (outputDt50 * cf), 1 / n);
    return reqMWAT + (flowReturnDelta / 2) + roomTemp;
  };

  const getRoomUFHOutput = (room) =>
    getRoomUFHOutputPure(room, systemSettings.flowTemp);

  const checkRoomSufficiency = (room) => {
  const heatLoss = calculateRoomTotal(room, project);
  const mwat = calculateMWAT(systemSettings.flowTemp, systemSettings.returnTemp, room.internalTemp);

  const radOutput = (room.radiatorSchedule || []).reduce((sum, item) => {
    if (item.emitter_status === 'existing_replace') return sum;
    const spec = project.radiatorSpecs?.find(s => s.id === item.radiator_spec_id);
    if (!spec) return sum;
    const ef = item.enclosure_factor ?? 1.00;
    const ff = item.finish_factor   ?? 1.00;
    const effDt50 = effectiveDt50(spec.output_dt50, ef, ff) * (item.quantity || 1);
    return sum + calculateOutputAtMWAT(effDt50, mwat);
  }, 0);

  const ufhOutput = getRoomUFHOutput(room);
  const totalOutput = radOutput + ufhOutput;
  return { sufficient: totalOutput >= heatLoss, totalOutput, radOutput, ufhOutput, heatLoss };
};

  // System-level analysis
  const getSystemAnalysis = () => {
    if (!project.rooms || project.rooms.length === 0) return null;
    let totalHeatLoss = 0, totalOutput = 0;
    let minRadFlowTemp = null, minUFHFlowTemp = null;
    let maxFloorTemp = null, floorTempWarning = false;
    let ufhRoomCount = 0, radRoomCount = 0;
    let drivingRadRoom = null; // room whose radiators require the highest flow temp

    for (const room of project.rooms) {
      const heatLoss = calculateRoomTotal(room, project);
      totalHeatLoss += heatLoss;
      const { totalOutput: ro } = checkRoomSufficiency(room);
      totalOutput += ro;

      const hasUFH = room.emitters?.some(e => e.emitterType === 'UFH');
      const hasRad = (room.radiatorSchedule || []).some(
        i => i.emitter_status !== 'existing_replace' && i.radiator_spec_id
      );

      if (hasRad) {
        radRoomCount++;
        const ufhOutputForRoom = getRoomUFHOutputPure(room, systemSettings.flowTemp);
        const residualHeatLoss = Math.max(0, heatLoss - ufhOutputForRoom);
        const roomMinFlow = calcMinRoomFlowTemp(
          room,
          project.radiatorSpecs,
          systemSettings.returnTemp,
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
        const minFlow = mwtToFlowTemp(minMWT, systemSettings.returnTemp);
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
    };
  };

  const systemAnalysis = getSystemAnalysis();

  const handleAddRadiator = async () => {
    await onAddRadiatorSpec(newRadiator);
    setShowAddRadiator(false);
    setNewRadiator({
      manufacturer: '', model: '', type: DEFAULT_RAD_TYPE,
      height: 600, length: 1000, outputDt50: 0,
      waterVolume: 0, notes: '', source: 'library', scope: 'company',
    });
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const roomData = (project.rooms || []).map(room => {
        const { heatLoss, totalOutput } = checkRoomSufficiency(room);
        const mwat = calculateMWAT(systemSettings.flowTemp, systemSettings.returnTemp, room.internalTemp);
        const schedule = (room.radiatorSchedule || []).map(item => {
          const spec = project.radiatorSpecs?.find(s => s.id === item.radiator_spec_id);
          const ef = item.enclosure_factor ?? 1.00;
          const ff = item.finish_factor   ?? 1.00;
          const effDt50 = spec ? effectiveDt50(spec.output_dt50, ef, ff) * (item.quantity || 1) : 0;
          const output = calculateOutputAtMWAT(effDt50, mwat);
          const reqFlow = null;
          return {
            isExisting: item.is_existing || false,
            emitterStatus: item.emitter_status || 'new',
            spec: spec ? `${spec.manufacturer} ${spec.model} - ${spec.type} ${spec.height}x${spec.length}mm` : 'Unknown',
            connectionType: item.connection_type || 'BOE',
            quantity: item.quantity || 1,
            outputDt50: spec ? spec.output_dt50 : 0,
            outputAtDesign: output,
            totalOutput: output * (item.quantity || 1),
            requiredFlowTemp: reqFlow,
            notes: item.notes || '',
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
            connectionType: 'UFH',
            quantity: 1,
            outputDt50: null,
            outputAtDesign: ufhOutput,
            totalOutput: ufhOutput,
            notes: '',
          });
        }
        return { name: room.name, internalTemp: room.internalTemp, floorArea: room.floorArea || 0, heatLoss, totalOutput, mwat, schedule };
      });
      const pdfData = {
        projectName: project.name || 'Untitled Project',
        designer: project.designer || '',
        customerTitle: project.customerTitle || '',
        customerFirstName: project.customerFirstName || '',
        customerSurname: project.customerSurname || '',
        customerAddress: project.customerAddressLine1 || '',
        customerPostcode: project.customerPostcode || '',
        flowTemp: systemSettings.flowTemp,
        returnTemp: systemSettings.returnTemp,
        externalTemp: project.externalTemp || -3,
        totalHeatLoss: roomData.reduce((s, r) => s + r.heatLoss, 0) / 1000,
        numberOfRooms: roomData.length,
        rooms: roomData,
      };
      const response = await fetch('/api/generate-pdf/radiator-schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pdfData),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Radiator_Schedule_${project.name || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
      } else { alert('Failed to generate PDF.'); }
    } catch (error) { console.error(error); alert('Error generating PDF.'); }
    setExporting(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Radiator & Emitter Sizing</h2>
        <button onClick={handleExportPDF} disabled={exporting || !project.rooms?.length}
          className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 font-semibold transition flex items-center gap-2">
          {exporting ? '⏳ Generating...' : '📄 Export Schedule PDF'}
        </button>
      </div>

      {/* System Design Conditions */}
      <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-lg mb-3">System Design Conditions</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Flow Temperature (°C)</label>
            <input type="number" step="0.1" value={systemSettings.flowTemp}
              onChange={e => onUpdateProject('designFlowTemp', parseFloat(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Return Temperature (°C)</label>
            <input type="number" step="0.1" value={systemSettings.returnTemp}
              onChange={e => onUpdateProject('designReturnTemp', parseFloat(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Flow/Return ΔT (K)</label>
            <input type="number" value={flowReturnDelta.toFixed(1)} disabled
              className="w-full border border-gray-300 rounded px-3 py-2 bg-gray-100" />
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Flow and return temperatures drive emitter output calculations throughout this tab.
          Set them to your design system temperatures — typically 45/40°C for heat pump systems.
        </div>
      </div>

      {/* System Summary */}
      {systemAnalysis && (
        <SystemSummaryPanel analysis={systemAnalysis} systemSettings={systemSettings} />
      )}

      {/* Controls Row */}
      <div className="flex justify-between items-center mb-4 mt-6">
        <h3 className="font-bold text-lg">Room by Room</h3>
        <div className="flex gap-2">
          {project.rooms?.length > 0 && (
            <>
              <button onClick={expandAll} className="text-blue-600 hover:text-blue-700 px-3 py-2 rounded border border-blue-300 hover:bg-blue-50 text-sm transition">Expand All</button>
              <button onClick={collapseAll} className="text-gray-600 hover:text-gray-700 px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 text-sm transition">Collapse All</button>
            </>
          )}
          {!showAddRadiator && (
            <button onClick={() => setShowAddRadiator(true)}
              className="text-green-600 hover:text-green-700 px-3 py-2 rounded border border-green-300 hover:bg-green-50 text-sm flex items-center gap-1 transition">
              <PlusIcon className="w-4 h-4" />Add Radiator to Database
            </button>
          )}
        </div>
      </div>

      {/* Add Radiator Form */}
      {showAddRadiator && (
        <div className="bg-green-50 p-4 rounded border border-green-300 mb-4">
          <h4 className="font-semibold mb-3">Add New Radiator to Database</h4>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Manufacturer', field: 'manufacturer', type: 'text', ph: 'e.g. Stelrad' },
              { label: 'Model / Series', field: 'model', type: 'text', ph: 'e.g. Compact' },
              { label: 'Height (mm)', field: 'height', type: 'number', ph: '600' },
              { label: 'Length (mm)', field: 'length', type: 'number', ph: '1000' },
              { label: 'Output @ ΔT50 (W)', field: 'outputDt50', type: 'number', ph: '1245' },
              { label: 'Water content (L/m)', field: 'waterVolume', type: 'number', ph: '1.7' },
              { label: 'Notes (optional)', field: 'notes', type: 'text', ph: 'e.g. low H2O' },
            ].map(({ label, field, type, ph }) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                <input type={type} step={type === 'number' ? '0.01' : undefined} placeholder={ph}
                  value={newRadiator[field]}
                  onChange={e => setNewRadiator({ ...newRadiator, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
              <select value={newRadiator.type} onChange={e => setNewRadiator({ ...newRadiator, type: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                {Object.entries(RADIATOR_TYPES).map(([group, types]) => (
                  <optgroup key={group} label={group}>{types.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>
                ))}
              </select>
            </div>
            <div className="col-span-4">
              <label className="block text-xs font-semibold text-gray-600 mb-2">Source</label>
              <div className="flex gap-6">
                {[{ value: 'library', label: 'Manufacturer spec', hint: '— from datasheet', accent: 'accent-blue-600' },
                  { value: 'site', label: 'Site-found existing', hint: '— found on survey', accent: 'accent-amber-600' }].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="radio" value={opt.value} checked={newRadiator.source === opt.value}
                      onChange={() => setNewRadiator({ ...newRadiator, source: opt.value })} className={opt.accent} />
                    <span>{opt.label}</span><span className="text-xs text-gray-400">{opt.hint}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleAddRadiator} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Add to Database</button>
            <button onClick={() => setShowAddRadiator(false)} className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400">Cancel</button>
          </div>
        </div>
      )}

      {/* Room Accordion */}
      <div className="space-y-3">
        {project.rooms && project.rooms.map(room => {
          const isExpanded = expandedRooms.has(room.id);
          const { sufficient, totalOutput, heatLoss } = checkRoomSufficiency(room);
          const mwat = calculateMWAT(systemSettings.flowTemp, systemSettings.returnTemp, room.internalTemp);
          const hasUFH = room.emitters?.some(e => e.emitterType === 'UFH');
          const hasRad = (room.radiatorSchedule || []).length > 0;

          let floorTempDisplay = null;
          if (hasUFH && room.ufhSpecs) {
            const ufh = room.ufhSpecs;
            const ufhFlow   = ufh.ufhFlowTemp   ?? systemSettings.flowTemp;
            const ufhReturn = ufh.ufhReturnTemp ?? (ufhFlow - 5);
            const mwt = (ufhFlow + ufhReturn) / 2;
            const sp = ufh.floorConstruction === 'screed' ? {
              spacingM:     (ufh.pipeSpacingMm || 150) / 1000,
              pipeOdM:      ufh.pipeOdM              ?? 0.016,
              pipeIdM:      getPipeIdM(ufh.pipeOdM   ?? 0.016),
              tUm:          ufh.screedDepthAbovePipeM ?? 0.045,
              lambdaScreed: ufh.lambdaScreed          ?? 1.2,
            } : null;
            const qWm2 = calcUFHOutput(mwt, room.internalTemp, ufh.floorConstruction, ufh.pipeSpacingMm, ufh.rLambda, sp);
            const ft = calcFloorSurfaceTemp(room.internalTemp, qWm2);
            const limit = FLOOR_TEMP_LIMITS[ufh.zoneType || 'occupied'].limit;
            floorTempDisplay = { temp: ft, limit, exceeded: ft > limit };
          }

          return (
            <div key={room.id} className="border border-gray-300 rounded-lg overflow-hidden">
              <button onClick={() => toggleRoom(room.id)}
                className="w-full bg-gray-50 hover:bg-gray-100 p-4 flex items-center justify-between transition">
                <div className="flex items-center gap-4 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronUpIcon className="w-5 h-5 text-gray-500" /> : <ChevronDownIcon className="w-5 h-5 text-gray-500" />}
                    {sufficient ? <CheckIcon className="w-6 h-6 text-green-600" /> : <XIcon className="w-6 h-6 text-red-600" />}
                    <span className="font-bold text-lg">{room.name}</span>
                    {hasUFH && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">UFH</span>}
                    {hasRad && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Radiator</span>}
                  </div>
                  {!isExpanded && (
                    <div className="flex gap-4 text-sm items-center">
                      <div><span className="text-gray-600">Heat Loss:</span> <span className="font-semibold">{heatLoss.toFixed(0)} W</span></div>
                      <div><span className="text-gray-600">Output:</span>{' '}
                        <span className={`font-semibold ${sufficient ? 'text-green-600' : 'text-red-600'}`}>{totalOutput.toFixed(0)} W</span>
                      </div>
                      {floorTempDisplay && (
                        <div><span className="text-gray-600">Floor:</span>{' '}
                          <span className={`font-semibold ${floorTempDisplay.exceeded ? 'text-red-600' : 'text-green-600'}`}>
                            {floorTempDisplay.temp.toFixed(1)}°C{floorTempDisplay.exceeded && ' ⚠'}
                          </span>
                        </div>
                      )}
                      {/* Margin badge */}
                      {heatLoss > 0 && (() => {
                        const margin = ((totalOutput - heatLoss) / heatLoss) * 100;
                        const isNeg  = margin < 0;
                        const isSnug = !isNeg && margin < 10;
                        const colour = isNeg  ? 'bg-red-100 text-red-700'
                                     : isSnug ? 'bg-amber-100 text-amber-700'
                                     :          'bg-green-100 text-green-700';
                        return (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${colour}`}>
                            {isNeg ? '' : '+'}{margin.toFixed(0)}%
                          </span>
                        );
                      })()}
                      {/* Sets flow temp tag */}
                      {systemAnalysis?.drivingRadRoom === room.name && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700" title="This room's radiators require the highest flow temperature and set the minimum system flow temp">
                          ⚡ sets flow temp
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="p-4 bg-white">
                  {hasUFH && (
                    <UFHPanel
                      room={room}
                      project={project}
                      systemSettings={systemSettings}
                      onUpdateUFHSpecs={onUpdateUFHSpecs}
                    />
                  )}
                  <RoomRadiatorSchedule
                    room={room}
                    project={project}
                    systemSettings={systemSettings}
                    mwat={mwat}
                    heatLoss={heatLoss}
                    ufhOutput={checkRoomSufficiency(room).ufhOutput}
                    onUpdateRadiatorSchedule={onUpdateRadiatorSchedule}
                    onAddUFHEmitter={onAddUFHEmitter}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SYSTEM SUMMARY PANEL
// ---------------------------------------------------------------------------
function SystemSummaryPanel({ analysis, systemSettings }) {
  const { totalHeatLoss, totalOutput, minRadFlowTemp, minUFHFlowTemp,
    maxFloorTemp, floorTempWarning, isMixed, blendingNeeded, ufhRoomCount, radRoomCount,
    drivingRadRoom } = analysis;
  const overallSufficient = totalOutput >= totalHeatLoss;
  const [mixedOpen, setMixedOpen] = useState(false);

  return (
    <div className="border-2 border-blue-300 rounded-lg overflow-hidden mb-4">
      <div className="bg-blue-600 text-white px-5 py-3 flex items-center justify-between">
        <span className="font-bold">System Emitter Summary</span>
        <span className={`text-sm px-3 py-0.5 rounded font-medium ${overallSufficient ? 'bg-green-500' : 'bg-red-500'}`}>
          {overallSufficient ? 'All rooms covered' : 'Shortfall — action needed'}
        </span>
      </div>
      <div className="p-5 bg-white">
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Total emitter sizing load</div>
            <div className="text-xl font-bold text-gray-800">{(totalHeatLoss / 1000).toFixed(2)} kW</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Total scheduled output</div>
            <div className={`text-xl font-bold ${overallSufficient ? 'text-green-700' : 'text-red-600'}`}>
              {(totalOutput / 1000).toFixed(2)} kW
            </div>
          </div>
          {minRadFlowTemp !== null && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Min system flow temp (radiators)</div>
              <div className={`text-xl font-bold ${minRadFlowTemp <= systemSettings.flowTemp ? 'text-green-700' : 'text-amber-600'}`}>
                {minRadFlowTemp.toFixed(1)}°C
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{radRoomCount} room{radRoomCount !== 1 ? 's' : ''}</div>
              {drivingRadRoom && (
                <div className="text-xs mt-1.5 pt-1.5 border-t border-gray-200">
                  <span className="text-gray-500">Set by: </span>
                  <span className="font-medium text-gray-700">{drivingRadRoom}</span>
                </div>
              )}
              <div className="text-xs text-gray-400 mt-1 leading-tight">
                The room with the least output margin at the current flow temp.
                {minRadFlowTemp > systemSettings.flowTemp
                  ? ` Increasing the radiator in ${drivingRadRoom} would allow a lower system flow temp.`
                  : ' All radiator rooms are covered at the design flow temp.'}
              </div>
            </div>
          )}
          {minUFHFlowTemp !== null && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Min flow temp (UFH)</div>
              <div className={`text-xl font-bold ${minUFHFlowTemp <= systemSettings.flowTemp ? 'text-green-700' : 'text-amber-600'}`}>
                {minUFHFlowTemp.toFixed(1)}°C
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{ufhRoomCount} room{ufhRoomCount !== 1 ? 's' : ''}</div>
            </div>
          )}
        </div>

        {maxFloorTemp !== null && (
          <div className={`rounded-lg p-3 mb-4 flex items-center justify-between ${floorTempWarning ? 'bg-red-50 border border-red-300' : 'bg-green-50 border border-green-300'}`}>
            <div>
              <span className="text-sm font-semibold mr-2">
                {floorTempWarning ? '⚠ Floor surface temperature exceeded' : '✓ Floor surface temperatures within limits'}
              </span>
              <span className="text-sm text-gray-600">Highest: {maxFloorTemp.toFixed(1)}°C</span>
            </div>
            <span className={`text-xs px-3 py-1 rounded font-medium ${floorTempWarning ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              EN 1264: 29°C occupied / 33°C bathroom
            </span>
          </div>
        )}

        {isMixed && (
          <div className={`rounded-lg border overflow-hidden ${blendingNeeded ? 'border-amber-300' : 'border-green-300'}`}>
            {/* Accordion header — always visible */}
            <button
              onClick={() => blendingNeeded && setMixedOpen(o => !o)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition
                ${blendingNeeded
                  ? 'bg-amber-50 hover:bg-amber-100 cursor-pointer'
                  : 'bg-green-50 cursor-default'}`}
            >
              <span className="font-semibold text-sm">
                {blendingNeeded
                  ? `⚠ Mixed system — radiators need ${minRadFlowTemp?.toFixed(1)}°C, UFH needs ${minUFHFlowTemp?.toFixed(1)}°C`
                  : '✓ Mixed system — radiator and UFH temperatures are compatible at design conditions'}
              </span>
              {blendingNeeded && (
                <span className="ml-3 flex-shrink-0 flex items-center gap-1 text-xs text-amber-700 font-medium">
                  {mixedOpen ? 'Hide options' : 'View options'}
                  <ChevronDownIcon className={`w-4 h-4 transition-transform ${mixedOpen ? 'rotate-180' : ''}`} />
                </span>
              )}
            </button>

            {/* Accordion body — options */}
            {blendingNeeded && mixedOpen && (
              <div className="bg-amber-50 border-t border-amber-200 px-4 pb-4 pt-3 space-y-3">
                <div className="bg-white border border-amber-200 rounded-lg p-3 text-sm text-gray-700">
                  <span className="font-semibold text-gray-800">Before choosing an approach — </span>
                  check the required UFH flow temperatures room by room. If they are close, 
                  adjusting pipe spacing or active area to equalise them simplifies everything downstream. 
                  Where flow temps vary significantly between UFH rooms, verify that your chosen 
                  mixing strategy (TMV or electronic mixer) can serve all circuits, and plan to 
                  fine-tune individual circuit flow rates at commissioning.
                </div>
                <div className="text-sm text-gray-700 mb-1">One of the following approaches is needed:</div>
                {[
                  {
                    title: 'Option 1 — Fixed TMV (thermostatic mixing valve)',
                    desc: `Heat pump runs at ${minRadFlowTemp?.toFixed(0)}°C. A fixed TMV on the UFH manifold blends down to ~${minUFHFlowTemp?.toFixed(0)}°C.`,
                    pros: ['Simple and low cost', 'No controls integration needed'],
                    cons: ['Heat pump runs at higher temp — lower efficiency', 'Fixed blend temp, no weather compensation on UFH'],
                  },
                  {
                    title: 'Option 2 — Weather compensation with separate heating curves',
                    desc: 'Heat pump controller manages both circuits with different heating curves. Electronic mixing valve adjusts UFH flow temp dynamically.',
                    pros: ['Best efficiency — each circuit runs at optimal temp', 'Full weather compensation on both circuits'],
                    cons: ['Requires compatible heat pump controller', 'Higher installation cost'],
                  },
                  {
                    title: `Option 3 — Upgrade radiators to work at ${minUFHFlowTemp?.toFixed(0)}°C`,
                    desc: `Replace or supplement radiators with larger units that deliver sufficient output at ${minUFHFlowTemp?.toFixed(0)}°C. Eliminates the need for blending.`,
                    pros: ['Single low-temperature circuit — maximum efficiency', 'Simplest controls — no mixing required'],
                    cons: ['Cost of radiator replacement', 'May require larger radiators than available space allows'],
                  },
                ].map((opt, i) => (
                  <div key={i} className="bg-white rounded-lg p-3 border border-amber-200">
                    <div className="font-semibold text-sm text-gray-800 mb-1">{opt.title}</div>
                    <div className="text-xs text-gray-600 mb-2">{opt.desc}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {opt.pros.map(p => <span key={p} className="text-green-600">✓ {p}</span>)}
                      {opt.cons.map(c => <span key={c} className="text-red-600">✗ {c}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UFH PANEL
// ---------------------------------------------------------------------------
function UFHPanel({ room, project, systemSettings, onUpdateUFHSpecs }) {
  const defaultSpecs = {
    floorConstruction:    'screed',
    pipeSpacingMm:        150,
    pipeOdM:              0.016,
    screedDepthAbovePipeM: 0.045,
    lambdaScreed:         1.2,
    lambdaScreedCustom:   false,
    floorCovering:        'tiles',
    rLambda:              0.00,
    activeAreaFactor:     1.00,
    zoneType:             'occupied',
    notes:                '',
    ufhFlowTemp:          systemSettings.flowTemp,
    ufhReturnTemp:        systemSettings.flowTemp - 5,
    hasActuator:          0,
  };
  const [draft, setDraft] = useState(room.ufhSpecs || defaultSpecs);
  const [saving, setSaving] = useState(false);

  const isScreedException = draft.floorConstruction === 'screed';

  const handleChange = (field, value) => {
    let updated = { ...draft, [field]: value };

    // Auto-set rLambda from preset covering selection
    if (field === 'floorCovering') {
      const preset = FLOOR_COVERINGS.find(f => f.value === value);
      if (preset && preset.rLambda !== null) updated.rLambda = preset.rLambda;
    }

    // Screed conductivity preset — unlock custom entry if null selected
    if (field === 'lambdaScreedPreset') {
      if (value === null) {
        updated.lambdaScreedCustom = true;
      } else {
        updated.lambdaScreedCustom = false;
        updated.lambdaScreed = value;
      }
    }

    // When flow temp changes, maintain 5K ΔT by adjusting return
    if (field === 'ufhFlowTemp') {
      updated.ufhReturnTemp = parseFloat((value - 5).toFixed(1));
    }

    setDraft(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdateUFHSpecs(room.id, draft);
    setSaving(false);
  };

  // Circuit temperatures
  const ufhMWT    = (draft.ufhFlowTemp + draft.ufhReturnTemp) / 2;
  const ufhDeltaT = draft.ufhFlowTemp - draft.ufhReturnTemp;

  // Build screed geometry params (only used when construction === 'screed')
  const screedParams = isScreedException ? {
    spacingM:     draft.pipeSpacingMm / 1000,
    pipeOdM:      draft.pipeOdM              ?? 0.016,
    pipeIdM:      getPipeIdM(draft.pipeOdM   ?? 0.016),
    tUm:          draft.screedDepthAbovePipeM ?? 0.045,
    lambdaScreed: draft.lambdaScreed          ?? 1.2,
  } : null;

  // Current output at design UFH circuit temps
  const qWm2       = calcUFHOutput(
    ufhMWT, room.internalTemp,
    draft.floorConstruction, draft.pipeSpacingMm, draft.rLambda, screedParams
  );
  const activeArea   = (room.floorArea || 0) * (draft.activeAreaFactor || 1.0);
  const totalOutputW = qWm2 * activeArea;
  const floorTemp    = calcFloorSurfaceTemp(room.internalTemp, qWm2);
  const zoneLimit    = FLOOR_TEMP_LIMITS[draft.zoneType || 'occupied'];
  const floorExceeded = floorTemp > zoneLimit.limit;

  // Required MWT and flow temp to meet room heat loss
  const heatLoss         = calculateRoomTotal(room, project);
  const targetQWm2       = activeArea > 0 ? heatLoss / activeArea : 0;
  const requiredMWT      = calcMinMWTForOutput(
    targetQWm2, room.internalTemp,
    draft.floorConstruction, draft.pipeSpacingMm, draft.rLambda, screedParams
  );
  const requiredFlowTemp  = requiredMWT + (ufhDeltaT / 2);
  const outputSufficient  = totalOutputW >= heatLoss;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <h4 className="font-semibold text-blue-900 mb-3">UFH specification</h4>

      {/* UFH circuit temperatures */}
      <div className="bg-white border border-blue-200 rounded-lg p-3 mb-4">
        <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">
          UFH circuit temperatures
        </div>
        <div className="grid grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              UFH flow temp (°C)
            </label>
            <input
              type="number" step="0.5"
              value={draft.ufhFlowTemp}
              onChange={e => handleChange('ufhFlowTemp', parseFloat(e.target.value) || 45)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              UFH return temp (°C)
            </label>
            <input
              type="number" step="0.5"
              value={draft.ufhReturnTemp}
              onChange={e => handleChange('ufhReturnTemp', parseFloat(e.target.value) || 40)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">ΔT (K)</label>
            <div className={`px-2 py-1.5 rounded text-sm font-medium border ${
              Math.abs(ufhDeltaT - 5) > 1
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}>
              {ufhDeltaT.toFixed(1)} K
              {Math.abs(ufhDeltaT - 5) > 1 && (
                <span className="text-xs ml-1">(design target: 5K)</span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">MWT (°C)</label>
            <div className="px-2 py-1.5 rounded text-sm font-semibold border bg-blue-50 border-blue-200 text-blue-800">
              {ufhMWT.toFixed(1)}°C
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Room temp (°C)
            </label>
            <div className="px-2 py-1.5 rounded text-sm border bg-gray-50 border-gray-200 text-gray-700">
              {room.internalTemp}°C
            </div>
          </div>
        </div>

        {/* Required temperatures */}
        <div className="mt-3 pt-3 border-t border-blue-100">
          <div className="text-xs font-semibold text-blue-600 mb-2">
            Required to meet room heat loss
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-lg p-3 border ${
              outputSufficient
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-300'
            }`}>
              <div className="text-xs text-gray-500 mb-1">Required MWT</div>
              <div className={`text-lg font-bold ${
                outputSufficient ? 'text-green-700' : 'text-red-700'
              }`}>
                {requiredMWT.toFixed(1)}°C
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Current: {ufhMWT.toFixed(1)}°C
                {outputSufficient ? ' ✓' : ' — increase flow temp'}
              </div>
            </div>
            <div className={`rounded-lg p-3 border ${
              outputSufficient
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-300'
            }`}>
              <div className="text-xs text-gray-500 mb-1">Required flow temp</div>
              <div className={`text-lg font-bold ${
                outputSufficient ? 'text-green-700' : 'text-red-700'
              }`}>
                {requiredFlowTemp.toFixed(1)}°C
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                At {ufhDeltaT.toFixed(0)}K ΔT — current: {draft.ufhFlowTemp}°C
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div className="text-xs text-blue-600 mb-1">Margin</div>
              <div className={`text-lg font-bold ${
                outputSufficient ? 'text-green-700' : 'text-red-700'
              }`}>
                {(draft.ufhFlowTemp - requiredFlowTemp).toFixed(1)}°C
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {outputSufficient
                  ? 'above minimum — floor temp headroom'
                  : 'below minimum — raise flow temp'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floor construction inputs */}
      <div className="bg-white border border-blue-200 rounded-lg p-3 mb-4">
        <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">
          Floor construction
        </div>

        {/* Row 1 — construction type, pipe spacing, zone, actuator */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Construction type</label>
            <select value={draft.floorConstruction}
              onChange={e => handleChange('floorConstruction', e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
              {FLOOR_CONSTRUCTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Pipe spacing (mm)</label>
            <select value={draft.pipeSpacingMm}
              onChange={e => handleChange('pipeSpacingMm', parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
              {PIPE_SPACINGS.map(s => <option key={s} value={s}>{s} mm</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Zone type</label>
            <select value={draft.zoneType}
              onChange={e => handleChange('zoneType', e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
              {Object.entries(FLOOR_TEMP_LIMITS).map(([k, v]) =>
                <option key={k} value={k}>{v.label} (max {v.limit}°C)</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Zone actuator</label>
            <label className="flex items-center gap-2 cursor-pointer mt-1.5">
              <input
                type="checkbox"
                checked={!!(draft.hasActuator)}
                onChange={e => handleChange('hasActuator', e.target.checked ? 1 : 0)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-gray-700">Has motorised actuator</span>
            </label>
            <p className="text-xs text-gray-400 mt-1">
              Tick if this UFH zone has a motorised actuator that can close it off.
              Unticked zones count as always open for the modulation volume check.
            </p>
          </div>
        </div>

        {/* Screed-specific geometry — EN 1264-2 inputs */}
        {isScreedException && (
          <div className="grid grid-cols-3 gap-3 mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="col-span-3 mb-1">
              <span className="text-xs font-semibold text-blue-700">
                Screed geometry — EN 1264-2:2021
              </span>
              <span className="text-xs text-blue-500 ml-2">
                Defaults: 16mm OD pipe, 45mm screed above pipes, λ = 1.2 W/mK
                (matches BS EN 1264 reference charts)
              </span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Pipe OD</label>
              <select
                value={draft.pipeOdM ?? 0.016}
                onChange={e => handleChange('pipeOdM', parseFloat(e.target.value))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
                {UFH_PIPE_DIAMETERS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Screed depth above pipe top (mm)
              </label>
              <input
                type="number" step="1" min="20" max="100"
                value={Math.round((draft.screedDepthAbovePipeM ?? 0.045) * 1000)}
                onChange={e => handleChange('screedDepthAbovePipeM', (parseInt(e.target.value) || 45) / 1000)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Screed conductivity (W/mK)
              </label>
              <select
                value={draft.lambdaScreedCustom ? null : (draft.lambdaScreed ?? 1.2)}
                onChange={e => {
                  const v = e.target.value === 'null' ? null : parseFloat(e.target.value);
                  handleChange('lambdaScreedPreset', v);
                }}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
                {UFH_SCREED_CONDUCTIVITIES.map(c => (
                  <option key={c.value ?? 'null'} value={c.value ?? 'null'}>{c.label}</option>
                ))}
              </select>
              {draft.lambdaScreedCustom && (
                <input
                  type="number" step="0.1" min="0.3" max="3.0"
                  value={draft.lambdaScreed ?? 1.2}
                  onChange={e => handleChange('lambdaScreed', parseFloat(e.target.value) || 1.2)}
                  placeholder="e.g. 1.5"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-1 focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          </div>
        )}

        {/* Empirical warning for non-screed systems */}
        {!isScreedException && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <span className="font-semibold">Indicative values only — </span>
            Output for {FLOOR_CONSTRUCTIONS.find(c => c.value === draft.floorConstruction)?.label.toLowerCase()} systems
            is calculated from empirical K-values that approximate typical system geometry.
            These are not traceable to EN 1264-2 and vary significantly between products.
            Confirm actual output against manufacturer test data for the specific system being installed.
          </div>
        )}

        {/* Row 3 — floor covering, rLambda, active area */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Floor covering</label>
            <select value={draft.floorCovering}
              onChange={e => handleChange('floorCovering', e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
              {FLOOR_COVERINGS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Rλ (m²K/W){draft.floorCovering !== 'custom' && ' — auto-set'}
            </label>
            <input type="number" step="0.01" min="0" max="0.30"
              value={draft.rLambda}
              onChange={e => handleChange('rLambda', parseFloat(e.target.value) || 0)}
              disabled={draft.floorCovering !== 'custom'}
              className={`w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 ${
                draft.floorCovering !== 'custom' ? 'bg-gray-100' : ''
              }`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Active area factor</label>
            <div className="flex items-center gap-2">
              <input type="number" step="0.01" min="0.1" max="1.0"
                value={draft.activeAreaFactor}
                onChange={e => handleChange('activeAreaFactor', parseFloat(e.target.value) || 1.0)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500" />
              <span className="text-xs text-gray-500 whitespace-nowrap">= {activeArea.toFixed(1)} m²</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">From {(room.floorArea || 0).toFixed(1)} m²</div>
          </div>
        </div>
      </div>

      {/* Output results */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="bg-white rounded-lg p-3 border border-blue-200">
          <div className="text-xs text-blue-600 mb-1">Output @ design (W/m²)</div>
          <div className="text-lg font-bold text-blue-800">{qWm2.toFixed(1)} W/m²</div>
          <div className="text-xs text-gray-500 mt-0.5">
            MWT: {ufhMWT.toFixed(1)}°C
            {' · '}
            <span className={isScreedException ? 'text-blue-600' : 'text-amber-600'}>
              {isScreedException ? 'EN 1264-2:2021' : 'empirical K-value'}
            </span>
          </div>
        </div>
        <div className={`rounded-lg p-3 border ${
          outputSufficient ? 'bg-white border-blue-200' : 'bg-red-50 border-red-300'
        }`}>
          <div className="text-xs text-blue-600 mb-1">Total output</div>
          <div className={`text-lg font-bold ${outputSufficient ? 'text-blue-800' : 'text-red-700'}`}>
            {totalOutputW.toFixed(0)} W
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Over {activeArea.toFixed(1)} m²</div>
        </div>
        <div className={`rounded-lg p-3 border ${
          floorExceeded ? 'bg-red-50 border-red-300' : 'bg-white border-blue-200'
        }`}>
          <div className={`text-xs mb-1 ${floorExceeded ? 'text-red-600' : 'text-blue-600'}`}>
            Floor surface temp
          </div>
          <div className={`text-lg font-bold ${floorExceeded ? 'text-red-700' : 'text-blue-800'}`}>
            {floorTemp.toFixed(1)}°C
          </div>
          <div className={`text-xs mt-0.5 ${floorExceeded ? 'text-red-500' : 'text-gray-500'}`}>
            Limit: {zoneLimit.limit}°C{floorExceeded && ' ⚠ EXCEEDED'}
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-blue-200">
          <div className="text-xs text-blue-600 mb-1">ΔT at design</div>
          <div className="text-lg font-bold text-blue-800">
            {(ufhMWT - room.internalTemp).toFixed(1)} K
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            MWT {ufhMWT.toFixed(1)}°C − {room.internalTemp}°C room
          </div>
        </div>
      </div>

      {floorExceeded && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-3 text-sm text-red-800">
          Floor surface temperature exceeds the EN 1264 limit for {zoneLimit.label.toLowerCase()} ({zoneLimit.limit}°C).
          Consider reducing flow temperature, increasing pipe spacing, or using a higher Rλ floor covering.
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={handleSave} disabled={saving}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50 transition">
          {saving ? 'Saving...' : 'Save UFH specification'}
        </button>
        <div>
          <label className="text-xs font-semibold text-gray-600 mr-2">Notes</label>
          <input type="text" value={draft.notes}
            onChange={e => handleChange('notes', e.target.value)}
            placeholder="e.g. 20mm screed over 16mm Rehau pipe"
            className="border border-gray-300 rounded px-2 py-1 text-sm w-72 focus:ring-2 focus:ring-blue-500" />
        </div>
        <span className="text-xs text-gray-400 italic">
          To remove UFH from this room, delete the UFH emitter in the Rooms tab
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROOM RADIATOR SCHEDULE
// ---------------------------------------------------------------------------
function RoomRadiatorSchedule({
  room, project, systemSettings, mwat, heatLoss,
  ufhOutput,
  onUpdateRadiatorSchedule,
  onAddUFHEmitter,
}) {
  const schedule = room.radiatorSchedule || [];
  const connectionType = room.designConnectionType || 'BOE';
  const connectionFactor = CONNECTION_TYPE_FACTORS[connectionType] || 0.96;

  // Conversion factor: how much of ΔT50 is delivered at design MWAT
  const conversionFactor = mwat > 0 ? Math.pow(mwat / 50, 1.3) : 0;

  // Residual heat loss — what the radiators actually need to cover after UFH contribution
  const ufhContribution  = ufhOutput || 0;
  const residualHeatLoss = Math.max(0, heatLoss - ufhContribution);
  const hasUFHAssist     = ufhContribution > 0;

  // Required ΔT50 — based on residual only (radiators don't need to cover the UFH share)
  const requiredDt50 = conversionFactor > 0
    ? residualHeatLoss / connectionFactor / conversionFactor
    : 0;

  // Required design output for radiators = residual only
  const requiredDesignOutput = residualHeatLoss;

  // Per-row calculations
  const rowCalcs = schedule.map(item => {
    const spec = project.radiatorSpecs?.find(s => s.id === item.radiator_spec_id);
    const ef = item.enclosure_factor ?? 1.00;
    const ff = item.finish_factor   ?? 1.00;
    const qty = item.quantity || 1;
    const isReplaced = item.emitter_status === 'existing_replace';

    if (!spec || isReplaced) {
      return { item, spec, effDt50: 0, designOutput: 0, contributes: false };
    }

    const effDt50     = effectiveDt50(spec.output_dt50, ef, ff) * qty;
    const designOutput = calculateOutputAtMWAT(effDt50, mwat);

    return { item, spec, effDt50, designOutput, contributes: true };
  });

  const totalEffDt50     = rowCalcs.reduce((s, r) => s + r.effDt50, 0);
  const totalDesignOutput = rowCalcs.reduce((s, r) => s + r.designOutput, 0);
  const combinedOutput   = totalDesignOutput + (ufhOutput || 0);
  const isSufficient     = combinedOutput >= heatLoss;

  const pctDt50   = requiredDt50   > 0 ? ((totalEffDt50     / requiredDt50   - 1) * 100) : null;
  const pctDesign = requiredDesignOutput > 0 ? ((combinedOutput / requiredDesignOutput - 1) * 100) : null;

  const hasUFHEmitter = room.emitters?.some(e => e.emitterType === 'UFH');

  const handleAddToSchedule = async () => {
    await onUpdateRadiatorSchedule(room.id, 'add', {
      radiatorSpecId: null, connectionType, quantity: 1,
      isExisting: false, emitterStatus: 'new',
      enclosureFactor: 1.00, finishFactor: 1.00, notes: '',
    });
  };

  const handleImportExistingEmitters = async () => {
    const existing = room.emitters?.filter(e => e.emitterType === 'Radiator') || [];
    if (existing.length === 0) { alert('No existing radiators found'); return; }
    for (const emitter of existing) {
      if (emitter.radiatorSpecId) {
        await onUpdateRadiatorSchedule(room.id, 'add', {
          radiatorSpecId:  emitter.radiatorSpecId,
          connectionType,
          quantity:        emitter.quantity || 1,
          isExisting:      true,
          emitterStatus:   'existing_retained',
          enclosureFactor: 1.00,
          finishFactor:    1.00,
          notes:           emitter.notes || 'Imported from existing emitters',
        });
      }
    }
  };

  const handleUpdateScheduleItem = async (itemId, field, value) => {
    await onUpdateRadiatorSchedule(room.id, 'update', { id: itemId, field, value });
  };

  const handleDeleteScheduleItem = async (itemId) => {
    await onUpdateRadiatorSchedule(room.id, 'delete', { id: itemId });
  };

  const handleConnectionTypeChange = async (newType) => {
    await onUpdateRadiatorSchedule(room.id, 'connectionType', { value: newType });
  };

  const existingRads = room.emitters?.filter(e => e.emitterType === 'Radiator') || [];
  const hasUnimported = existingRads.length > 0 && schedule.length === 0;

  const roomRadiatorSpecIds = new Set(
    (room.emitters || [])
      .filter(e => e.emitterType === 'Radiator' && e.radiatorSpecId)
      .map(e => e.radiatorSpecId)
  );
  const isOrphaned = (item) => {
    if (item.emitter_status === 'new') return false;
    if (!item.radiator_spec_id) return false;
    return !roomRadiatorSpecIds.has(item.radiator_spec_id);
  };

  const pctBadge = (pct, suffix = '') => {
    if (pct === null) return null;
    const label = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%${suffix}`;
    if (pct >= 0)  return <span className="text-xs px-2 py-0.5 rounded font-medium bg-green-100 text-green-800">{label}</span>;
    if (pct >= -5) return <span className="text-xs px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-800">{label}</span>;
    return           <span className="text-xs px-2 py-0.5 rounded font-medium bg-red-100 text-red-700">{label}</span>;
  };

  return (
    <div>
      {/* Design targets panel */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Room design targets
        </div>

        {/* Metric row */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">Heat loss</div>
            <div className="text-lg font-bold text-gray-800">{heatLoss.toFixed(0)} W</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">MWAT @ design</div>
            <div className="text-lg font-bold text-gray-800">{mwat.toFixed(1)} K</div>
            <div className="text-xs text-gray-400 mt-0.5">
              (MWT − {room.internalTemp}°C room)
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">Conversion factor</div>
            <div className="text-lg font-bold text-gray-800">{conversionFactor.toFixed(3)}</div>
            <div className="text-xs text-gray-400 mt-0.5">(MWAT/50)^1.3</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="text-xs text-blue-600 mb-1">
              Required ΔT50{hasUFHAssist ? ' (radiators only)' : ''}
            </div>
            <div className="text-lg font-bold text-blue-800">{requiredDt50.toFixed(0)} W</div>
            <div className="text-xs text-blue-400 mt-0.5">
              {hasUFHAssist
                ? `(${heatLoss.toFixed(0)} − ${ufhContribution.toFixed(0)} UFH) ÷ ${connectionFactor} ÷ ${conversionFactor.toFixed(3)}`
                : `${heatLoss.toFixed(0)} ÷ ${connectionFactor} ÷ ${conversionFactor.toFixed(3)}`
              }
            </div>
          </div>
        </div>

        {/* Connection type selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-600">Connection type:</span>
          {Object.entries(CONNECTION_TYPE_FACTORS).map(([type, factor]) => (
            <button
              key={type}
              onClick={() => handleConnectionTypeChange(type)}
              className={`text-xs px-3 py-1 rounded-full border transition font-medium ${
                connectionType === type
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {type} × {factor.toFixed(2)}
            </button>
          ))}
        </div>
      </div>

      {/* Import existing prompt */}
      {hasUnimported && (
        <div className="bg-blue-50 border border-blue-300 rounded p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-blue-900 mb-1">Existing radiators detected</h4>
              <p className="text-sm text-blue-700">
                {existingRads.length} existing radiator{existingRads.length > 1 ? 's' : ''} defined.
                Import to evaluate performance.
              </p>
            </div>
            <button onClick={handleImportExistingEmitters}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 whitespace-nowrap text-sm">
              <PlusIcon className="w-4 h-4" />
              Import existing
            </button>
          </div>
        </div>
      )}

      {/* Schedule table */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-semibold">Radiator schedule</h4>
          <div className="flex gap-2">
            {!hasUFHEmitter && onAddUFHEmitter && (
              <button
                onClick={() => onAddUFHEmitter(room.id)}
                className="bg-blue-100 text-blue-700 border border-blue-300 px-3 py-1 rounded hover:bg-blue-200 flex items-center gap-1 text-sm transition"
              >
                <PlusIcon className="w-4 h-4" />
                Add UFH
              </button>
            )}
            <button onClick={handleAddToSchedule}
              className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1 text-sm">
              <PlusIcon className="w-4 h-4" />
              Add radiator
            </button>
          </div>
        </div>

        {schedule.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2 border">Status</th>
                  <th className="text-left p-2 border">
                    <div>Specification</div>
                    <div className="text-xs font-normal text-gray-500">ΔT50 rated | output @ design shown below name</div>
                  </th>
                  <th className="text-left p-2 border">Enclosure</th>
                  <th className="text-left p-2 border">Finish</th>
                  <th className="text-right p-2 border">Qty</th>
                  <th className="text-right p-2 border">
                    <div>Effective ΔT50</div>
                    <div className="text-xs font-normal text-gray-500">rated × enc × finish × qty</div>
                  </th>
                  <th className="text-right p-2 border">
                    <div>Output @ design</div>
                    <div className="text-xs font-normal text-gray-500">eff. ΔT50 × conv. factor</div>
                  </th>
                  <th className="text-right p-2 border">% vs target</th>
                  <th className="text-left p-2 border">Notes</th>
                  <th className="text-center p-2 border text-xs">No TRV</th>
                  <th className="text-center p-2 border"></th>
                </tr>
              </thead>
              <tbody>
                {rowCalcs.map(({ item, spec, effDt50, designOutput }) => {
                  const rowPctDt50 = requiredDt50 > 0 && spec
                    ? ((effectiveDt50(spec.output_dt50, item.enclosure_factor, item.finish_factor) * item.quantity / requiredDt50) * 100)
                    : null;
                  const isExistingRow = item.emitter_status === 'existing_retained' || item.emitter_status === 'existing_replace';
                  const isReplaceRow  = item.emitter_status === 'existing_replace';

                  return (
                    <tr key={item.id} className={`border ${
                      isOrphaned(item)                              ? 'bg-amber-50 border-l-4 border-l-amber-400' :
                      item.emitter_status === 'existing_retained'   ? 'bg-amber-50' :
                      item.emitter_status === 'existing_replace'    ? 'bg-gray-50 opacity-60' :
                      'bg-green-50'
                    }`}>
                      <td className="p-2 border">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium w-fit ${
                            item.emitter_status === 'existing_retained' ? 'bg-amber-200 text-amber-800' :
                            item.emitter_status === 'existing_replace'  ? 'bg-gray-200 text-gray-600' :
                            'bg-green-200 text-green-800'
                          }`}>
                            {item.emitter_status === 'existing_retained' ? 'Existing — retained' :
                             item.emitter_status === 'existing_replace'  ? 'Existing — replace' : 'New'}
                          </span>
                          <select
                            value={item.emitter_status || 'new'}
                            onChange={e => handleUpdateScheduleItem(item.id, 'emitterStatus', e.target.value)}
                            className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 w-fit"
                          >
                            {isExistingRow ? (
                              <>
                                <option value="existing_retained">Existing — retained</option>
                                <option value="existing_replace">Existing — replace</option>
                              </>
                            ) : (
                              <option value="new">New</option>
                            )}
                          </select>
                          {isOrphaned(item) && (
                            <div className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-300">
                              ⚠ Emitter removed from room
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-2 border">
                        {isExistingRow ? (
                          <div>
                            <div className="text-xs text-gray-700 font-medium leading-tight">
                              {spec
                                ? `${spec.manufacturer} ${spec.model} — ${spec.type} ${spec.height}×${spec.length}mm`
                                : 'Unknown radiator'}
                            </div>
                            <div className="text-xs text-gray-400 mt-1 italic">
                              Spec locked — delete and re-import from Rooms tab to change
                            </div>
                          </div>
                        ) : (
                          <select
                            value={item.radiator_spec_id || ''}
                            onChange={e => handleUpdateScheduleItem(item.id, 'radiatorSpecId', parseInt(e.target.value))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 mb-1"
                          >
                            <option value="">Select radiator...</option>
                            {project.radiatorSpecs?.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.source === 'site' ? '◆ ' : ''}
                                {s.manufacturer} {s.model} — {s.type} {s.height}×{s.length}mm
                                {' '}[ΔT50: {s.output_dt50.toFixed(0)}W | design: {calculateOutputAtMWAT(s.output_dt50, mwat).toFixed(0)}W]
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="p-2 border">
                        {isReplaceRow ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <select
                            value={item.enclosure_factor ?? 1.00}
                            onChange={e => handleUpdateScheduleItem(item.id, 'enclosureFactor', parseFloat(e.target.value))}
                            className="w-full border border-gray-300 rounded px-1 py-1 text-xs focus:ring-2 focus:ring-blue-500"
                          >
                            {ENCLOSURE_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="p-2 border">
                        {isReplaceRow ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <select
                            value={item.finish_factor ?? 1.00}
                            onChange={e => handleUpdateScheduleItem(item.id, 'finishFactor', parseFloat(e.target.value))}
                            className="w-full border border-gray-300 rounded px-1 py-1 text-xs focus:ring-2 focus:ring-blue-500"
                          >
                            {FINISH_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="p-2 border text-right">
                        {isReplaceRow ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <input
                            type="number" min="1" value={item.quantity}
                            onChange={e => handleUpdateScheduleItem(item.id, 'quantity', parseInt(e.target.value))}
                            className="w-14 border border-gray-300 rounded px-2 py-1 text-xs text-right"
                          />
                        )}
                      </td>
                      <td className="p-2 border text-right font-semibold">
                        {spec ? `${effDt50.toFixed(0)} W` : '—'}
                      </td>
                      <td className="p-2 border text-right font-semibold text-blue-700">
                        {spec ? `${designOutput.toFixed(0)} W` : '—'}
                      </td>
                      <td className="p-2 border text-right">
                        {spec && rowPctDt50 !== null
                          ? <span className="text-xs text-gray-600 font-medium">
                              {rowPctDt50.toFixed(1)}%
                            </span>
                          : '—'}
                      </td>
                      <td className="p-2 border">
                        <input
                          type="text" value={item.notes || ''}
                          onChange={e => handleUpdateScheduleItem(item.id, 'notes', e.target.value)}
                          placeholder="Notes..."
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="p-2 border text-center">
                        {!isReplaceRow && (
                          <label className="flex flex-col items-center gap-1 cursor-pointer" title="No TRV — always open. Counts towards minimum effective volume for modulation check.">
                            <input
                              type="checkbox"
                              checked={!!(item.no_trv)}
                              onChange={e => handleUpdateScheduleItem(item.id, 'noTrv', e.target.checked ? 1 : 0)}
                              className="w-4 h-4 accent-blue-600"
                            />
                            <span className="text-xs text-gray-500 leading-tight">Open</span>
                          </label>
                        )}
                      </td>
                      <td className="p-2 border text-center">
                        <button onClick={() => handleDeleteScheduleItem(item.id)}
                          className="text-red-600 hover:text-red-700">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Totals row */}
                <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                  <td colSpan="5" className="p-2 border text-right text-sm">Combined total</td>
                  <td className="p-2 border text-right text-blue-700">
                    {totalEffDt50.toFixed(0)} W
                  </td>
                  <td className="p-2 border text-right text-blue-700">
                    {totalDesignOutput.toFixed(0)} W
                    {ufhOutput > 0 && (
                      <div className="text-xs font-normal text-gray-500">
                        +{ufhOutput.toFixed(0)} W UFH = {combinedOutput.toFixed(0)} W
                      </div>
                    )}
                  </td>
                  <td className="p-2 border text-right">
                    {pctBadge(pctDt50)}
                  </td>
                  <td colSpan="2" className="p-2 border"></td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 border border-dashed border-gray-300 rounded">
            <p>No radiators in schedule</p>
            <p className="text-sm mt-1">
              {hasUnimported
                ? 'Click "Import existing" to add existing radiators, or "Add radiator" to start fresh'
                : 'Click "Add radiator" to start building the schedule'}
            </p>
          </div>
        )}

        {/* Target reference lines */}
        {schedule.length > 0 && (
          <div className="mt-3 flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">
                Target ΔT50{hasUFHAssist ? ' (radiators)' : ''}:
              </span>
              <span className="font-semibold text-blue-700">{requiredDt50.toFixed(0)} W</span>
              {pctDt50 !== null && pctBadge(pctDt50, ' vs target')}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">
                Target design output{hasUFHAssist ? ' (radiators)' : ''}:
              </span>
              <span className="font-semibold text-blue-700">{requiredDesignOutput.toFixed(0)} W</span>
              {pctDesign !== null && pctBadge(pctDesign, ' vs residual')}
            </div>
          </div>
        )}
      </div>

      {/* Sufficiency banner */}
      <div className={`p-4 rounded border-2 ${isSufficient ? 'bg-green-50 border-green-500' : 'bg-orange-50 border-orange-500'}`}>
        <div className="flex items-center gap-3">
          {isSufficient ? (
            <>
              <CheckIcon className="w-8 h-8 text-green-600" />
              <div>
                <div className="font-bold text-green-700 text-lg">Room adequately heated ✓</div>
                <div className="text-sm text-green-600">
                  {ufhOutput > 0
                    ? `Radiators: ${totalDesignOutput.toFixed(0)} W + UFH: ${ufhOutput.toFixed(0)} W = ${combinedOutput.toFixed(0)} W — exceeds ${heatLoss.toFixed(0)} W requirement`
                    : `Combined output (${combinedOutput.toFixed(0)} W) exceeds heat loss (${heatLoss.toFixed(0)} W)`
                  }
                </div>
              </div>
            </>
          ) : (
            <>
              <XIcon className="w-8 h-8 text-orange-600" />
              <div>
                <div className="font-bold text-orange-700 text-lg">Insufficient output</div>
                <div className="text-sm text-orange-600">
                  Shortfall: {(heatLoss - combinedOutput).toFixed(0)} W —
                  combined effective ΔT50 ({totalEffDt50.toFixed(0)} W) must reach {requiredDt50.toFixed(0)} W target
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
