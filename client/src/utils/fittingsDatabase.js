// client/src/utils/fittingsDatabase.js

/**
 * Fittings Database with K-values (resistance coefficients)
 * Based on CIBSE Guide C and standard engineering references
 */

export const FITTINGS_DATABASE = {
  elbow_90: {
    name: '90° Elbow',
    kValue: 0.9,
    description: 'Standard 90° bend'
  },
  elbow_45: {
    name: '45° Elbow',
    kValue: 0.4,
    description: 'Standard 45° bend'
  },
  tee_through: {
    name: 'Tee (Straight Through)',
    kValue: 0.6,
    description: 'Flow straight through tee junction'
  },
  tee_branch: {
    name: 'Tee (Branch)',
    kValue: 1.8,
    description: 'Flow through branch of tee'
  },
  gate_valve: {
    name: 'Gate Valve (Fully Open)',
    kValue: 0.2,
    description: 'Fully open gate valve'
  },
  ball_valve: {
    name: 'Ball Valve (Fully Open)',
    kValue: 0.05,
    description: 'Fully open ball valve'
  },
  check_valve: {
    name: 'Check Valve',
    kValue: 2.0,
    description: 'Spring-loaded check valve'
  },
  reducer: {
    name: 'Reducer',
    kValue: 0.5,
    description: 'Gradual reducer'
  },
  coupling: {
    name: 'Coupling',
    kValue: 0.08,
    description: 'Straight coupling'
  },
  radiator_valve_trv: {
    name: 'TRV (Thermostatic Radiator Valve)',
    kValue: 1.7,
    description: 'TRV fully open'
  },
  radiator_valve_lockshield: {
    name: 'Lockshield Valve',
    kValue: 0.5,
    description: 'Lockshield valve fully open'
  },
  manifold_port: {
    name: 'Manifold Port',
    kValue: 1.2,
    description: 'Single manifold outlet'
  },
  y_strainer: {
    name: 'Y-Strainer',
    kValue: 1.5,
    description: 'Clean Y-strainer'
  }
};

/**
 * Calculate pressure drop from fittings
 * ΔP = K × (ρv²/2)
 */
export function calculateFittingsPressureDrop(velocity, fittings, density = 988) {
  // Sum up K-values
  const totalK = fittings.reduce((sum, fitting) => {
    const fittingData = FITTINGS_DATABASE[fitting.type];
    return sum + (fittingData.kValue * fitting.quantity);
  }, 0);
  
  // Calculate pressure drop (Pa)
  const pressureDrop = totalK * (density * Math.pow(velocity, 2) / 2);
  
  // Convert to kPa
  return pressureDrop / 1000;
}

/**
 * Calculate pressure drop using percentage allowance method
 * This is simpler but less accurate
 */
export function calculateFittingsAllowance(straightPipePressureDrop, percentage) {
  return straightPipePressureDrop * (percentage / 100);
}

/**
 * Get all fitting types for dropdown
 */
export function getAllFittingTypes() {
  return Object.keys(FITTINGS_DATABASE).map(key => ({
    id: key,
    name: FITTINGS_DATABASE[key].name,
    kValue: FITTINGS_DATABASE[key].kValue
  }));
}

/**
 * Estimate typical fittings for a circuit section
 * This can be used as a starting point
 */
export function estimateTypicalFittings(length, sectionType) {
  const fittings = [];
  
  switch (sectionType) {
    case 'main_flow':
      // Main flow pipe from heat source to manifold
      fittings.push(
        { type: 'elbow_90', quantity: Math.ceil(length / 5) }, // One elbow per 5m
        { type: 'tee_through', quantity: Math.ceil(length / 10) }, // One tee per 10m
        { type: 'ball_valve', quantity: 1 }
      );
      break;
      
    case 'branch':
      // Branch to room/radiator
      fittings.push(
        { type: 'elbow_90', quantity: Math.ceil(length / 3) },
        { type: 'radiator_valve_trv', quantity: 1 },
        { type: 'radiator_valve_lockshield', quantity: 1 }
      );
      break;
      
    case 'ufh':
      // Underfloor heating circuit
      fittings.push(
        { type: 'manifold_port', quantity: 2 }, // Flow and return
        { type: 'elbow_90', quantity: 2 }
      );
      break;
      
    default:
      // Generic estimate
      fittings.push(
        { type: 'elbow_90', quantity: Math.ceil(length / 4) }
      );
  }
  
  return fittings;
}
