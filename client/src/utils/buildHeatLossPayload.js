// client/src/utils/buildHeatLossPayload.js
//
// Shared utility that assembles the heat loss PDF payload from project state.
// Used by both Summary.jsx (for the standalone heat loss PDF export) and
// RadiatorSizing.jsx (for the customer pack).
//
// Mirrors Summary.jsx handleExportPDF — any changes to the PDF format should
// be kept in sync here.

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

export function buildHeatLossPayload(project, opts = {}) {
  // opts.flowTemp / opts.returnTemp allow RadiatorSizing to pass its local
  // (possibly unsaved) system settings. Summary doesn't need this because it
  // reads directly from project, but RadiatorSizing holds them in local state.
  const flowTemp   = opts.flowTemp   ?? project.designFlowTemp   ?? 50;
  const returnTemp = opts.returnTemp ?? project.designReturnTemp ?? 40;

  const rooms       = project.rooms || [];
  const externalTemp = project.externalTemp ?? -3;
  const referenceTemp = project.referenceTemp ?? 10.6;
  const isEN12831   = (project.ventilationMethod ?? 'en12831_cibse2026') === 'en12831_cibse2026';

  // ── Building totals ────────────────────────────────────────────────────────
  const totalFabricLossW = rooms.reduce((sum, room) =>
    sum + calculateTransmissionLoss(room, externalTemp), 0);
  const totalFabricLoss = totalFabricLossW / 1000;

  const buildingVent = isEN12831 && rooms.length > 0
    ? calculateBuildingVentilationEN12831(rooms, project)
    : null;

  const totalVentEmitterW          = buildingVent ? buildingVent.buildingVentEmitter            : 0;
  const totalVentGeneratorW        = buildingVent ? buildingVent.buildingVentGeneratorDesign     : 0;
  const totalVentTypicalW          = buildingVent ? buildingVent.buildingVentGeneratorTypical    : 0;
  const totalHeatLossEmitter       = totalFabricLoss + (totalVentEmitterW / 1000);
  const totalGeneratorLoad         = totalFabricLoss + (totalVentGeneratorW / 1000);

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

  // ── Per-room data ──────────────────────────────────────────────────────────
  const roomData = rooms.map(room => {
    const fabricW = calculateTransmissionLoss(room, externalTemp);
    if (isEN12831) {
      const ventCalc     = calculateRoomVentilationEN12831(room, project);
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

  // ── Assembled payload ──────────────────────────────────────────────────────
  return {
    isEN12831,
    projectName:       project.name              || 'Untitled Project',
    location:         [project.customerAddressLine1, project.customerAddressLine2, project.customerTown, project.customerPostcode]
                        .filter(Boolean).join(', ') || '',
    designer:          project.designer          || '',
    customerTitle:     project.customerTitle     || '',
    customerFirstName: project.customerFirstName || '',
    customerSurname:   project.customerSurname   || '',
    customerAddress:  [project.customerAddressLine1, project.customerAddressLine2, project.customerTown]
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
    // SCOP is not included — caller can merge it in if needed (Summary does this).
    // The customer pack cover letter and heat loss report don't require SCOP.
    scop: null,
  };
}
