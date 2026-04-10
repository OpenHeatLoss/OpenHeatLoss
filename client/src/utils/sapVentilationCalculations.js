// client/src/utils/sapVentilationCalculations.js

import { 
  SHELTER_FACTORS, 
  getRoomACH, 
  calculatePartFMinimum 
} from './sapVentilationData';

/**
 * Calculate infiltration rate based on SAP 10.2 methodology
 * 
 * @param {Object} project - Project data with dwelling characteristics
 * @returns {number} - Infiltration rate in m³/h
 */
export const calculateSAPInfiltration = (project) => {
  const {
    dwellingType,
    numberOfStoreys = 2,
    shelterFactor = 'normal',
    airPermeabilityQ50, // m³/(h·m²) @ 50Pa
    totalFloorArea = 100,
    numberOfChimneys = 0,
    numberOfOpenFlues = 0,
    numberOfIntermittentFans = 0,
    numberOfPassiveVents = 0,
    hasBlowerTest = false
  } = project;

  // Get air permeability (q50 or default)
  const q50 = airPermeabilityQ50 || 10; // Default if not specified
  
  // Calculate dwelling volume (approximate)
  const dwellingVolume = totalFloorArea * 2.4 * numberOfStoreys; // Assuming 2.4m ceiling height
  
  // Convert q50 to n50 (air changes per hour at 50 Pa)
  // n50 = q50 × (envelope area / volume)
  // Simplified: envelope area ≈ 6 × √(floor area × height)
  const envelopeArea = 6 * Math.sqrt(totalFloorArea * 2.4 * numberOfStoreys);
  const n50 = (q50 * envelopeArea) / dwellingVolume;
  
  // Convert n50 to infiltration at normal pressure
  // SAP uses: infiltration rate = n50 / 20 (for typical UK conditions)
  const baseInfiltrationACH = n50 / 20;
  
  // Apply shelter factor
  const shelterMultiplier = SHELTER_FACTORS[shelterFactor]?.factor || 1.0;
  const adjustedInfiltrationACH = baseInfiltrationACH * shelterMultiplier;
  
  // Calculate base infiltration volume flow
  let infiltrationRate = adjustedInfiltrationACH * dwellingVolume;
  
  // Add allowances for chimneys and flues (SAP Table 4f)
  // Open chimney: add 40 m³/h
  // Open flue: add 20 m³/h
  infiltrationRate += (numberOfChimneys * 40);
  infiltrationRate += (numberOfOpenFlues * 20);
  
  // Add allowances for intermittent fans (SAP Table 4f)
  // Intermittent extract fan: add 10 m³/h
  infiltrationRate += (numberOfIntermittentFans * 10);
  
  // Add allowances for passive vents (SAP Table 4f)
  // Passive vent: add 10 m³/h
  infiltrationRate += (numberOfPassiveVents * 10);
  
  return infiltrationRate;
};

/**
 * Calculate room-specific ventilation loss using SAP methodology
 * 
 * @param {Object} room - Room data
 * @param {Object} project - Project data
 * @returns {Object} - Ventilation calculation breakdown
 */
export const calculateRoomVentilationSAP = (room, project) => {
  const {
    volume = 0,
    internalTemp = 21,
    roomType = 'living_room',
    hasManualACHOverride = false,
    manualACH = 0,
    extractFanFlowRate = 0, // l/s
    hasOpenFire = false
  } = room;
  
  // buildingCategory is a project-level setting, not per-room
  const buildingCategory = project?.buildingCategory || 'B';
  
  const externalTemp = project.externalTemp || -3;
  const tempDiff = internalTemp - externalTemp;
  
  // Get CIBSE recommended ACH for this room type and category
  let baseACH = getRoomACH(roomType, buildingCategory);
  
  // If manual override is set, use that instead
  if (hasManualACHOverride && manualACH > 0) {
    baseACH = manualACH;
  }
  
  // Convert ACH to volume flow rate (m³/h)
  let infiltrationRate = baseACH * volume;
  
  // Add extract fan contribution if specified
  // Convert l/s to m³/h: multiply by 3.6
  const extractFanRate = extractFanFlowRate * 3.6;
  
  // Add open fire allowance if applicable (40 m³/h per SAP)
  const openFireAllowance = hasOpenFire ? 40 : 0;
  
  // Total ventilation rate
  const totalVentilationRate = infiltrationRate + extractFanRate + openFireAllowance;
  
  // Calculate ventilation heat loss
  // HV = 0.33 × V̇ (where 0.33 = ρ × cp for air in Wh/(m³·K))
  const HV = 0.33 * totalVentilationRate;
  const ventilationLoss = HV * tempDiff;
  
  return {
    baseACH,
    infiltrationRate, // m³/h from ACH
    extractFanRate, // m³/h from extract fans
    openFireAllowance, // m³/h from open fire
    totalVentilationRate, // m³/h total
    HV, // Heat transfer coefficient W/K
    ventilationLoss, // Watts
    tempDiff,
    breakdown: {
      roomType,
      category: buildingCategory,
      volume,
      baseACH,
      infiltrationRate: infiltrationRate.toFixed(1),
      extractFan: extractFanFlowRate > 0 ? `${extractFanFlowRate} l/s = ${extractFanRate.toFixed(1)} m³/h` : 'None',
      openFire: hasOpenFire ? '40 m³/h' : 'None',
      totalRate: totalVentilationRate.toFixed(1),
      HV: HV.toFixed(2),
      tempDiff: tempDiff.toFixed(1),
      loss: ventilationLoss.toFixed(0)
    }
  };
};

/**
 * Calculate whole-dwelling ventilation and check Part F compliance
 * 
 * @param {Array} rooms - Array of room objects
 * @param {Object} project - Project data
 * @returns {Object} - Whole-dwelling ventilation summary and Part F compliance
 */
export const calculateWholeDwellingVentilation = (rooms, project) => {
  const {
    totalFloorArea = 0,
    numberOfBedrooms = 0,
    ventilationSystemType = 'natural',
    mvhrEfficiency = 0 // Percentage (0-100)
  } = project;
  
  // Calculate total ventilation rate across all rooms
  let totalVentilationRate = 0; // m³/h
  let totalVentilationLoss = 0; // W
  
  rooms.forEach(room => {
    const calc = calculateRoomVentilationSAP(room, project);
    totalVentilationRate += calc.totalVentilationRate;
    totalVentilationLoss += calc.ventilationLoss;
  });
  
  // Convert total ventilation rate to l/s for Part F comparison
  const totalVentilationLS = totalVentilationRate / 3.6;
  
  // Calculate Part F minimum requirements
  const partF = calculatePartFMinimum(totalFloorArea, numberOfBedrooms);
  
  // Check compliance
  const meetsPartFArea = totalVentilationLS >= partF.rateByArea;
  const meetsPartFBedrooms = totalVentilationLS >= partF.rateByBedrooms;
  const meetsPartF = meetsPartFArea && meetsPartFBedrooms;
  
  // Calculate effective ventilation loss if MVHR is present
  let effectiveVentilationLoss = totalVentilationLoss;
  if (ventilationSystemType === 'mvhr' && mvhrEfficiency > 0) {
    // Reduce ventilation loss by heat recovery efficiency
    effectiveVentilationLoss = totalVentilationLoss * (1 - mvhrEfficiency / 100);
  }
  
  return {
    totalVentilationRate, // m³/h
    totalVentilationLS, // l/s
    totalVentilationLoss, // W (before heat recovery)
    effectiveVentilationLoss, // W (after heat recovery if applicable)
    mvhrSavings: totalVentilationLoss - effectiveVentilationLoss, // W saved by MVHR
    partF: {
      requiredByArea: partF.rateByArea.toFixed(1),
      requiredByBedrooms: partF.rateByBedrooms.toFixed(1),
      requiredMinimum: partF.requiredMinimum.toFixed(1),
      actualRate: totalVentilationLS.toFixed(1),
      meetsPartFArea,
      meetsPartFBedrooms,
      meetsPartF,
      deficit: meetsPartF ? 0 : (partF.requiredMinimum - totalVentilationLS)
    }
  };
};

/**
 * Get detailed calculation breakdown for display
 */
export const getVentilationBreakdown = (room, project) => {
  const calc = calculateRoomVentilationSAP(room, project);
  
  return `
VENTILATION CALCULATION BREAKDOWN
Room: ${room.name || 'Unnamed'}
Type: ${calc.breakdown.roomType}
Building Category: ${calc.breakdown.category}

Room Volume: ${calc.breakdown.volume} m³
Design Temperature Difference: ${calc.breakdown.tempDiff}°C

Base ACH (CIBSE Table 3.8): ${calc.baseACH} ACH
Infiltration Rate: ${calc.breakdown.infiltrationRate} m³/h

Additional Ventilation:
- Extract Fan: ${calc.breakdown.extractFan}
- Open Fire/Chimney: ${calc.breakdown.openFire}

Total Ventilation Rate: ${calc.breakdown.totalRate} m³/h
Heat Transfer Coefficient (HV): ${calc.breakdown.HV} W/K

VENTILATION HEAT LOSS: ${calc.breakdown.loss} W
  `.trim();
};
