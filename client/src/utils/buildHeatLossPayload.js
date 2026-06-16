// client/src/utils/buildHeatLossPayload.js
//
// Shared utility that assembles the heat loss PDF payload from project state.
// Used by Summary.jsx (standalone heat loss PDF) and RadiatorSizing.jsx
// (customer pack). Any changes to the PDF format should be made here only.
//
// opts:
//   flowTemp      — pass from local component state if unsaved (RadiatorSizing)
//   returnTemp    — as above
//   testPoints    — Summary passes its live (possibly unsaved) test point state
//   defrostPct    — Summary passes its live state
//   balancePoint  — Summary passes its live state
//   emitterType   — Summary passes its live state
//
// When opts are not supplied, all values are derived from project fields
// (i.e. last-saved state). This is correct for the customer pack.

import {
  calculateRoomHeatLoss,
  calculateVentilationLoss,
  calculateTotalHeatLoss,
} from './heatLossCalculations';
import {
  calculateRoomVentilationEN12831,
  calculateBuildingVentilationEN12831,
} from './en12831Calculations';
import { calculateTransmissionLoss } from './calculations';
import {
  fitEta,
  calculateSpaceHeatingScop,
  calculateDHWScop,
  calculateWholeSystemScop,
  EMITTER_EXPONENTS,
} from './scopCalculations';

export function buildHeatLossPayload(project, opts = {}) {
  const flowTemp   = opts.flowTemp   ?? project.designFlowTemp   ?? 50;
  const returnTemp = opts.returnTemp ?? project.designReturnTemp ?? 40;

  const rooms        = project.rooms || [];
  const externalTemp = project.externalTemp  ?? -3;
  const referenceTemp = project.referenceTemp ?? 10.6;
  const isEN12831    = (project.ventilationMethod ?? 'en12831_cibse2026') === 'en12831_cibse2026';

  // ── Building totals ──────────────────────────────────────────────────────
  const totalFabricLossW = rooms.reduce((sum, room) =>
    sum + calculateTransmissionLoss(room, externalTemp), 0);
  const totalFabricLoss = totalFabricLossW / 1000;

  const buildingVent = isEN12831 && rooms.length > 0
    ? calculateBuildingVentilationEN12831(rooms, project)
    : null;

  const totalVentEmitterW       = buildingVent ? buildingVent.buildingVentEmitter            : 0;
  const totalVentGeneratorW     = buildingVent ? buildingVent.buildingVentGeneratorDesign     : 0;
  const totalVentTypicalW       = buildingVent ? buildingVent.buildingVentGeneratorTypical    : 0;
  const totalHeatLossEmitter    = totalFabricLoss + (totalVentEmitterW    / 1000);
  const totalGeneratorLoad      = totalFabricLoss + (totalVentGeneratorW  / 1000);

  const totalFabricTypicalW = rooms.reduce((sum, room) =>
    sum + calculateTransmissionLoss(room, referenceTemp), 0);
  const totalTypicalLoad = (totalFabricTypicalW + totalVentTypicalW) / 1000;

  const totalHeatLossLegacy    = calculateTotalHeatLoss(rooms, project);
  const totalVentilationLegacy = rooms.reduce((sum, room) =>
    sum + calculateVentilationLoss(room, project), 0);

  const totalHeatLoss = isEN12831 ? totalHeatLossEmitter : totalHeatLossLegacy;
  const totalVentLoss = isEN12831 ? totalVentEmitterW / 1000 : totalVentilationLegacy;

  const sizingBase = isEN12831 ? totalGeneratorLoad : totalHeatLoss;

  const totalFloorArea = rooms.reduce((sum, r) => sum + (r.floorArea || 0), 0);
  const totalVolume    = rooms.reduce((sum, r) => sum + (r.volume    || 0), 0);

  const avgInternalTemp = rooms.length > 0
    ? rooms.reduce((s, r) => s + (r.internalTemp || 20), 0) / rooms.length : 20;
  const deltaT = avgInternalTemp - externalTemp;
  const heatLossCoefficient = deltaT > 0 ? ((sizingBase * 1000) / deltaT) : 0;

  const minModKw = project.heatPumpMinModulation || 0;
  const minModulationTemp = (heatLossCoefficient > 0 && minModKw > 0)
    ? avgInternalTemp - ((minModKw * 1000) / heatLossCoefficient)
    : null;

  const heatPumpSizingMargin = sizingBase > 0
    ? ((project.heatPumpRatedOutput || 0) / sizingBase) : 0;

  const ventWarnings = buildingVent?.warnings || [];

  // ── Per-room data ────────────────────────────────────────────────────────
  const roomData = rooms.map(room => {
    const fabricW = calculateTransmissionLoss(room, externalTemp);
    if (isEN12831) {
      const ventCalc       = calculateRoomVentilationEN12831(room, project);
      const emitterTotal   = fabricW + ventCalc.ventEmitter;
      const generatorTotal = fabricW + ventCalc.ventGeneratorDesign;
      const wPerM2 = room.floorArea > 0 ? generatorTotal / room.floorArea : 0;
      return {
        name:          room.name,
        internalTemp:  room.internalTemp,
        floorArea:     room.floorArea || 0,
        volume:        room.volume    || 0,
        fabricLoss:    fabricW,
        ventEmitter:   ventCalc.ventEmitter,
        emitterTotal,
        generatorTotal,
        wPerM2,
      };
    } else {
      const roomHeatLoss = calculateRoomHeatLoss(room, project);
      const ventLoss     = calculateVentilationLoss(room, project);
      return {
        name:            room.name,
        internalTemp:    room.internalTemp,
        floorArea:       room.floorArea || 0,
        volume:          room.volume    || 0,
        fabricLoss:      fabricW,
        ventilationLoss: ventLoss * 1000,
        totalHeatLoss:   roomHeatLoss * 1000,
        wPerM2: room.floorArea > 0 ? (roomHeatLoss / room.floorArea) * 1000 : 0,
      };
    }
  });

  // ── SCOP ─────────────────────────────────────────────────────────────────
  // Resolved in priority order: opts (live component state) → project fields
  // (saved state). The customer pack never passes opts, so always uses saved
  // state. Summary passes its live state so the PDF matches what's on screen.
  const testPoints  = opts.testPoints  ?? project.en14511TestPoints ?? [];
  const defrostPct  = opts.defrostPct  ?? project.defrostPct        ?? 5;
  const balancePoint = opts.balancePoint ?? project.balancePoint    ?? 12.5;
  const emitterType = opts.emitterType ?? (project.scopEmitterType  || 'radiator');

  const validTestPoints = testPoints
    .filter(p => p.cop !== '' && parseFloat(p.cop) > 0)
    .map(p => ({ tAir: parseFloat(p.tAir), tFlow: parseFloat(p.tFlow), cop: parseFloat(p.cop) }));

  const { eta } = validTestPoints.length >= 2
    ? fitEta(validTestPoints)
    : { eta: 0 };

  const emitterN = EMITTER_EXPONENTS[emitterType]?.n ?? 1.3;

  const shScop = eta > 0 && heatLossCoefficient > 0
    ? calculateSpaceHeatingScop({
        eta,
        heatLossCoefficient,
        avgInternalTemp,
        externalTemp,
        designFlowTemp:  project.designFlowTemp  || 50,
        designReturnTemp: project.designReturnTemp || 40,
        emitterN,
        defrostPct,
        balancePoint,
      })
    : null;

  const dhwScop = eta > 0 && (project.mcsOccupants || 0) > 0
    ? calculateDHWScop({
        eta,
        occupants:      project.mcsOccupants     || 0,
        cylinderLitres: project.mcsCylinderVolume || 200,
        storeTemp:      55,
      })
    : null;

  const wholeScop = calculateWholeSystemScop(shScop, dhwScop);

  const scop = shScop ? {
    shScop:            shScop.scop,
    shScopNoDefrost:   shScop.scopNoDefrost,
    shHeatKwh:         shScop.totalHeatKwh,
    shElecKwh:         shScop.totalElecKwh,
    dhwScop:           dhwScop ? dhwScop.dhwScop          : null,
    dhwCopPast:        dhwScop ? dhwScop.copPast           : null,
    dhwHeatKwh:        dhwScop ? dhwScop.totalDHWHeatKwh  : null,
    dhwElecKwh:        dhwScop ? dhwScop.totalElecKwh     : null,
    occupants:         project.mcsOccupants      || null,
    cylinderLitres:    project.mcsCylinderVolume  || null,
    wholeScop:         wholeScop ? wholeScop.wholeSystemScop : null,
    wholeTotalHeatKwh: wholeScop ? wholeScop.totalHeatKwh    : null,
    wholeTotalElecKwh: wholeScop ? wholeScop.totalElecKwh    : null,
    defrostPct,
    balancePoint,
    emitterType,
  } : null;

  // ── Assembled payload ────────────────────────────────────────────────────
  return {
    isEN12831,
    projectName:       project.name              || 'Untitled Project',
    location:         [project.customerAddressLine1, project.customerAddressLine2,
                       project.customerTown, project.customerPostcode]
                        .filter(Boolean).join(', ') || '',
    designer:          project.designer          || '',
    customerTitle:     project.customerTitle     || '',
    customerFirstName: project.customerFirstName || '',
    customerSurname:   project.customerSurname   || '',
    customerAddress:  [project.customerAddressLine1, project.customerAddressLine2,
                       project.customerTown]
                        .filter(Boolean).join(', ') || '',
    customerPostcode:  project.customerPostcode  || '',
    customerTelephone: project.customerTelephone || '',
    externalTemp,
    referenceTemp,
    // EN 12831 figures
    totalGeneratorLoad,
    totalHeatLossEmitter,
    totalVentGeneratorW,
    totalVentEmitterW,
    totalTypicalLoad,
    minModKw,
    minModulationTemp,
    // Shared / legacy
    totalHeatLoss,
    totalFabricLoss,
    totalVentilationLoss: totalVentLoss,
    totalFloorArea,
    totalVolume,
    heatLossPerM2: totalFloorArea > 0 ? (sizingBase / totalFloorArea) * 1000 : 0,
    heatLossCoefficient,
    numberOfRooms: rooms.length,
    heatPump: {
      manufacturer:  project.heatPumpManufacturer  || '',
      model:         project.heatPumpModel         || '',
      ratedOutput:   project.heatPumpRatedOutput   || 0,
      minModulation: project.heatPumpMinModulation || 0,
      flowTemp,
      returnTemp,
      sizingMargin:  heatPumpSizingMargin,
    },
    ventWarnings,
    rooms: roomData,
    scop,
  };
}
