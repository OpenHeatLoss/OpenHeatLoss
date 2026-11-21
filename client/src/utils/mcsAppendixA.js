// client/src/utils/mcsAppendixA.js
//
// MCS 031 performance estimate where no valid EPC can be used — MCS 031 2.1
// "Where it is not possible to obtain a valid EPC refer to Appendix A".
// A valid EPC has not expired AND its annual heat demand is not expected to
// change (e.g. an extension or refurbishment the heat pump will serve).
//
// Appendix A: assess the annual space heating and hot water load with a
// suitable, clearly described and justified method; divide space heating by
// the heat pump's default SCoP/SPERh from the MCS website and hot water by
// the efficiency at the water-heating flow temperature.
//
// Method used here (Simon, 21 Nov):
//   Space heating — degree-day method: specific heat loss (W/K) from the
//     room-by-room heat loss × postcode degree days (MCS 031 Table 1) × 24
//     ÷ 1000. The EPC route does exactly this in reverse (W/K from the EPC
//     kWh), so the two routes are consistent.
//   Hot water — MIS 3005-D 5.6.2 daily demand × 365, heated from the cold
//     feed to 50 °C (MCS 031's own assumption: its pasteurisation term
//     raises the store from 50 to 60 °C).
//   The heat pump supplies 100% of both loads (no supplementary heater) —
//     a supplementary share is not supported yet and the statement says so.
//
// Pure: no React, no API. Used by the MCS 031 tab (calculation + display)
// and by mcsSnapshotStatus (out-of-date check).

import { buildHeatLossPayload } from './buildHeatLossPayload';
import { getMCSDataFromPostcode, getPostcodePrefix } from './mcsData';
import { dailyHotWaterDemand } from './dhwCalculations';
import { annualDhwReheatKwh, DHW_COLD_FEED_C } from './scopCalculations';

export const DEMAND_ROUTES = {
  epc:        'EPC (MCS 031 2.1)',
  appendix_a: 'No valid EPC (MCS 031 Appendix A)',
};

// Why the EPC route cannot be used. Printed on the estimate.
export const APPENDIX_A_REASONS = {
  demand_changing: 'The annual heat demand will change (extension or refurbishment), so the existing EPC is not valid for this system',
  not_entitled:    'The premises are not entitled to a domestic EPC',
  cannot_obtain:   'A valid EPC cannot be obtained',
};

export const APPENDIX_A_DHW_STORE_C = 50;

// Hot water: Appendix A divides by the efficiency at the flow temperature
// used for water heating. The MCS listing gives SCoP by flow temperature only,
// so the designer enters the listed SCoP at the hot water flow temperature
// (usually 55 °C), or 1.7 — MCS 031's own hot water figure (SAP 2012 Table 4a,
// used on the EPC route). Stored in mcs_dhw_efficiency (migration 030).
export const MCS031_DHW_DEFAULT = 1.7;
export const MCS031_DHW_DEFAULT_SOURCE = 'MCS 031 hot water figure (SAP 2012 Table 4a)';

export const isAppendixA = (project) => project?.mcsDemandRoute === 'appendix_a';

// On this route the estimate is calculated FROM the room-by-room heat loss, so
// it must be complete first (Simon, 21 Nov): rooms exist, every room has a
// floor area (W/m² and the floor area figure) and at least one heat loss
// element (a room with none would contribute ventilation loss only).
export function heatLossCompleteness(project) {
  const rooms = project?.rooms || [];
  const name = (r) => r.name || 'Unnamed room';
  const noArea     = rooms.filter(r => !(Number(r.floorArea) > 0)).map(name);
  const noElements = rooms.filter(r => !(r.elements || []).length).map(name);
  return {
    complete: rooms.length > 0 && noArea.length === 0 && noElements.length === 0,
    noRooms: rooms.length === 0,
    noArea,
    noElements,
  };
}

const r0 = (v) => Math.round(v);
const r1 = (v) => Math.round(v * 10) / 10;

// → { ok, missing: [..], ...figures, methodStatement: [..] }
// `missing` lists what stops the calculation, in the designer's words.
export function appendixADemand(project) {
  const missing = [];
  const hl = buildHeatLossPayload(project);
  const postcodePrefix = getPostcodePrefix(project.customerPostcode);
  const climate = getMCSDataFromPostcode(project.customerPostcode);
  const providesHw = (project.mcsSystemProvides || 'space_and_hw') !== 'space_only';

  const heatLoss = heatLossCompleteness(project);
  if (!heatLoss.complete || !(hl.heatLossCoefficient > 0)) missing.push('a complete room-by-room heat loss');
  if (!climate) missing.push('a postcode with MCS 031 degree-day data');

  const reason = APPENDIX_A_REASONS[project.mcsAppendixAReason] ? project.mcsAppendixAReason : null;
  if (!reason) missing.push('the reason a valid EPC cannot be used');

  const listedScop = Number(project.mcsListedScop) > 0 ? Number(project.mcsListedScop) : null;
  if (!listedScop) missing.push('the heat pump\'s SCoP from the MCS website');

  const dhw = providesHw ? dailyHotWaterDemand({ bedrooms: project.mcsBedrooms, occupants: project.mcsOccupants }) : null;
  const dhwEfficiency = Number(project.mcsDhwEfficiency) > 0 ? Number(project.mcsDhwEfficiency) : null;
  if (providesHw && !dhw) missing.push('bedrooms or occupants (hot water demand)');
  if (providesHw && !dhwEfficiency) missing.push('the heat pump\'s SCoP for hot water (or 1.7)');

  const specificHeatLossWK = hl.heatLossCoefficient || 0;
  const degreeDays = climate?.degreeDays ?? null;
  const spaceHeatingKwh = degreeDays ? (specificHeatLossWK * degreeDays * 24) / 1000 : 0;
  const hotWaterKwh = dhw ? annualDhwReheatKwh(dhw.litres, APPENDIX_A_DHW_STORE_C) : 0;
  // Same basis as the heat loss report: generator load for EN 12831
  const designLoadKw = hl.isEN12831 ? hl.totalGeneratorLoad : hl.totalHeatLoss;

  const listedScopSource = (project.mcsListedScopSource || '').trim();
  const dhwEfficiencySource = (project.mcsDhwEfficiencySource || '').trim();
  const rawNote = (project.mcsAppendixANote || '').trim();
  // Printed mid-paragraph, so make sure it ends a sentence
  const note = rawNote && !/[.!?]$/.test(rawNote) ? rawNote + '.' : rawNote;

  const methodStatement = [];
  if (reason) methodStatement.push(`No valid EPC: ${APPENDIX_A_REASONS[reason].charAt(0).toLowerCase() + APPENDIX_A_REASONS[reason].slice(1)}.${note ? ' ' + note : ''} The estimate follows MCS 031 Appendix A.`);
  if (degreeDays) {
    methodStatement.push(
      `Space heating: specific heat loss of ${r1(specificHeatLossWK)} W/K from the room-by-room heat loss ` +
      `calculation (BS EN 12831-1:2017) × ${degreeDays} degree days for postcode area ${postcodePrefix} ` +
      `(MCS 031 Table 1) × 24 h ÷ 1000 = ${r0(spaceHeatingKwh).toLocaleString('en-GB')} kWh a year.`);
  }
  if (providesHw && dhw) {
    methodStatement.push(
      `Hot water: ${dhw.n} people × 45 litres a day (MIS 3005-D 5.6.2) = ${dhw.litres} litres a day, heated from ` +
      `${DHW_COLD_FEED_C} °C to ${APPENDIX_A_DHW_STORE_C} °C, 365 days a year = ${r0(hotWaterKwh).toLocaleString('en-GB')} kWh a year.`);
  }
  if (listedScop) {
    methodStatement.push(
      `Electricity for space heating = space heating ÷ the heat pump's SCoP of ${listedScop} listed on the MCS website` +
      `${listedScopSource ? ` (${listedScopSource})` : ''}.`);
  }
  if (providesHw && dhwEfficiency) {
    const usedDefault = dhwEfficiency === MCS031_DHW_DEFAULT && dhwEfficiencySource === MCS031_DHW_DEFAULT_SOURCE;
    methodStatement.push(usedDefault
      ? `Electricity for hot water = hot water ÷ ${dhwEfficiency}, the figure MCS 031 uses for hot water (SAP 2012 Table 4a).`
      : `Electricity for hot water = hot water ÷ the heat pump's SCoP of ${dhwEfficiency} at the hot water flow temperature` +
        `${dhwEfficiencySource ? ` (${dhwEfficiencySource})` : ''}.`);
  }
  methodStatement.push('The heat pump is assumed to supply all of the space heating' +
    (providesHw ? ' and hot water' : '') + ' load, with no supplementary heater.');

  return {
    ok: missing.length === 0,
    missing,
    heatLoss,
    reason,
    reasonText: reason ? APPENDIX_A_REASONS[reason] : '',
    note,
    providesHw,
    postcodePrefix: postcodePrefix || '',
    degreeDays,
    specificHeatLossWK,
    spaceHeatingKwh,
    hotWaterKwh,
    dailyLitres: dhw?.litres ?? null,
    occupantsN: dhw?.n ?? null,
    totalFloorArea: hl.totalFloorArea || 0,
    wattsPerM2: hl.heatLossPerM2 || 0,
    heatPumpCapacityKw: designLoadKw || 0,
    listedScop,
    listedScopSource,
    dhwEfficiency,
    dhwEfficiencySource,
    methodStatement,
  };
}

// The parts of the Appendix A result that, if changed, make a saved estimate
// out of date. Rounded so float noise in the heat loss doesn't flag it.
export function appendixAFingerprintPart(project) {
  const a = appendixADemand(project);
  return {
    route: 'appendix_a',
    reason: a.reason, note: a.note,
    listedScop: a.listedScop, listedScopSource: a.listedScopSource,
    dhwEfficiency: a.dhwEfficiency, dhwEfficiencySource: a.dhwEfficiencySource,
    hlc: r1(a.specificHeatLossWK), area: r1(a.totalFloorArea), wpm2: r1(a.wattsPerM2),
    cap: r1(a.heatPumpCapacityKw), dailyLitres: a.dailyLitres,
  };
}
