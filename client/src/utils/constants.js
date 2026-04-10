// client/src/utils/constants.js

export const ELEMENT_TYPES = [
  'External Wall',
  'Internal Wall',
  'Party Wall',
  'Window',
  'Door',
  'Ceiling',
  'Roof',
  'Floor',
  'Ground Floor (Slab)',
  'Ground Floor (Suspended)',
  
];

export const SUBTRACTABLE_ELEMENT_TYPES = ['Window', 'Door'];

export const PARENT_ELEMENT_TYPES = ['External Wall', 'Internal Wall', 'Party Wall', 'Ceiling', 'Roof'];

export const EMITTER_TYPES = [
  'None',
  'Radiator',
  'UFH',
  'Fan Coil'
];

export const RADIATOR_CONNECTION_TYPES = [
  'TBOE', // Top Bottom Opposite Ends
  'BOE',  // Bottom Opposite Ends
  'TBSE', // Top Bottom Same End
  'BSE',  // Bottom Same End
  'TBM',  // Top Bottom Middle
  'BM'    // Bottom Middle
];

export const CONNECTION_TYPE_CORRECTIONS = {
  'TBOE': 1.00,  // Standard - no correction
  'BOE': 0.95,   // Typical 5% reduction
  'TBSE': 1.00,  // Typical 10% reduction
  'BSE': 0.85,   // Typical 15% reduction
  'TBM': 0.92,   // Typical 8% reduction
  'BM': 0.88     // Typical 12% reduction
};

export const DEFAULT_PROJECT = {
  name: 'New Project',
  location: '',
  designer: '',
  externalTemp: -3,
  annualAvgTemp: 9,
  airDensity: 1.2,
  specificHeat: 0.34
};

export const DEFAULT_ROOM = {
  name: 'New Room',
  internalTemp: 21,
  volume: 0,
  floorArea: 0,
  roomLength: 0,
  roomWidth: 0,
  roomHeight: 0,
  ventilation: {
    minAirFlow: 0,
    infiltrationRate: 0.5,
    mechanicalSupply: 0,
    mechanicalExtract: 0
  }
};

export const DEFAULT_ELEMENT = {
  elementType: 'External Wall',
  description: '',
  length: 0,
  height: 0,
  area: 0,
  uValue: 0,
  tempFactor: 1.0,
  customDeltaT: null,
  subtractFromElementId: null
};

export const VENTILATION_HELP_TEXT = `Ventilation Inputs:

• Min Air Flow: Minimum required ventilation rate (e.g., from Building Regulations Part F)
• Infiltration (ACH): Air changes per hour due to air leakage through building fabric
• Mech Supply: Mechanical ventilation supply air flow rate
• Mech Extract: Mechanical extraction air flow rate

The calculator uses the greater of minimum air flow or (infiltration + mechanical supply) for heat loss calculations.`;