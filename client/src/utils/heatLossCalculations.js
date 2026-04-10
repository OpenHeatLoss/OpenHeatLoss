// client/src/utils/heatLossCalculations.js

/**
 * Import the existing calculation functions that are used throughout the app
 */
import { calculateTransmissionLoss, calculateVentilationLoss as calculateVentLoss } from './calculations';

/**
 * Calculate total heat loss for a room from its elements and ventilation
 * Uses the same calculation functions as the Rooms tab and Radiator Sizing
 * Returns value in kW
 */
export function calculateRoomHeatLoss(room, project) {
  if (!room) return 0;
  
  const externalTemp = project?.externalTemp || -3;
  const airDensity = project?.airDensity || 1.2;
  const specificHeat = project?.specificHeat || 0.34;
  
  // Use existing calculation functions (these return Watts)
  const transmissionLoss = calculateTransmissionLoss(room, externalTemp);
  const ventilationLoss = calculateVentLoss(room, externalTemp, airDensity, specificHeat);
  
  // Total in Watts, convert to kW
  const totalLossWatts = transmissionLoss + ventilationLoss;
  return totalLossWatts / 1000; // Convert W to kW
}

/**
 * Calculate fabric heat loss only (excluding ventilation)
 * Returns value in kW
 */
export function calculateFabricLoss(room, project) {
  if (!room) return 0;
  
  const externalTemp = project?.externalTemp || -3;
  
  // Use existing transmission loss calculation (returns Watts)
  const transmissionLoss = calculateTransmissionLoss(room, externalTemp);
  
  return transmissionLoss / 1000; // Convert W to kW
}

/**
 * Calculate ventilation heat loss only
 * Returns value in kW
 */
export function calculateVentilationLoss(room, project) {
  if (!room) return 0;
  
  const externalTemp = project?.externalTemp || -3;
  const airDensity = project?.airDensity || 1.2;
  const specificHeat = project?.specificHeat || 0.34;
  
  // Use existing ventilation loss calculation (returns Watts)
  const ventilationLossWatts = calculateVentLoss(room, externalTemp, airDensity, specificHeat);
  
  return ventilationLossWatts / 1000; // Convert W to kW
}

/**
 * Calculate total building heat loss
 */
export function calculateTotalHeatLoss(rooms, project) {
  if (!rooms || !Array.isArray(rooms)) return 0;
  
  return rooms.reduce((sum, room) => {
    return sum + calculateRoomHeatLoss(room, project);
  }, 0);
}

/**
 * Calculate heat loss per square meter
 */
export function calculateHeatLossPerM2(heatLoss, floorArea) {
  if (!floorArea || floorArea === 0) return 0;
  return (heatLoss / floorArea) * 1000; // Convert kW to W
}
