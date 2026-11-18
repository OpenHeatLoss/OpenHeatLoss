// client/src/utils/dhwCalculations.js
//
// Domestic hot water design calculations — single source for every screen,
// PDF and estimator that needs them (MCS031, Summary SCOP, heat loss PDF).
//
// Daily hot water demand — MIS 3005-D V3.0 clause 5.6.2 (domestic buildings):
//   Vd,average = 45 × N
//   N = the greater of (number of bedrooms + 1) or (number of known occupants)
//
// This is the DAILY DEMAND, not the cylinder volume. The cylinder is selected
// from this demand together with the heat pump capacity (5.6.3, MGD 007).

export const DHW_LITRES_PER_N = 45;

const toCount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

// Returns { litres, n, basis } or null when neither bedrooms nor occupants
// has been entered. basis is 'occupants' when occupants set N, else 'bedrooms'.
export function dailyHotWaterDemand({ bedrooms, occupants } = {}) {
  const b = toCount(bedrooms);
  const o = toCount(occupants);
  if (b === 0 && o === 0) return null;
  const n = Math.max(b + 1, o);
  return {
    litres: DHW_LITRES_PER_N * n,
    n,
    basis: o > b + 1 ? 'occupants' : 'bedrooms',
  };
}
