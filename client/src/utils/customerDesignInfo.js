// client/src/utils/customerDesignInfo.js
//
// Assembles the information MIS 3005-D 5.9.2 requires to be given to the
// customer in writing before installation, items (a)–(g), from saved project
// data. Pure function: the Summary panel renders it now, and the PDF (step 5)
// will use the same result, so screen and document cannot disagree.
//
// opts.system = { flowTemp, returnTemp } — live emitter design settings, for
// callers (Emitter Sizing's customer pack) that print the emitter schedule
// from live settings, so the two documents in one pack agree. Default: the
// saved designFlowTemp / designReturnTemp.
//
// Each item: { key, clause, title, status, ...data }
//   status: 'ok' | 'warning' | 'missing'
//   missing — something needed for the item has not been entered
//   warning — entered, but the design has a problem the designer should see

import { CUSTOMER_DESIGN_INFO_ITEMS, MCS031_CALCULATOR } from './mcsClauses';
import { buildHeatLossPayload } from './buildHeatLossPayload';
import { analyseEmitterSystem, buildEmitterRoomData } from './emitterCalculations';
import { dailyHotWaterDemand, recoveryAssessment, HEATUP_FROM_C, HEATUP_TO_C } from './dhwCalculations';
import { getSPFAndStars } from './mcsSPFLookup';
import { isAppendixA } from './mcsAppendixA';

const item = (key, fields) => ({ ...CUSTOMER_DESIGN_INFO_ITEMS.find(i => i.key === key), ...fields });
const hasUFH = (room) => !!room.ufhSpecs && (room.emitters || []).some(e => e.emitterType === 'UFH');

export function buildCustomerDesignInfo(project, opts = {}) {
  const rooms   = project.rooms || [];
  const flow    = Number(opts.system?.flowTemp   ?? project.designFlowTemp);
  const ret     = Number(opts.system?.returnTemp ?? project.designReturnTemp);
  const flowOk  = Number.isFinite(flow) && Number.isFinite(ret) && flow > ret;
  const system  = flowOk ? { flowTemp: flow, returnTemp: ret } : null;

  // ── (a) Room heat losses — same figures as the heat loss report ──────────
  const heatLoss = buildHeatLossPayload(project);
  const a = item('a', {
    status: rooms.length ? 'ok' : 'missing',
    rooms: heatLoss.rooms.map(r => ({
      name: r.name, wPerM2: r.wPerM2, floorArea: r.floorArea,
      // Same basis as wPerM2: generator load (EN 12831) or room total (legacy)
      heatLossW: r.generatorTotal ?? r.totalHeatLoss ?? r.wPerM2 * r.floorArea,
    })),
    buildingWPerM2: heatLoss.heatLossPerM2,
  });

  // ── (b) Daily hot water demand ───────────────────────────────────────────
  const demand = dailyHotWaterDemand({ bedrooms: project.mcsBedrooms, occupants: project.mcsOccupants });
  const b = item('b', {
    status: demand ? 'ok' : 'missing',
    demand,
  });

  // ── (c) Emitters — same room data as the emitter schedule PDF ────────────
  const roomData = system ? buildEmitterRoomData(project, system) : [];
  const emitterRooms = roomData.map(r => ({
    name: r.name,
    // Radiators being replaced are not part of the installed system.
    emitters: r.schedule
      .filter(e => e.emitterStatus !== 'existing_replace')
      .map(e => ({
        description: e.spec,
        quantity:    e.quantity,
        isUFH:       !!e.isUFH,
        retained:    e.emitterStatus === 'existing_retained',
      })),
  }));
  const roomsWithoutEmitters = emitterRooms.filter(r => r.emitters.length === 0).map(r => r.name);
  const c = item('c', {
    status: !system || emitterRooms.every(r => r.emitters.length === 0) ? 'missing' : 'ok',
    rooms: emitterRooms,
    roomsWithoutEmitters,
  });

  // ── (d) Design emitter temperature, worst performing room ────────────────
  // Worst room = the one whose emitters need the highest flow temperature,
  // excluding rooms with an accepted shortfall (their emitter can't be
  // enlarged — they're listed separately with the reason).
  const analysis = system ? analyseEmitterSystem(project, system) : null;
  let d;
  if (!analysis) {
    d = item('d', { status: 'missing', reason: !rooms.length ? 'no_rooms' : 'flow_return' });
  } else {
    const wholeHouseCovered = analysis.totalOutput >= analysis.totalHeatLoss;
    const acceptedShortfalls = roomData
      .filter(r => r.shortfallAccepted)
      .map(r => ({ name: r.name, shortfallW: r.shortfallW, reason: r.shortfallReason }));
    d = item('d', {
      status: analysis.unresolvedShortRooms.length || !wholeHouseCovered ? 'warning' : 'ok',
      flowTemp: flow,
      returnTemp: ret,
      meanWaterTemp: (flow + ret) / 2,
      worstRoom: analysis.drivingRadRoom,
      worstRoomFlowTemp: analysis.minRadFlowTemp,
      ufhMinFlowTemp: analysis.minUFHFlowTemp,
      acceptedShortfalls,
      unresolvedShortRooms: analysis.unresolvedShortRooms,
      wholeHouseCovered,
      totalHeatLoss: analysis.totalHeatLoss,
      totalOutput: analysis.totalOutput,
    });
  }

  // ── (e) New cylinder and recovery ────────────────────────────────────────
  const litres = Number(project.mcsCylinderVolume) > 0 ? Number(project.mcsCylinderVolume) : null;
  const ratedKw = Number(project.heatPumpRatedOutput) > 0 ? Number(project.heatPumpRatedOutput) : null;
  const hpKw = project.dhwHpOutputKw ?? ratedKw;
  const rec = recoveryAssessment({ litres, datasheetMin: project.dhwHeatupTimeMin, hpOutputKw: hpKw });
  let e;
  if (project.dhwCylinderIsNew === false) {
    e = item('e', { status: 'ok', isNew: false, litres });
  } else {
    const missing = [
      project.dhwCylinderIsNew == null && 'new or existing',
      !(project.dhwCylinderManufacturer && project.dhwCylinderModel) && 'make and model',
      !litres && 'volume',
      rec.governingMin == null && 'heat-up time or heat pump output',
    ].filter(Boolean);
    e = item('e', {
      status: missing.length ? 'missing' : 'ok',
      missing,
      isNew: project.dhwCylinderIsNew,
      manufacturer: project.dhwCylinderManufacturer || '',
      model: project.dhwCylinderModel || '',
      litres,
      coilAreaM2: project.dhwCoilAreaM2 ?? null,
      recoveryMin: rec.governingMin,
      recoveryLph: rec.recoveryLph,
      recoveryBasis: rec.governedBy,
      hpOutputKw: Number(hpKw) > 0 ? Number(hpKw) : null,
      conditions: `From a fully cold cylinder, ${HEATUP_FROM_C} → ${HEATUP_TO_C} °C`,
      reheatAgreed: !!project.dhwReheatAgreed,
      reheatAgreedMin: project.dhwReheatTimeAgreedMin ?? null,
    });
  }

  // ── (f) Flow temperature leaving the heat pump, before blending ──────────
  // The heat pump runs at the highest temperature any circuit needs: the
  // radiator design flow, or a UFH circuit flow if one is set higher. Lower
  // UFH circuits are blended down from it.
  const ufhFlows = rooms.filter(hasUFH)
    .map(r => ({ name: r.name, flowTemp: r.ufhSpecs.ufhFlowTemp ?? flow }))
    .filter(u => Number.isFinite(u.flowTemp));
  const hasRadiators = rooms.some(r => (r.radiatorSchedule || []).some(
    i => i.emitter_status !== 'existing_replace' && i.radiator_spec_id));
  const candidates = [...(hasRadiators || !ufhFlows.length ? [flow] : []), ...ufhFlows.map(u => u.flowTemp)]
    .filter(Number.isFinite);
  const leavingTemp = candidates.length ? Math.max(...candidates) : null;
  const blended = ufhFlows.filter(u => u.flowTemp < leavingTemp);
  const f = item('f', {
    status: flowOk && leavingTemp != null ? 'ok' : 'missing',
    leavingTemp,
    blendedCircuits: blended,
  });

  // ── (g) MCS 031 SPF at the design flow temperature ───────────────────────
  // MCS 031 v4 replaced SCoP values with SPF; the SPF depends only on the
  // flow temperature band and heat pump type (identical in every heat loss
  // band), so no EPC is needed for this item.
  // No-EPC route (MCS 031 Appendix A, Simon 21 Nov): the estimate uses the
  // heat pump's SCoP as listed on the MCS website, which is what 5.9.2(g)
  // literally asks for — so (g) states that figure and its source.
  let g;
  if (isAppendixA(project)) {
    const scop = Number(project.mcsListedScop) > 0 ? Number(project.mcsListedScop) : null;
    g = item('g', {
      status: scop ? 'ok' : 'missing',
      basis: 'listed_scop',
      scop,
      heatPumpType: project.mcsHeatPumpType || 'ASHP',
      leavingTemp,
      source: (project.mcsListedScopSource || '').trim() || 'MCS website',
    });
  } else if (leavingTemp == null) {
    g = item('g', { status: 'missing' });
  } else {
    const { spf, flowTempBand } = getSPFAndStars(heatLoss.heatLossPerM2 || 0, leavingTemp, project.mcsHeatPumpType || 'ASHP');
    g = item('g', {
      status: 'ok',
      spf,
      basis: 'mcs031_spf',
      flowTempBand,
      heatPumpType: project.mcsHeatPumpType || 'ASHP',
      source: `MCS 031 (${MCS031_CALCULATOR}), at ${leavingTemp} °C`,
    });
  }

  const items = [a, b, c, d, e, f, g];
  return {
    items,
    counts: {
      ok:      items.filter(i => i.status === 'ok').length,
      warning: items.filter(i => i.status === 'warning').length,
      missing: items.filter(i => i.status === 'missing').length,
    },
  };
}
