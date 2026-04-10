// client/src/utils/mcsWarningNotes.js
// MCS 031 Warning Notes System

export const WARNING_NOTES = {
  1: "No or minimal change to existing radiators is unlikely to be viable - unless the current radiators are significantly over-sized for your existing fossil fuel boiler.",
  2: "Proposed system design is possible, but the size of standard emitters may be excessive. Speak to your installer about the emitter choices.",
  3: "Important: The system cannot operate as designed for tile, wood or carpet on screed, or where aluminium panels are used instead of screed. Fabric heat loss should be reduced and/or load sharing with other emitter types.",
  4: "The system can operate as designed for tiles. For wood and carpet floor coverings, additional measures to improve property energy efficiency are likely to be needed (such as improved insulation or draught proofing).",
  5: "Forecast system efficiency is low and running costs may be high without system design changes.",
  6: "Not suitable for UFH.",
  7: "Suitable for tiles in bathrooms/ensuites only.",
  8: "Screed on floors with UFH complies with BS1264 Type A construction laid on floor insulation - default pipe spacing 200mm cc.",
  9: "Dry floor systems with UFH complies with BS1264 Type B aluminium plate construction laid with insulation underneath - default pipe spacing 200mm cc.",
  10: "Specialist UFH designers can provide more accurate information for heating performance with different systems."
};

// Note lookup table based on heat loss band, flow temp, and emitter type
const NOTE_MATRIX = {
  '0-30': {
    'up to 35': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '36-40': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '41-45': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '46-50': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '51-55': { existing: [5], upgraded: [5], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '56-60': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6], mix_ufh_chip: [6,6], mix_ufh_panel: [] },
    '61-65': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6,6,6,6,6], mix_ufh_chip: [6,6,6,6,6,6], mix_ufh_panel: [6,6] }
  },
  '30-50': {
    'up to 35': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [] },
    '36-40': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '41-45': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '46-50': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '51-55': { existing: [5], upgraded: [5], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '56-60': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6], mix_ufh_chip: [6,6], mix_ufh_panel: [] },
    '61-65': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6,6,6,6,6], mix_ufh_chip: [6,6,6,6,6,6], mix_ufh_panel: [6,6] }
  },
  '50-80': {
    'up to 35': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [3,3,3,3,3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '36-40': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '41-45': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '46-50': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '51-55': { existing: [5], upgraded: [5], mostly_ufh: [1], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '56-60': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6], mix_ufh_chip: [6,6], mix_ufh_panel: [] },
    '61-65': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6,6,6,6,6], mix_ufh_chip: [6,6,6,6,6,6], mix_ufh_panel: [6,6] }
  },
  '80-100': {
    'up to 35': { existing: [2], upgraded: [2], mostly_ufh: [], mix_ufh_screed: [3,3,3,3,3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '36-40': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [3,3,3,3,3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '41-45': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [] },
    '46-50': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '51-55': { existing: [5], upgraded: [5], mostly_ufh: [1], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '56-60': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6], mix_ufh_chip: [6,6], mix_ufh_panel: [] },
    '61-65': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6,6,6,6,6], mix_ufh_chip: [6,6,6,6,6,6], mix_ufh_panel: [6,6] }
  },
  '100-120': {
    'up to 35': { existing: [2], upgraded: [2], mostly_ufh: [], mix_ufh_screed: [3,3,3,3,3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '36-40': { existing: [2], upgraded: [2], mostly_ufh: [], mix_ufh_screed: [3,3,3,3,3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '41-45': { existing: [2], upgraded: [2], mostly_ufh: [], mix_ufh_screed: [3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [] },
    '46-50': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '51-55': { existing: [5], upgraded: [5], mostly_ufh: [1], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '56-60': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6], mix_ufh_chip: [6,6], mix_ufh_panel: [] },
    '61-65': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6,6,6,6,6], mix_ufh_chip: [6,6,6,6,6,6], mix_ufh_panel: [6,6] }
  },
  '120-150': {
    'up to 35': { existing: [2], upgraded: [2], mostly_ufh: [], mix_ufh_screed: [3,3,3,3,3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '36-40': { existing: [2], upgraded: [2], mostly_ufh: [], mix_ufh_screed: [3,3,3,3,3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '41-45': { existing: [2], upgraded: [2], mostly_ufh: [], mix_ufh_screed: [3,3,3,3,3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '46-50': { existing: [], upgraded: [1], mostly_ufh: [], mix_ufh_screed: [3,3,3,3,3,3], mix_ufh_chip: [3,3], mix_ufh_panel: [3,3] },
    '51-55': { existing: [5], upgraded: [5], mostly_ufh: [1], mix_ufh_screed: [], mix_ufh_chip: [], mix_ufh_panel: [] },
    '56-60': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6,6,6,6,6], mix_ufh_chip: [6,6], mix_ufh_panel: [6,6] },
    '61-65': { existing: [5], upgraded: [5], mostly_ufh: [5,5], mix_ufh_screed: [6,6,6,6,6,6], mix_ufh_chip: [6,6,6,6,6,6], mix_ufh_panel: [6,6] }
  }
};

// Get applicable warning notes
export function getWarningNotes(specificHeatLoss, flowTemp, emitterType, ufhType = 'screed') {
  const heatLossBand = getHeatLossBand(specificHeatLoss);
  const flowTempBand = getFlowTempBand(flowTemp);
  
  // Map emitter type to key
  let emitterKey = 'existing';
  if (emitterType === 'upgraded_radiators') {
    emitterKey = 'upgraded';
  } else if (emitterType === 'mostly_ufh') {
    emitterKey = 'mostly_ufh';
  } else if (emitterType === '50_50_mix') {
    // For mixed systems, we need to check UFH type
    if (ufhType === 'screed') emitterKey = 'mix_ufh_screed';
    else if (ufhType === 'chipboard') emitterKey = 'mix_ufh_chip';
    else if (ufhType === 'panel') emitterKey = 'mix_ufh_panel';
  }
  
  const noteNumbers = NOTE_MATRIX[heatLossBand]?.[flowTempBand]?.[emitterKey] || [];
  
  // Add standard UFH notes for UFH systems
  const additionalNotes = [];
  if (emitterType === 'mostly_ufh' || emitterType === '50_50_mix') {
    if (ufhType === 'screed') additionalNotes.push(8, 10);
    else if (ufhType === 'chipboard') additionalNotes.push(9, 10);
    else if (ufhType === 'panel') additionalNotes.push(9, 10);
  }
  
  // Combine and deduplicate
  const allNotes = [...new Set([...noteNumbers, ...additionalNotes])];
  
  // Return note objects
  return allNotes.map(num => ({
    number: num,
    text: WARNING_NOTES[num]
  }));
}

function getHeatLossBand(specificHeatLoss) {
  if (specificHeatLoss < 30) return '0-30';
  if (specificHeatLoss < 50) return '30-50';
  if (specificHeatLoss < 80) return '50-80';
  if (specificHeatLoss < 100) return '80-100';
  if (specificHeatLoss < 120) return '100-120';
  return '120-150';
}

function getFlowTempBand(flowTemp) {
  if (flowTemp <= 35) return 'up to 35';
  if (flowTemp <= 40) return '36-40';
  if (flowTemp <= 45) return '41-45';
  if (flowTemp <= 50) return '46-50';
  if (flowTemp <= 55) return '51-55';
  if (flowTemp <= 60) return '56-60';
  return '61-65';
}