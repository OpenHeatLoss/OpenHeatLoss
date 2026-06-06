// client/src/utils/pipeMaterialData.js
//
// Pipe material specifications and pressure drop calculations.
// Based on CIBSE Guide C (Section 4) and manufacturer data.
//
// ─── KEY RULES ───────────────────────────────────────────────────────────────
//
// 1. PIPE_MATERIALS is the authoritative source of velocity limits and pipe
//    dimensions. Never hardcode velocity limits elsewhere in the codebase —
//    always read from PIPE_MATERIALS[key].maxVelocity or from the result of
//    calculatePressureDrop().
//
// 2. isVelocityOK and maxVelocity from calculatePressureDrop() are derived at
//    call time and must NOT be stored in the database or React state. If stored
//    values are needed for display, re-derive them live from the stored material
//    key and velocity. This avoids stale values when velocity limits change.
//
// 3. Legacy material keys 'mlcp_riifo' and 'mlcp_maincor' are remapped to
//    'mlcp' inside calculatePressureDrop() and suggestPipeSize(). New code
//    should use 'mlcp' directly.
//
// 4. calculateFlowRate() uses a simplified specific heat × density product
//    (4.18 kJ/kg·K × 1 kg/l). This is accurate to ~1% for 40–60°C system
//    temperatures. Always pass the design ΔT explicitly — do not rely on the
//    default 10K.

/**
 * Pipe material specifications.
 * Keys: 'copper_tableX' | 'copper_tableY' | 'polybutylene' | 'mlcp' | 'pex'
 *
 * Each entry contains:
 *   sizes[].nominalSize      — display label (e.g. '22mm')
 *   sizes[].internalDiameter — in mm (used for velocity and pressure drop)
 *   maxVelocity              — m/s limit for heating systems
 *   roughness                — mm (used in Colebrook-White/Swamee-Jain friction factor)
 *
 * Velocity limits:
 *   Copper:        1.5 m/s — noise threshold for heating systems
 *   Polybutylene:  1.5 m/s — Pipelife recommendation; no lower hard limit for hot water
 *   MLCP:          1.2 m/s — manufacturer conservative limit
 *   PEX:           1.0 m/s — erosion/noise limit
 */
export const PIPE_MATERIALS = {
  copper_tableX: {
    name: 'Copper (Table X)',
    description: 'Half-hard copper to BS EN 1057',
    sizes: [
      { nominalSize: '10mm', externalDiameter: 10, internalDiameter: 8.0,  wallThickness: 1.0 },
      { nominalSize: '15mm', externalDiameter: 15, internalDiameter: 13.0, wallThickness: 1.0 },
      { nominalSize: '22mm', externalDiameter: 22, internalDiameter: 20.0, wallThickness: 1.0 },
      { nominalSize: '28mm', externalDiameter: 28, internalDiameter: 26.0, wallThickness: 1.0 },
      { nominalSize: '35mm', externalDiameter: 35, internalDiameter: 33.0, wallThickness: 1.0 },
      { nominalSize: '42mm', externalDiameter: 42, internalDiameter: 40.0, wallThickness: 1.0 },
      { nominalSize: '54mm', externalDiameter: 54, internalDiameter: 52.0, wallThickness: 1.0 },
    ],
    maxVelocity: 1.5,   // m/s
    roughness:   0.0015 // mm
  },

  copper_tableY: {
    name: 'Copper (Table Y)',
    description: 'Thin wall copper to BS EN 1057',
    sizes: [
      { nominalSize: '10mm', externalDiameter: 10, internalDiameter: 8.8,  wallThickness: 0.6 },
      { nominalSize: '15mm', externalDiameter: 15, internalDiameter: 13.6, wallThickness: 0.7 },
      { nominalSize: '22mm', externalDiameter: 22, internalDiameter: 20.2, wallThickness: 0.9 },
      { nominalSize: '28mm', externalDiameter: 28, internalDiameter: 26.2, wallThickness: 0.9 },
      { nominalSize: '35mm', externalDiameter: 35, internalDiameter: 33.2, wallThickness: 0.9 },
      { nominalSize: '42mm', externalDiameter: 42, internalDiameter: 40.0, wallThickness: 1.0 },
      { nominalSize: '54mm', externalDiameter: 54, internalDiameter: 51.6, wallThickness: 1.2 },
    ],
    maxVelocity: 1.5,
    roughness:   0.0015
  },

  polybutylene: {
    name: 'Polybutylene (Pipelife)',
    description: 'Polybutylene barrier pipe',
    sizes: [
      { nominalSize: '10mm', externalDiameter: 10, internalDiameter: 6.7,  wallThickness: 1.65 },
      { nominalSize: '15mm', externalDiameter: 15, internalDiameter: 11.7, wallThickness: 1.65 },
      { nominalSize: '22mm', externalDiameter: 22, internalDiameter: 17.7, wallThickness: 2.15 },
      { nominalSize: '28mm', externalDiameter: 28, internalDiameter: 22.5, wallThickness: 2.75 },
    ],
    maxVelocity: 1.5,   // Pipelife state 1.5 m/s without undue noise
    roughness:   0.0007
  },

  mlcp: {
    name: 'MLCP (Multi-Layer Composite)',
    description: 'PEX/AL/PEX multilayer composite pipe',
    sizes: [
      { nominalSize: '16mm', externalDiameter: 16, internalDiameter: 12.0, wallThickness: 2.0 },
      { nominalSize: '20mm', externalDiameter: 20, internalDiameter: 16.0, wallThickness: 2.0 },
      { nominalSize: '26mm', externalDiameter: 26, internalDiameter: 20.0, wallThickness: 3.0 },
      { nominalSize: '32mm', externalDiameter: 32, internalDiameter: 26.0, wallThickness: 3.0 },
    ],
    maxVelocity: 1.2,
    roughness:   0.0007
  },

  pex: {
    name: 'PEX (Cross-linked Polyethylene)',
    description: 'PEX barrier pipe',
    sizes: [
      { nominalSize: '16mm', externalDiameter: 16, internalDiameter: 12.0, wallThickness: 2.0 },
      { nominalSize: '20mm', externalDiameter: 20, internalDiameter: 16.0, wallThickness: 2.0 },
      { nominalSize: '25mm', externalDiameter: 25, internalDiameter: 20.4, wallThickness: 2.3 },
      { nominalSize: '32mm', externalDiameter: 32, internalDiameter: 26.0, wallThickness: 3.0 },
    ],
    maxVelocity: 1.0,   // Erosion/noise limit
    roughness:   0.0007 // Note: was incorrectly 0.007 in early versions
  }
};

/**
 * Interpolate water density and dynamic viscosity at a given temperature.
 * Data from engineering handbooks; linear interpolation between tabulated points.
 * Valid range: 10–80°C. Values outside range clamp to nearest table entry.
 *
 * @param {number} temperature - °C
 * @returns {{ density: number, viscosity: number }} density in kg/m³, viscosity in Pa·s
 */
function getWaterProperties(temperature) {
  const properties = {
    10: { density: 999.7, viscosity: 0.001307 },
    20: { density: 998.2, viscosity: 0.001002 },
    35: { density: 994.0, viscosity: 0.000720 },
    40: { density: 992.2, viscosity: 0.000653 },
    50: { density: 988.0, viscosity: 0.000549 },
    60: { density: 983.2, viscosity: 0.000467 },
    70: { density: 978.0, viscosity: 0.000404 },
    80: { density: 971.8, viscosity: 0.000355 },
  };

  const temps = Object.keys(properties).map(Number).sort((a, b) => a - b);
  if (properties[temperature]) return properties[temperature];

  let lowerTemp = temps[0];
  let upperTemp = temps[temps.length - 1];
  for (let i = 0; i < temps.length - 1; i++) {
    if (temperature >= temps[i] && temperature <= temps[i + 1]) {
      lowerTemp = temps[i];
      upperTemp = temps[i + 1];
      break;
    }
  }

  const fraction    = (temperature - lowerTemp) / (upperTemp - lowerTemp);
  const lowerProps  = properties[lowerTemp];
  const upperProps  = properties[upperTemp];
  return {
    density:   lowerProps.density   + fraction * (upperProps.density   - lowerProps.density),
    viscosity: lowerProps.viscosity + fraction * (upperProps.viscosity - lowerProps.viscosity),
  };
}

/**
 * Calculate pressure drop for a straight pipe section using Darcy-Weisbach.
 *
 * ΔP = f × (L/D) × (ρv²/2)
 *
 * Friction factor f: Hagen-Poiseuille for laminar flow (Re < 2300),
 * Swamee-Jain explicit approximation of Colebrook-White for turbulent flow.
 * Water properties interpolated from table at the given temperature.
 *
 * ⚠ Do NOT store isVelocityOK or maxVelocity from this result — re-derive
 * them live. Stored values become stale if material velocity limits change.
 *
 * @param {number} flowRate    - l/s
 * @param {number} diameter    - internal diameter in mm
 * @param {number} length      - pipe length in m
 * @param {string} material    - PIPE_MATERIALS key (e.g. 'copper_tableX')
 * @param {number} temperature - mean water temperature in °C (default 50°C)
 * @returns {{
 *   velocity: number,        // m/s
 *   reynoldsNumber: number,
 *   frictionFactor: number,
 *   pressureDrop: number,    // kPa
 *   isVelocityOK: boolean,   // velocity ≤ material maxVelocity — do not store
 *   maxVelocity: number      // m/s from PIPE_MATERIALS — do not store
 * }}
 */
export function calculatePressureDrop(flowRate, diameter, length, material, temperature = 50) {
  // Remap legacy material keys
  let materialKey = material;
  if (material === 'mlcp_riifo' || material === 'mlcp_maincor') materialKey = 'mlcp';

  const Q = flowRate / 1000;  // l/s → m³/s
  const D = diameter / 1000;  // mm → m
  const A = Math.PI * Math.pow(D / 2, 2);
  const v = Q / A;            // velocity in m/s

  if (!PIPE_MATERIALS[materialKey]) {
    console.warn(`Unknown material: ${material}, defaulting to copper_tableX`);
    materialKey = 'copper_tableX';
  }
  const materialInfo    = PIPE_MATERIALS[materialKey];
  const roughness       = materialInfo.roughness / 1000;  // mm → m
  const waterProps      = getWaterProperties(temperature);
  const density         = waterProps.density;
  const kinematicVisc   = waterProps.viscosity / density; // m²/s
  const Re              = (v * D) / kinematicVisc;
  const epsilon         = roughness / D;

  // Friction factor
  const f = Re < 2300
    ? 64 / Re  // Laminar: Hagen-Poiseuille
    : 0.25 / Math.pow(Math.log10(epsilon / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2); // Swamee-Jain

  const pressureDropPa  = f * (length / D) * (density * Math.pow(v, 2) / 2);
  const pressureDropKPa = pressureDropPa / 1000;

  return {
    velocity:       v,
    reynoldsNumber: Re,
    frictionFactor: f,
    pressureDrop:   pressureDropKPa,
    isVelocityOK:   v <= materialInfo.maxVelocity,  // ⚠ do not store
    maxVelocity:    materialInfo.maxVelocity,        // ⚠ do not store
  };
}

/**
 * Calculate volumetric flow rate required for a given heat load and temperature difference.
 *
 * Q (l/s) = P (kW) / (4.18 kJ/kg·K × ΔT)
 *
 * Uses simplified specific heat × density product (accurate to ~1% at 40–60°C).
 * Always pass the design ΔT explicitly — do not rely on the 10K default.
 *
 * Typical calls:
 *   useWholeProperty section: calculateFlowRate(project.heatPumpRatedOutput, designDeltaT)
 *   Room-connected section:   calculateFlowRate(calculateRoomTotal(room, project) / 1000, designDeltaT)
 *
 * @param {number} heatLoad - heat load in kW
 * @param {number} deltaT   - system temperature difference in K (flow temp − return temp)
 * @returns {number} Flow rate in l/s
 */
export function calculateFlowRate(heatLoad, deltaT = 10) {
  return heatLoad / (4.18 * deltaT);
}

/**
 * Suggest the smallest acceptable pipe size for a given flow rate and material.
 * Returns the smallest size where velocity ≤ material maxVelocity.
 * If no size is acceptable, returns the largest available size with isAcceptable: false.
 *
 * Legacy keys 'mlcp_riifo' and 'mlcp_maincor' are remapped to 'mlcp'.
 *
 * @param {number} flowRate - l/s
 * @param {string} material - PIPE_MATERIALS key
 * @returns {{ size: string, velocity: number, isAcceptable: boolean, warning?: string }}
 */
export function suggestPipeSize(flowRate, material) {
  let materialKey = material;
  if (material === 'mlcp_riifo' || material === 'mlcp_maincor') materialKey = 'mlcp';
  if (!PIPE_MATERIALS[materialKey]) {
    console.warn(`Unknown material: ${material}, defaulting to copper_tableX`);
    materialKey = 'copper_tableX';
  }

  const materialInfo = PIPE_MATERIALS[materialKey];
  const Q            = flowRate / 1000; // l/s → m³/s

  for (const size of materialInfo.sizes) {
    const D        = size.internalDiameter / 1000;
    const A        = Math.PI * Math.pow(D / 2, 2);
    const velocity = Q / A;
    if (velocity <= materialInfo.maxVelocity) {
      return { size: size.nominalSize, velocity, isAcceptable: true };
    }
  }

  // No acceptable size — return largest with warning
  const largest  = materialInfo.sizes[materialInfo.sizes.length - 1];
  const D        = largest.internalDiameter / 1000;
  const A        = Math.PI * Math.pow(D / 2, 2);
  const velocity = Q / A;
  return {
    size:         largest.nominalSize,
    velocity,
    isAcceptable: false,
    warning:      'Velocity exceeds maximum — consider parallel pipes or larger material range',
  };
}

/**
 * Look up pipe size details by nominal size string and material key.
 * Returns undefined if the size is not found for the given material.
 * Legacy material keys are remapped to 'mlcp'.
 *
 * @param {string} nominalSize - e.g. '22mm'
 * @param {string} material    - PIPE_MATERIALS key
 * @returns {Object|undefined} Size entry from PIPE_MATERIALS[material].sizes
 */
export function getPipeSize(nominalSize, material) {
  let materialKey = material;
  if (material === 'mlcp_riifo' || material === 'mlcp_maincor') materialKey = 'mlcp';
  if (!PIPE_MATERIALS[materialKey]) {
    console.warn(`Unknown material: ${material}, defaulting to copper_tableX`);
    return PIPE_MATERIALS['copper_tableX'].sizes.find(s => s.nominalSize === nominalSize);
  }
  return PIPE_MATERIALS[materialKey].sizes.find(s => s.nominalSize === nominalSize);
}
