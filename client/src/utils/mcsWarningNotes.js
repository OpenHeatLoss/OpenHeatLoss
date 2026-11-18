// client/src/utils/mcsWarningNotes.js
// MCS 031 warning notes.
//
// GENERATED from the official MCS 031 calculator, MCS031-HPSPE Version 4.02
// ('Notes Index' and 'Notes Lookups' sheets). Do not edit the table by hand:
// regenerate it from the spreadsheet when MCS issues a new version, and bump
// MCS031_NOTES_VERSION so saved estimates are flagged for recalculation.
//
// How the spreadsheet selects notes ('Notes Lookups' F3:F8):
//   1. Note 5 from heat pump type and flow band: all types at 56-60 and 61-65,
//      ASHP/SAHP only at 51-55.
//   2. Emitter notes from the row for (heat loss band, flow band):
//        existing radiators        -> 'existing' column
//        mostly upgraded radiators -> 'upgraded' column
//        mostly underfloor, or 50/50 radiators/UFH -> UFH column for the floor type
//      (The spreadsheet's separate 50/50 columns M-O are identical to J-L and
//      are not referenced by its formulas. MCS 031 text 2.4(l)(c) also says to
//      include radiator notes for 50/50 systems; the spreadsheet does not. This
//      follows the spreadsheet.)
//   3. The heat loss band is looked up from W/m2 (Input E27 -> E28), NOT the
//      W/K specific heat loss.

import { getHeatLossBand, getFlowTempBand } from './mcsSPFLookup';

export const MCS031_NOTES_VERSION = 'MCS031-HPSPE v4.02';

export const WARNING_NOTES = {
  "1": "No or minimal change to existing radiators is unlikely to be viable - unless the current radiators are significantly over-sized for your existing fossil fuel boiler.",
  "2": "Proposed system design is possible, but the size of standard emitters may be excessive. Speak to your installer about the emitter choices.",
  "3": "Important: The system cannot operate as designed for tile, wood or carpet on screed, or where aluminium panels are used instead of screed. Fabric heat loss should be reduced and/or load sharing with other emitter types.",
  "4": "The system can operate as designed for tiles. For wood and carpet floor coverings, additional measures to improve property energy efficiency are likely to be needed (such as improved insulation or draught proofing).",
  "5": "Forecast system efficiency is low and running costs may be high without system design changes.",
  "6": "Not suitable for UFH.",
  "7": "Suitable for tiles in bathrooms/ensuites only.",
  "8": "Screed on floors with UFH complies with BS1264 Type A construction laid on floor insulation - default pipe spacing 200mm cc.",
  "9": "Dry floor systems with UFH complies with BS1264 Type B aluminium plate construction laid with insulation underneath - default pipe spacing 200mm cc.",
  "10": "Specialist UFH designers can provide more accurate information for heating performance with different systems."
};

// NOTE_MATRIX[heatLossBand (W/m2)][flowTempBand] = { existing, upgraded, ufh_screed, ufh_chipboard, ufh_panel }
const NOTE_MATRIX = {
  '0-30': {
    'up to 35': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [4, 9, 10], ufh_panel: [9, 10] },
    '36-40': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '41-45': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '46-50': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '51-55': { existing: [], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '56-60': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '61-65': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [6], ufh_panel: [6] },
  },
  '30-50': {
    'up to 35': { existing: [1], upgraded: [], ufh_screed: [4, 8, 10], ufh_chipboard: [3], ufh_panel: [4, 9, 10] },
    '36-40': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '41-45': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '46-50': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '51-55': { existing: [], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '56-60': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '61-65': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [6], ufh_panel: [6] },
  },
  '50-80': {
    'up to 35': { existing: [1], upgraded: [], ufh_screed: [3], ufh_chipboard: [3], ufh_panel: [3] },
    '36-40': { existing: [1], upgraded: [], ufh_screed: [4, 8, 10], ufh_chipboard: [4, 9, 10], ufh_panel: [4, 9, 10] },
    '41-45': { existing: [1], upgraded: [], ufh_screed: [4, 8, 10], ufh_chipboard: [4, 9, 10], ufh_panel: [4, 9, 10] },
    '46-50': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [4, 9, 10], ufh_panel: [9, 10] },
    '51-55': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '56-60': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '61-65': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [6], ufh_panel: [6] },
  },
  '80-100': {
    'up to 35': { existing: [2], upgraded: [2], ufh_screed: [3], ufh_chipboard: [3], ufh_panel: [3] },
    '36-40': { existing: [1], upgraded: [], ufh_screed: [3], ufh_chipboard: [3], ufh_panel: [3] },
    '41-45': { existing: [1], upgraded: [], ufh_screed: [4, 8, 10], ufh_chipboard: [3], ufh_panel: [4, 9, 10] },
    '46-50': { existing: [1], upgraded: [], ufh_screed: [4, 8, 10], ufh_chipboard: [4, 9, 10], ufh_panel: [4, 9, 10] },
    '51-55': { existing: [1], upgraded: [], ufh_screed: [8, 10], ufh_chipboard: [4, 9, 10], ufh_panel: [9, 10] },
    '56-60': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [9, 10], ufh_panel: [9, 10] },
    '61-65': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [6], ufh_panel: [6] },
  },
  '100-120': {
    'up to 35': { existing: [2], upgraded: [2], ufh_screed: [3], ufh_chipboard: [3], ufh_panel: [3] },
    '36-40': { existing: [2], upgraded: [2], ufh_screed: [3], ufh_chipboard: [3], ufh_panel: [3] },
    '41-45': { existing: [2], upgraded: [2], ufh_screed: [7, 8, 10], ufh_chipboard: [3], ufh_panel: [7, 8, 10] },
    '46-50': { existing: [1], upgraded: [], ufh_screed: [7, 8, 10], ufh_chipboard: [7, 8, 10], ufh_panel: [7, 8, 10] },
    '51-55': { existing: [1], upgraded: [], ufh_screed: [7, 8, 10], ufh_chipboard: [7, 8, 10], ufh_panel: [7, 8, 10] },
    '56-60': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [7, 8, 10], ufh_panel: [7, 8, 10] },
    '61-65': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [6], ufh_panel: [6] },
  },
  '120-150': {
    'up to 35': { existing: [2], upgraded: [2], ufh_screed: [3], ufh_chipboard: [3], ufh_panel: [3] },
    '36-40': { existing: [2], upgraded: [2], ufh_screed: [3], ufh_chipboard: [3], ufh_panel: [3] },
    '41-45': { existing: [2], upgraded: [2], ufh_screed: [3], ufh_chipboard: [3], ufh_panel: [3] },
    '46-50': { existing: [1], upgraded: [], ufh_screed: [3], ufh_chipboard: [3], ufh_panel: [3] },
    '51-55': { existing: [1], upgraded: [], ufh_screed: [7, 8, 10], ufh_chipboard: [7, 8, 10], ufh_panel: [7, 8, 10] },
    '56-60': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [6], ufh_panel: [6] },
    '61-65': { existing: [], upgraded: [], ufh_screed: [6], ufh_chipboard: [6], ufh_panel: [6] },
  },
};

// Note 5 — 'Notes Lookups' F3
function heatPumpTypeNotes(flowTempBand, heatPumpType) {
  const airOrSolar = heatPumpType === 'ASHP' || heatPumpType === 'SAHP';
  if (flowTempBand === '56-60' || flowTempBand === '61-65') return [5];
  if (flowTempBand === '51-55' && airOrSolar) return [5];
  return [];
}

function emitterColumn(emitterType, ufhType) {
  if (emitterType === 'existing_radiators') return 'existing';
  if (emitterType === 'upgraded_radiators') return 'upgraded';
  if (emitterType === 'mostly_ufh' || emitterType === '50_50_mix') {
    if (ufhType === 'chipboard') return 'ufh_chipboard';
    if (ufhType === 'panel')     return 'ufh_panel';
    return 'ufh_screed';
  }
  return null;
}

// wattsPerM2: total heat loss / total floorspace (MCS 031 2.1(g)).
// Returns [{ number, text }] in spreadsheet order (heat pump note first).
export function getWarningNotes(wattsPerM2, flowTemp, emitterType, ufhType = 'screed', heatPumpType = 'ASHP') {
  const heatLossBand = getHeatLossBand(wattsPerM2);
  const flowTempBand = getFlowTempBand(flowTemp);
  const col = emitterColumn(emitterType, ufhType);
  const emitterNotes = col ? (NOTE_MATRIX[heatLossBand]?.[flowTempBand]?.[col] || []) : [];
  const all = [...new Set([...heatPumpTypeNotes(flowTempBand, heatPumpType), ...emitterNotes])];
  return all.map(number => ({ number, text: WARNING_NOTES[number] }));
}

