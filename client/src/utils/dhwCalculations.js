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

// ---------------------------------------------------------------------------
// Cylinder recovery (MIS 3005-D 5.9.2(e) "recovery rate", 5.6.4 reheat time)
//
// Datasheet heat-up times are published for a 15 → 50 °C heat-up, but often
// at a primary power far above a domestic heat pump (e.g. a 208 L cylinder in
// 17.7 min implies ~29 kW). So the time a heat pump can actually achieve is
// bounded by energy: t_min = V·c·ΔT / P. This is a LOWER bound — it ignores
// coil transfer limits, stratification and standing losses — so the governing
// recovery time is the longer of this and the datasheet figure.
// ---------------------------------------------------------------------------
export const HEATUP_FROM_C = 15;
export const HEATUP_TO_C   = 50;
const KWH_PER_LITRE_K = 4.18 / 3600;   // water, ρ ≈ 1 kg/L

const positive = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

export function heatupEnergyKwh(litres, fromC = HEATUP_FROM_C, toC = HEATUP_TO_C) {
  const l = positive(litres);
  return l && toC > fromC ? l * KWH_PER_LITRE_K * (toC - fromC) : null;
}

// Shortest possible heat-up (minutes) for a given heat pump output.
export function minReheatMinutes({ litres, outputKw, fromC, toC } = {}) {
  const e = heatupEnergyKwh(litres, fromC, toC);
  const p = positive(outputKw);
  return e && p ? (60 * e) / p : null;
}

// Mean power (kW) a published heat-up time implies.
export function impliedHeatupPowerKw({ litres, minutes, fromC, toC } = {}) {
  const e = heatupEnergyKwh(litres, fromC, toC);
  const t = positive(minutes);
  return e && t ? e / (t / 60) : null;
}

// Combines the datasheet figure and the heat-pump limit.
//   governingMin  — the recovery time to state (longer of the two available)
//   governedBy    — 'datasheet' | 'heat_pump' | null
//   datasheetAchievable — false when the datasheet time needs more power than
//                   the heat pump has; null when it can't be judged
//   recoveryLph   — litres heated 15 → 50 °C per hour at the governing time
export function recoveryAssessment({ litres, datasheetMin, hpOutputKw } = {}) {
  const l  = positive(litres);
  const ds = positive(datasheetMin);
  const hpLimitedMin = minReheatMinutes({ litres: l, outputKw: hpOutputKw });
  const impliedKw    = impliedHeatupPowerKw({ litres: l, minutes: ds });
  const hp           = positive(hpOutputKw);

  let governingMin = null;
  let governedBy   = null;
  if (ds != null && hpLimitedMin != null) {
    governingMin = Math.max(ds, hpLimitedMin);
    governedBy   = ds >= hpLimitedMin ? 'datasheet' : 'heat_pump';
  } else if (ds != null) {
    governingMin = ds;           governedBy = 'datasheet';
  } else if (hpLimitedMin != null) {
    governingMin = hpLimitedMin; governedBy = 'heat_pump';
  }

  return {
    hpLimitedMin,
    impliedKw,
    governingMin,
    governedBy,
    datasheetAchievable: impliedKw != null && hp != null ? impliedKw <= hp : null,
    recoveryLph: l && governingMin ? l / (governingMin / 60) : null,
  };
}

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
