// client/src/utils/sapVentilationData.js

/**
 * SAP 10.2 Age Bands and Default Air Permeability
 * Table 4e from SAP 10.2
 */
export const SAP_AGE_BANDS = {
  'A': { yearRange: 'Pre 1900', defaultQ50: 20 },
  'B': { yearRange: '1900-1929', defaultQ50: 18 },
  'C': { yearRange: '1930-1949', defaultQ50: 16 },
  'D': { yearRange: '1950-1966', defaultQ50: 14 },
  'E': { yearRange: '1967-1975', defaultQ50: 12 },
  'F': { yearRange: '1976-1982', defaultQ50: 10 },
  'G': { yearRange: '1983-1990', defaultQ50: 10 },
  'H': { yearRange: '1991-1995', defaultQ50: 10 },
  'I': { yearRange: '1996-2002', defaultQ50: 10 },
  'J': { yearRange: '2003-2006', defaultQ50: 10 },
  'K': { yearRange: '2007 onwards', defaultQ50: 5 }
};

/**
 * CIBSE Domestic Heating Design Guide - Table 3.8
 * Recommended room design number of air changes per hour
 * 
 * Categories:
 * A: Older existing buildings (pre-2000). Those with several chimneys and/or subject to preservation orders
 * B: Modern buildings (2000 or later) with double glazing and regulatory minimum insulation
 * C: New (or existing) buildings constructed after 2006 and complying with all current building regulations
 * 
 * Notes:
 * * Where mechanical extract ventilation is to be installed in a room and the extract volume exceeds 
 *   the natural infiltration, it is advisable to make due allowance for the air extracted from any connecting room or corridor
 * † Where a room contains an open fire or chimney, due ventilation allowance must be made
 */
export const CIBSE_ROOM_ACH = {
  'living_room': { 
    name: 'Living room', 
    categoryA: 1.5, 
    categoryB: 1.0, 
    categoryC: 0.5,
    hasOpenFire: true // Requires additional allowance if open fire present
  },
  'lounge': { 
    name: 'Lounge/sitting room', 
    categoryA: 1.5, 
    categoryB: 1.0, 
    categoryC: 0.5,
    hasOpenFire: true
  },
  'dining_room': { 
    name: 'Dining room', 
    categoryA: 1.5, 
    categoryB: 1.0, 
    categoryC: 0.5 
  },
  'breakfast_room': { 
    name: 'Breakfast room', 
    categoryA: 1.5, 
    categoryB: 1.0, 
    categoryC: 0.5 
  },
  'family_breakfast': { 
    name: 'Family/breakfast room', 
    categoryA: 2.0, 
    categoryB: 1.5, 
    categoryC: 0.5,
    mechanicalExtract: true
  },
  'kitchen': { 
    name: 'Kitchen', 
    categoryA: 2.0, 
    categoryB: 1.5, 
    categoryC: 0.5,
    mechanicalExtract: true
  },
  'bedroom': { 
    name: 'Bedroom', 
    categoryA: 1.0, 
    categoryB: 1.0, 
    categoryC: 0.5 
  },
  'bedroom_ensuite': { 
    name: 'Bedroom, including en-suite bathroom', 
    categoryA: 2.0, 
    categoryB: 1.5, 
    categoryC: 1.0 
  },
  'bedsitting': { 
    name: 'Bedsitting room', 
    categoryA: 1.5, 
    categoryB: 1.0, 
    categoryC: 0.5 
  },
  'bedroom_study': { 
    name: 'Bedroom/study', 
    categoryA: 1.5, 
    categoryB: 1.5, 
    categoryC: 0.5 
  },
  'study': { 
    name: 'Study', 
    categoryA: 1.5, 
    categoryB: 1.5, 
    categoryC: 0.5 
  },
  'games_room': { 
    name: 'Games room', 
    categoryA: 1.5, 
    categoryB: 1.0, 
    categoryC: 0.5 
  },
  'hall': { 
    name: 'Hall', 
    categoryA: 2.0, 
    categoryB: 1.0, 
    categoryC: 0.5 
  },
  'landing': { 
    name: 'Landing', 
    categoryA: 2.0, 
    categoryB: 1.0, 
    categoryC: 0.5 
  },
  'internal_corridor': { 
    name: 'Internal room or corridor', 
    categoryA: 0.0, 
    categoryB: 0.0, 
    categoryC: 0.0 
  },
  'bathroom': { 
    name: 'Bathroom', 
    categoryA: 3.0, 
    categoryB: 1.5, 
    categoryC: 0.5,
    mechanicalExtract: true
  },
  'shower_room': { 
    name: 'Shower room', 
    categoryA: 3.0, 
    categoryB: 1.5, 
    categoryC: 0.5,
    mechanicalExtract: true
  },
  'cloakroom_wc': { 
    name: 'Cloakroom/WC', 
    categoryA: 2.0, 
    categoryB: 1.5, 
    categoryC: 1.5,
    mechanicalExtract: true
  },
  'toilet': { 
    name: 'Toilet', 
    categoryA: 3.0, 
    categoryB: 1.5, 
    categoryC: 1.5,
    mechanicalExtract: true
  },
  'utility_room': { 
    name: 'Utility room', 
    categoryA: 3.0, 
    categoryB: 2.0, 
    categoryC: 0.5,
    mechanicalExtract: true
  },
  'dressing_room': { 
    name: 'Dressing room', 
    categoryA: 1.5, 
    categoryB: 1.0, 
    categoryC: 0.5 
  },
  'store_room': { 
    name: 'Store room', 
    categoryA: 1.0, 
    categoryB: 0.5, 
    categoryC: 0.5 
  }
};

/**
 * Get room types for dropdown
 */
export const getRoomTypes = () => {
  return Object.keys(CIBSE_ROOM_ACH).map(key => ({
    value: key,
    label: CIBSE_ROOM_ACH[key].name
  }));
};

/**
 * Get ACH for a room type and building category
 */
export const getRoomACH = (roomType, category) => {
  const room = CIBSE_ROOM_ACH[roomType];
  if (!room) return 0.5; // Default fallback
  
  switch(category) {
    case 'A': return room.categoryA;
    case 'B': return room.categoryB;
    case 'C': return room.categoryC;
    default: return room.categoryB; // Default to Category B
  }
};

/**
 * Check if room type typically has mechanical extract
 */
export const requiresMechanicalExtract = (roomType) => {
  const room = CIBSE_ROOM_ACH[roomType];
  return room?.mechanicalExtract || false;
};

/**
 * Check if room type may have open fire/chimney
 */
export const mayHaveOpenFire = (roomType) => {
  const room = CIBSE_ROOM_ACH[roomType];
  return room?.hasOpenFire || false;
};

/**
 * Building categories based on age
 */
export const BUILDING_CATEGORIES = {
  'A': {
    label: 'Category A - Pre-2000 (older buildings)',
    description: 'Older existing buildings (pre-2000). Those with several chimneys and/or subject to preservation orders may require greater infiltration allowance.'
  },
  'B': {
    label: 'Category B - 2000+ (modern buildings)',
    description: 'Modern buildings (2000 or later) with double glazing and regulatory minimum insulation.'
  },
  'C': {
    label: 'Category C - 2006+ (current regulations)',
    description: 'New (or existing) buildings constructed after 2006 and complying with all current building regulations.'
  }
};

/**
 * Part F Minimum Ventilation Requirements
 */
export const PART_F_REQUIREMENTS = {
  minRatePerM2: 0.3, // l/s per m² of internal floor area
  minRateByBedrooms: {
    1: 19, // l/s
    2: 25,
    3: 31,
    4: 37,
    5: 43
    // For each additional bedroom, add 6 l/s
  },
  singleHabitableRoom: 13 // l/s for studio/bedsit
};

/**
 * Calculate Part F minimum ventilation rate
 */
export const calculatePartFMinimum = (totalFloorArea, numBedrooms) => {
  // Requirement a: 0.3 l/s per m²
  const rateByArea = totalFloorArea * PART_F_REQUIREMENTS.minRatePerM2;
  
  // Requirement b: Rate by number of bedrooms
  let rateByBedrooms;
  if (numBedrooms === 0) {
    // Single habitable room (studio)
    rateByBedrooms = PART_F_REQUIREMENTS.singleHabitableRoom;
  } else if (numBedrooms <= 5) {
    rateByBedrooms = PART_F_REQUIREMENTS.minRateByBedrooms[numBedrooms];
  } else {
    // More than 5 bedrooms: add 6 l/s for each additional bedroom
    rateByBedrooms = PART_F_REQUIREMENTS.minRateByBedrooms[5] + 
                     ((numBedrooms - 5) * 6);
  }
  
  return {
    rateByArea,
    rateByBedrooms,
    requiredMinimum: Math.max(rateByArea, rateByBedrooms)
  };
};

/**
 * Shelter factors for infiltration calculation (SAP Table 4d)
 */
export const SHELTER_FACTORS = {
  'very_sheltered': {
    label: 'Very sheltered',
    description: 'City centre, dense housing, sheltered by tall buildings',
    factor: 0.85
  },
  'sheltered': {
    label: 'Sheltered',
    description: 'Urban/suburban, some shielding from neighboring buildings',
    factor: 1.0
  },
  'normal': {
    label: 'Normal',
    description: 'Rural/suburban, open terrain, typical exposure',
    factor: 1.2
  },
  'exposed': {
    label: 'Exposed',
    description: 'Rural, open countryside, coastal areas',
    factor: 1.5
  }
};

/**
 * Dwelling types for default air permeability
 */
export const DWELLING_TYPES = {
  'detached': {
    label: 'Detached house',
    description: 'Stand-alone house with all sides exposed'
  },
  'semi_detached': {
    label: 'Semi-detached house',
    description: 'House attached to one other dwelling'
  },
  'end_terrace': {
    label: 'End terrace house',
    description: 'House at end of terrace row'
  },
  'mid_terrace': {
    label: 'Mid terrace house',
    description: 'House in middle of terrace row'
  },
  'flat': {
    label: 'Flat/apartment',
    description: 'Apartment within a larger building'
  }
};

/**
 * Ventilation system types
 */
export const VENTILATION_SYSTEM_TYPES = {
  'natural': {
    label: 'Natural ventilation',
    description: 'Windows, trickle vents, passive ventilation'
  },
  'intermittent_extract': {
    label: 'Intermittent extract fans',
    description: 'Extract fans in wet rooms (kitchen, bathroom), manually or humidity controlled'
  },
  'continuous_extract': {
    label: 'Continuous extract (MEV/dMEV)',
    description: 'Continuous mechanical extract ventilation'
  },
  'mvhr': {
    label: 'MVHR (Mechanical Ventilation with Heat Recovery)',
    description: 'Balanced ventilation with heat recovery from extract air'
  },
  'piv': {
    label: 'PIV (Positive Input Ventilation)',
    description: 'Continuously supplies filtered fresh air from loft'
  }
};
