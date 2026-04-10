// client/src/utils/pipeMaterialData.js

/**
 * Pipe Material Specifications and Pressure Drop Data
 * Based on CIBSE Guide and Manufacturer Data
 */

export const PIPE_MATERIALS = {
  copper_tableX: {
    name: 'Copper (Table X)',
    description: 'Half-hard copper to BS EN 1057',
    sizes: [
      { nominalSize: '10mm', externalDiameter: 10, internalDiameter: 8.0, wallThickness: 1.0 },
      { nominalSize: '15mm', externalDiameter: 15, internalDiameter: 13.0, wallThickness: 1.0 },
      { nominalSize: '22mm', externalDiameter: 22, internalDiameter: 20.0, wallThickness: 1.0 },
      { nominalSize: '28mm', externalDiameter: 28, internalDiameter: 26.0, wallThickness: 1.0 },
      { nominalSize: '35mm', externalDiameter: 35, internalDiameter: 33.0, wallThickness: 1.0 },
      { nominalSize: '42mm', externalDiameter: 42, internalDiameter: 40.0, wallThickness: 1.0 },
      { nominalSize: '54mm', externalDiameter: 54, internalDiameter: 52.0, wallThickness: 1.0 }
    ],
    maxVelocity: 1.5, // m/s for heating
    roughness: 0.0015 // mm
  },
  
  copper_tableY: {
    name: 'Copper (Table Y)',
    description: 'Thin wall copper to BS EN 1057',
    sizes: [
      { nominalSize: '10mm', externalDiameter: 10, internalDiameter: 8.8, wallThickness: 0.6 },
      { nominalSize: '15mm', externalDiameter: 15, internalDiameter: 13.6, wallThickness: 0.7 },
      { nominalSize: '22mm', externalDiameter: 22, internalDiameter: 20.2, wallThickness: 0.9 },
      { nominalSize: '28mm', externalDiameter: 28, internalDiameter: 26.2, wallThickness: 0.9 },
      { nominalSize: '35mm', externalDiameter: 35, internalDiameter: 33.2, wallThickness: 0.9 },
      { nominalSize: '42mm', externalDiameter: 42, internalDiameter: 40.0, wallThickness: 1.0 },
      { nominalSize: '54mm', externalDiameter: 54, internalDiameter: 51.6, wallThickness: 1.2 }
    ],
    maxVelocity: 1.5,
    roughness: 0.0015
  },
  
  polybutylene: {
    name: 'Polybutylene (Pipelife)',
    description: 'Polybutylene barrier pipe',
    sizes: [
      { nominalSize: '10mm', externalDiameter: 10, internalDiameter: 6.7, wallThickness: 1.65 },
      { nominalSize: '15mm', externalDiameter: 15, internalDiameter: 11.7, wallThickness: 1.65 },
      { nominalSize: '22mm', externalDiameter: 22, internalDiameter: 17.7, wallThickness: 2.15 },
      { nominalSize: '28mm', externalDiameter: 28, internalDiameter: 22.5, wallThickness: 2.75 }
    ],
    maxVelocity: 1.5, // m/s — Pipelife state 1.5 m/s without undue noise; no lower hard limit for hot water
    roughness: 0.0007
  },
  
  mlcp: {
    name: 'MLCP (Multi-Layer Composite)',
    description: 'PEX/AL/PEX multilayer composite pipe',
    sizes: [
      { nominalSize: '16mm', externalDiameter: 16, internalDiameter: 12.0, wallThickness: 2.0 },
      { nominalSize: '20mm', externalDiameter: 20, internalDiameter: 16.0, wallThickness: 2.0 },
      { nominalSize: '26mm', externalDiameter: 26, internalDiameter: 20.0, wallThickness: 3.0 },
      { nominalSize: '32mm', externalDiameter: 32, internalDiameter: 26.0, wallThickness: 3.0 }
    ],
    maxVelocity: 1.2,
    roughness: 0.0007
  },
  
  pex: {
    name: 'PEX (Cross-linked Polyethylene)',
    description: 'PEX barrier pipe',
    sizes: [
      { nominalSize: '16mm', externalDiameter: 16, internalDiameter: 12.0, wallThickness: 2.0 },
      { nominalSize: '20mm', externalDiameter: 20, internalDiameter: 16.0, wallThickness: 2.0 },
      { nominalSize: '25mm', externalDiameter: 25, internalDiameter: 20.4, wallThickness: 2.3 },
      { nominalSize: '32mm', externalDiameter: 32, internalDiameter: 26.0, wallThickness: 3.0 }
    ],
    maxVelocity: 1.0,
    roughness: 0.0007 // Fixed: was 0.007, should be 0.0007mm
  }
};

/**
 * Get water properties at given temperature
 */
function getWaterProperties(temperature) {
  // Water properties at different temperatures
  // Data from engineering handbooks
  const properties = {
    10: { density: 999.7, viscosity: 0.001307 },
    20: { density: 998.2, viscosity: 0.001002 },
    35: { density: 994.0, viscosity: 0.000720 },
    40: { density: 992.2, viscosity: 0.000653 },
    50: { density: 988.0, viscosity: 0.000549 },
    60: { density: 983.2, viscosity: 0.000467 },
    70: { density: 978.0, viscosity: 0.000404 },
    80: { density: 971.8, viscosity: 0.000355 }
  };
  
  // Find closest temperature or interpolate
  const temps = Object.keys(properties).map(Number).sort((a, b) => a - b);
  
  // If exact match
  if (properties[temperature]) {
    return properties[temperature];
  }
  
  // Find bracketing temperatures
  let lowerTemp = temps[0];
  let upperTemp = temps[temps.length - 1];
  
  for (let i = 0; i < temps.length - 1; i++) {
    if (temperature >= temps[i] && temperature <= temps[i + 1]) {
      lowerTemp = temps[i];
      upperTemp = temps[i + 1];
      break;
    }
  }
  
  // Linear interpolation
  const fraction = (temperature - lowerTemp) / (upperTemp - lowerTemp);
  const lowerProps = properties[lowerTemp];
  const upperProps = properties[upperTemp];
  
  return {
    density: lowerProps.density + fraction * (upperProps.density - lowerProps.density),
    viscosity: lowerProps.viscosity + fraction * (upperProps.viscosity - lowerProps.viscosity)
  };
}

/**
 * Calculate pressure drop using Darcy-Weisbach equation
 * ΔP = f × (L/D) × (ρv²/2)
 */
export function calculatePressureDrop(flowRate, diameter, length, material, temperature = 50) {
  // Handle legacy material names
  let materialKey = material;
  if (material === 'mlcp_riifo' || material === 'mlcp_maincor') {
    materialKey = 'mlcp';
  }
  
  // Convert units
  const Q = flowRate / 1000; // l/s to m³/s
  const D = diameter / 1000; // mm to m
  const L = length; // meters
  
  // Calculate velocity (m/s)
  const A = Math.PI * Math.pow(D / 2, 2); // m²
  const v = Q / A;
  
  // Get material properties
  const materialData = PIPE_MATERIALS[materialKey];
  if (!materialData) {
    console.warn(`Unknown material: ${material}, defaulting to copper`);
    materialKey = 'copper_tableX';
  }
  
  const materialInfo = PIPE_MATERIALS[materialKey];
  const roughness = materialInfo.roughness / 1000; // mm to m
  
  // Water properties at given temperature
  const waterProps = getWaterProperties(temperature);
  const density = waterProps.density;
  const viscosity = waterProps.viscosity;
  const kinematicViscosity = viscosity / density; // m²/s
  
  // Reynolds number
  const Re = (v * D) / kinematicViscosity;
  
  // Friction factor using Swamee-Jain equation (explicit approximation of Colebrook-White)
  const epsilon = roughness / D; // Relative roughness
  let f;
  
  if (Re < 2300) {
    // Laminar flow
    f = 64 / Re;
  } else {
    // Turbulent flow - Swamee-Jain equation
    f = 0.25 / Math.pow(Math.log10(epsilon / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2);
  }
  
  // Pressure drop (Pa)
  const pressureDrop = f * (L / D) * (density * Math.pow(v, 2) / 2);
  
  // Convert to kPa
  const pressureDropKPa = pressureDrop / 1000;
  
  return {
    velocity: v,
    reynoldsNumber: Re,
    frictionFactor: f,
    pressureDrop: pressureDropKPa,
    isVelocityOK: v <= materialInfo.maxVelocity,
    maxVelocity: materialInfo.maxVelocity
  };
}

/**
 * Calculate flow rate required for given heat load
 * Q (l/s) = P (kW) / (c × ρ × ΔT)
 * where c = 4.18 kJ/kg·K, ρ = 1 kg/l (approx at 50°C)
 */
export function calculateFlowRate(heatLoad, deltaT = 10) {
  // Q = P / (4.18 × ΔT)
  const flowRate = heatLoad / (4.18 * deltaT);
  return flowRate; // l/s
}

/**
 * Suggest pipe size based on flow rate and material
 */
export function suggestPipeSize(flowRate, material) {
  // Handle legacy material names
  let materialKey = material;
  if (material === 'mlcp_riifo' || material === 'mlcp_maincor') {
    materialKey = 'mlcp'; // Fallback to generic MLCP
  }
  
  const materialData = PIPE_MATERIALS[materialKey];
  
  // Safety check
  if (!materialData) {
    console.warn(`Unknown material: ${material}, defaulting to copper`);
    materialKey = 'copper_tableX';
  }
  
  const materialInfo = PIPE_MATERIALS[materialKey];
  const maxVelocity = materialInfo.maxVelocity;
  
  // Find the smallest pipe that keeps velocity under the limit
  for (const size of materialInfo.sizes) {
    const D = size.internalDiameter / 1000; // mm to m
    const A = Math.PI * Math.pow(D / 2, 2);
    const Q = flowRate / 1000; // l/s to m³/s
    const velocity = Q / A;
    
    if (velocity <= maxVelocity) {
      return {
        size: size.nominalSize,
        velocity: velocity,
        isAcceptable: true
      };
    }
  }
  
  // If no size works, return the largest
  const largestSize = materialInfo.sizes[materialInfo.sizes.length - 1];
  const D = largestSize.internalDiameter / 1000;
  const A = Math.PI * Math.pow(D / 2, 2);
  const Q = flowRate / 1000;
  const velocity = Q / A;
  
  return {
    size: largestSize.nominalSize,
    velocity: velocity,
    isAcceptable: false,
    warning: 'Velocity exceeds maximum - consider parallel pipes'
  };
}

/**
 * Get pipe size details by nominal size and material
 */
export function getPipeSize(nominalSize, material) {
  // Handle legacy material names
  let materialKey = material;
  if (material === 'mlcp_riifo' || material === 'mlcp_maincor') {
    materialKey = 'mlcp';
  }
  
  const materialData = PIPE_MATERIALS[materialKey];
  if (!materialData) {
    console.warn(`Unknown material: ${material}, defaulting to copper`);
    return PIPE_MATERIALS['copper_tableX'].sizes.find(s => s.nominalSize === nominalSize);
  }
  
  return materialData.sizes.find(s => s.nominalSize === nominalSize);
}
