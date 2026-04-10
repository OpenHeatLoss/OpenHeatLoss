// client/src/utils/calculateSystemVolume.js
//
// Calculates total system water volume from all sources:
//   1. Radiators     — water_volume (L/m) × radiator length (mm→m) × quantity
//   2. Pipework      — π × (internal_radius)² × section length, from pipeMaterialData
//   3. UFH           — π × (bore_radius)² × pipe run length per room
//   4. Heat pump     — user-entered internal volume from datasheet
//   5. Buffer vessel — user-entered volume (0 if none)
//
// All inputs come from the project object as loaded by App.jsx loadProject().
// Returns a breakdown object — caller decides where to display it.

import { PIPE_MATERIALS } from './pipeMaterialData';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the internal diameter (mm) for a pipe section.
 * Falls back to a simple rule (OD - 2mm wall) if the material/size isn't found.
 */
function getPipeInternalDiameterMm(material, nominalSize) {
  // Normalise MLCP variants to a single key for lookup
  const key = (material === 'mlcp_riifo' || material === 'mlcp_maincor') ? 'mlcp' : material;
  const sizes = PIPE_MATERIALS[key]?.sizes ?? [];
  const match = sizes.find(s => s.nominalSize === nominalSize);
  if (match) return match.internalDiameter;
  // Fallback: strip 'mm' suffix, subtract 2mm wall
  const od = parseFloat(nominalSize);
  return isNaN(od) ? 0 : od - 2;
}

/**
 * Volume of a cylinder in litres.
 * @param {number} internalDiameterMm
 * @param {number} lengthM
 */
function cylinderVolumeLitres(internalDiameterMm, lengthM) {
  const r = (internalDiameterMm / 1000) / 2; // radius in metres
  return Math.PI * r * r * lengthM * 1000;    // m³ → litres
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Calculate the total system water volume breakdown.
 *
 * @param {Object} project  Full project object from React state
 * @returns {{
 *   radiatorLitres: number,
 *   pipeworkLitres: number,
 *   ufhLitres:      number,
 *   heatPumpLitres: number,
 *   bufferLitres:   number,
 *   totalLitres:    number,
 *   effectiveVolumeLitres:  number,   // open emitters + pipes + HP + buffer
 *   requiredMinVolumeLitres: number,  // heatPumpMinModulation × 20
 *   expansionGuidanceLitres: number,
 *   radiatorBreakdown: Array<{name, litres, noTrv}>,
 *   pipeworkBreakdown: Array<{name, litres}>,
 *   ufhBreakdown:      Array<{name, litres, hasActuator}>,
 * }}
 */
export function calculateSystemVolume(project) {
  const rooms         = project.rooms         || [];
  const radiatorSpecs = project.radiatorSpecs || [];
  const pipeSections  = project.pipeSections  || [];

  // ── 1. Radiators ──────────────────────────────────────────────────────────
  // water_volume is litres per metre of radiator length.
  // spec.length is the physical panel length in mm.
  // Each schedule item carries quantity.
  let radiatorLitres = 0;
  const radiatorBreakdown = [];

  for (const room of rooms) {
    const schedule = room.radiatorSchedule || [];
    for (const item of schedule) {
      // Skip replaced radiators — they contribute 0W and won't be in the system
      if (item.emitter_status === 'existing_replace') continue;

      const spec = radiatorSpecs.find(s => s.id === item.radiator_spec_id);
      if (!spec || !spec.water_volume || !spec.length) continue;

      const lengthM   = spec.length / 1000;          // mm → m
      const qty       = item.quantity || 1;
      const litres    = spec.water_volume * lengthM * qty;
      radiatorLitres += litres;

      radiatorBreakdown.push({
        name:   `${room.name} — ${spec.manufacturer} ${spec.model} ${spec.height}×${spec.length}mm × ${qty}`,
        litres,
        noTrv:  !!(item.no_trv),
      });
    }
  }

  // ── 2. Pipework ───────────────────────────────────────────────────────────
  // Each section: volume = π r² × length, where r = internal_diameter / 2.
  // Pipe lengths are stored in metres.
  let pipeworkLitres = 0;
  const pipeworkBreakdown = [];

  for (const section of pipeSections) {
    const idMm   = getPipeInternalDiameterMm(section.material, section.diameter);
    const length = section.length || 0;
    if (idMm <= 0 || length <= 0) continue;

    // Multiply by 2 for flow + return leg. Pipe length entered by the user
    // is the single-pipe run — the system contains both flow and return.
    const litres   = cylinderVolumeLitres(idMm, length) * 2;
    pipeworkLitres += litres;

    pipeworkBreakdown.push({
      name:   `${section.name || 'Section'} — ${section.diameter} × ${length}m (flow + return)`,
      litres,
    });
  }

  // ── 3. UFH ────────────────────────────────────────────────────────────────
  // UFH pipe run length = active_area / pipe_spacing_m
  // Internal bore from UFH_PIPE_DIAMETERS (same as RadiatorSizing)
  let ufhLitres = 0;
  const ufhBreakdown = [];

  const UFH_BORES = { 0.012: 9, 0.016: 12, 0.020: 16 }; // OD → bore mm

  for (const room of rooms) {
    const hasUFHEmitter = (room.emitters || []).some(e => e.emitterType === 'UFH');
    if (!hasUFHEmitter || !room.ufhSpecs) continue;

    const ufh        = room.ufhSpecs;
    const pipeOdM    = ufh.pipeOdM      ?? 0.016;
    const spacingMm  = ufh.pipeSpacingMm ?? 150;
    const activeFactor = ufh.activeAreaFactor ?? 1.0;
    const activeAreaM2 = (room.floorArea || 0) * activeFactor;

    const boreMm     = UFH_BORES[pipeOdM] ?? (pipeOdM * 1000 - 4);
    const spacingM   = spacingMm / 1000;
    const runLengthM = spacingM > 0 ? activeAreaM2 / spacingM : 0;

    if (runLengthM <= 0) continue;

    const litres  = cylinderVolumeLitres(boreMm, runLengthM);
    ufhLitres    += litres;

    ufhBreakdown.push({
      name:        `${room.name} — UFH ${spacingMm}mm spacing, ${activeAreaM2.toFixed(1)}m² active`,
      litres,
      hasActuator: !!(ufh.hasActuator),
    });
  }

  // ── 4 & 5. Heat pump internal + buffer ───────────────────────────────────
  const heatPumpLitres = project.heatPumpInternalVolume ?? 0;
  const bufferLitres   = project.bufferVesselVolume     ?? 0;

  // ── Total & expansion vessel guidance ────────────────────────────────────
  const totalLitres = radiatorLitres + pipeworkLitres + ufhLitres + heatPumpLitres + bufferLitres;

  // Effective open volume — for the 20 L/kW minimum modulation check.
  // Includes: all pipework, HP internal, buffer (always open),
  // plus radiators marked no_trv and UFH circuits without actuators.
  // Excludes TRV-controlled radiators and actuated UFH zones (could all close).
  const effectiveRadiatorLitres = radiatorBreakdown
    .filter(r => r.noTrv)
    .reduce((s, r) => s + r.litres, 0);
  const effectiveUFHLitres = ufhBreakdown
    .filter(u => !u.hasActuator)
    .reduce((s, u) => s + u.litres, 0);
  const effectiveVolumeLitres = effectiveRadiatorLitres + pipeworkLitres + effectiveUFHLitres + heatPumpLitres + bufferLitres;

  // Required minimum: 20 L per kW of minimum modulation output (MCS MIS 3005)
  const minModKw = project.heatPumpMinModulation ?? 0;
  const requiredMinVolumeLitres = minModKw * 20;

  // Expansion vessel minimum pre-charge guidance:
  // A common rule of thumb is 10% of total system volume as a minimum vessel size.
  const expansionGuidanceLitres = totalLitres * 0.10;

  return {
    radiatorLitres,
    pipeworkLitres,
    ufhLitres,
    heatPumpLitres,
    bufferLitres,
    totalLitres,
    effectiveVolumeLitres,
    requiredMinVolumeLitres,
    expansionGuidanceLitres,
    radiatorBreakdown,
    pipeworkBreakdown,
    ufhBreakdown,
  };
}
