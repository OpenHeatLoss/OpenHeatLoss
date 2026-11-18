// client/src/utils/mcsSPFLookup.js
// MCS 031 SPF Lookup Table and Star Rating System

// SPF Lookup Table from MCS 031
export const MCS_SPF_TABLE = {
  '0-30': {
    'up to 35': { gshp: 4.3, ashp: 4.0, stars: 6 },
    '36-40': { gshp: 4.1, ashp: 3.8, stars: 5 },
    '41-45': { gshp: 3.7, ashp: 3.4, stars: 4 },
    '46-50': { gshp: 3.4, ashp: 3.1, stars: 3 },
    '51-55': { gshp: 3.1, ashp: 2.8, stars: 2 },
    '56-60': { gshp: 2.8, ashp: 2.5, stars: 1 },
    '61-65': { gshp: 2.8, ashp: 2.5, stars: 0 }
  },
  '30-50': {
    'up to 35': { gshp: 4.3, ashp: 4.0, stars: 6 },
    '36-40': { gshp: 4.1, ashp: 3.8, stars: 5 },
    '41-45': { gshp: 3.7, ashp: 3.4, stars: 4 },
    '46-50': { gshp: 3.4, ashp: 3.1, stars: 3 },
    '51-55': { gshp: 3.1, ashp: 2.8, stars: 2 },
    '56-60': { gshp: 2.8, ashp: 2.5, stars: 1 },
    '61-65': { gshp: 2.8, ashp: 2.5, stars: 0 }
  },
  '50-80': {
    'up to 35': { gshp: 4.3, ashp: 4.0, stars: 6 },
    '36-40': { gshp: 4.1, ashp: 3.8, stars: 5 },
    '41-45': { gshp: 3.7, ashp: 3.4, stars: 4 },
    '46-50': { gshp: 3.4, ashp: 3.1, stars: 3 },
    '51-55': { gshp: 3.1, ashp: 2.8, stars: 2 },
    '56-60': { gshp: 2.8, ashp: 2.5, stars: 1 },
    '61-65': { gshp: 2.8, ashp: 2.5, stars: 0 }
  },
  '80-100': {
    'up to 35': { gshp: 4.3, ashp: 4.0, stars: 6 },
    '36-40': { gshp: 4.1, ashp: 3.8, stars: 5 },
    '41-45': { gshp: 3.7, ashp: 3.4, stars: 4 },
    '46-50': { gshp: 3.4, ashp: 3.1, stars: 3 },
    '51-55': { gshp: 3.1, ashp: 2.8, stars: 2 },
    '56-60': { gshp: 2.8, ashp: 2.5, stars: 1 },
    '61-65': { gshp: 2.8, ashp: 2.5, stars: 0 }
  },
  '100-120': {
    'up to 35': { gshp: 4.3, ashp: 4.0, stars: 6 },
    '36-40': { gshp: 4.1, ashp: 3.8, stars: 5 },
    '41-45': { gshp: 3.7, ashp: 3.4, stars: 4 },
    '46-50': { gshp: 3.4, ashp: 3.1, stars: 3 },
    '51-55': { gshp: 3.1, ashp: 2.8, stars: 2 },
    '56-60': { gshp: 2.8, ashp: 2.5, stars: 1 },
    '61-65': { gshp: 2.8, ashp: 2.5, stars: 0 }
  },
  '120-150': {
    'up to 35': { gshp: 4.3, ashp: 4.0, stars: 6 },
    '36-40': { gshp: 4.1, ashp: 3.8, stars: 5 },
    '41-45': { gshp: 3.7, ashp: 3.4, stars: 4 },
    '46-50': { gshp: 3.4, ashp: 3.1, stars: 3 },
    '51-55': { gshp: 3.1, ashp: 2.8, stars: 2 },
    '56-60': { gshp: 2.8, ashp: 2.5, stars: 1 },
    '61-65': { gshp: 2.8, ashp: 2.5, stars: 0 }
  }
};

// Heat loss band from W/m2 (MCS 031 2.1(g): total heat loss / floorspace).
// The official calculator (MCS031-HPSPE v4.02, Input E27 -> E28) bands on
// W/m2, not on the W/K specific heat loss. Above 150 W/m2 the spreadsheet
// returns "Error"; this clamps to 120-150 (SPF and stars are the same in every
// band, so only the warning notes depend on it).
export function getHeatLossBand(wattsPerM2) {
  if (wattsPerM2 < 30) return '0-30';
  if (wattsPerM2 < 50) return '30-50';
  if (wattsPerM2 < 80) return '50-80';
  if (wattsPerM2 < 100) return '80-100';
  if (wattsPerM2 < 120) return '100-120';
  return '120-150';
}

// Get flow temperature band
export function getFlowTempBand(flowTemp) {
  if (flowTemp <= 35) return 'up to 35';
  if (flowTemp <= 40) return '36-40';
  if (flowTemp <= 45) return '41-45';
  if (flowTemp <= 50) return '46-50';
  if (flowTemp <= 55) return '51-55';
  if (flowTemp <= 60) return '56-60';
  return '61-65';
}

// Get SPF and star rating. wattsPerM2 only selects the band; in v4.02 the SPF
// and stars are identical across bands (they depend on flow band and type).
export function getSPFAndStars(wattsPerM2, flowTemp, heatPumpType) {
  const heatLossBand = getHeatLossBand(wattsPerM2);
  const flowTempBand = getFlowTempBand(flowTemp);
  
  const data = MCS_SPF_TABLE[heatLossBand]?.[flowTempBand];
  
  if (!data) {
    return { spf: 2.5, stars: 0, heatLossBand, flowTempBand };
  }
  
  // Determine SPF based on heat pump type
  const isGroundOrWater = heatPumpType === 'GSHP' || heatPumpType === 'WSHP';
  const spf = isGroundOrWater ? data.gshp : data.ashp;
  
  return {
    spf,
    stars: data.stars,
    heatLossBand,
    flowTempBand
  };
}

// Render star rating component
export function renderStars(starCount) {
  const stars = '⭐'.repeat(starCount);
  return stars || 'No stars';
}

// Get flow temp ranges for graph data
export function getFlowTempRanges() {
  return [
    { label: 'up to 35', value: 35 },
    { label: '36-40', value: 38 },
    { label: '41-45', value: 43 },
    { label: '46-50', value: 48 },
    { label: '51-55', value: 53 },
    { label: '56-60', value: 58 },
    { label: '61-65', value: 63 }
  ];
}