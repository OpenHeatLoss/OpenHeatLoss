// client/src/utils/scopCalculations.js
//
// Heat pump performance estimator using Carnot efficiency model.
//
// Method:
//   1. Fit Carnot efficiency η from EN 14511 test points (η = COP_actual / COP_carnot)
//   2. Derive weather-compensated flow temperature per outdoor bin using LMTD
//      exponent method — building-specific, based on actual W/K and emitter sizing
//   3. Calculate COP per bin: η × COP_carnot(T_outdoor, T_flow_bin)
//   4. Weight by bin hours (UK typical distribution, EN 14825 extended climate)
//   5. Apply defrost penalty (scaled by outdoor temp — more frosting below 5°C)
//   6. DHW SCOP: daily reheat at annual average outdoor temp + weekly pasteurisation

// ---------------------------------------------------------------------------
// UK TEMPERATURE BIN DATA
// ---------------------------------------------------------------------------

// UK_BIN_HOURS — EN 14825:2022 Annex C extended climate, UK representative (Heathrow basis).
// Standardised bin hours used for heat pump seasonal performance testing.
// Total ~3,322h covers the full year; heating bins (below balance point) ~3,000h.
export const UK_BIN_HOURS = [
  { tOut: -7, hours:  1 }, { tOut: -6, hours:  4 }, { tOut: -5, hours: 12 },
  { tOut: -4, hours: 28 }, { tOut: -3, hours: 49 }, { tOut: -2, hours: 76 },
  { tOut: -1, hours:109 }, { tOut:  0, hours:149 }, { tOut:  1, hours:183 },
  { tOut:  2, hours:215 }, { tOut:  3, hours:240 }, { tOut:  4, hours:257 },
  { tOut:  5, hours:264 }, { tOut:  6, hours:261 }, { tOut:  7, hours:248 },
  { tOut:  8, hours:229 }, { tOut:  9, hours:208 }, { tOut: 10, hours:182 },
  { tOut: 11, hours:153 }, { tOut: 12, hours:123 }, { tOut: 13, hours: 95 },
  { tOut: 14, hours: 72 }, { tOut: 15, hours: 52 }, { tOut: 16, hours: 37 },
  { tOut: 17, hours: 26 }, { tOut: 18, hours: 18 }, { tOut: 19, hours: 12 },
  { tOut: 20, hours:  9 }, { tOut: 21, hours:  6 }, { tOut: 22, hours:  4 },
];

const T_ANNUAL_AVG_UK  = 9.0;
const T_COLD_FEED      = 10.0;

// Balance point temperature — outdoor temp below which heating is needed.
// 15.5°C is the EN 12831 design cutoff but overestimates demand because it
// ignores internal gains (people, appliances) and solar gains which typically
// offset 3–5 kW in a occupied dwelling. A balance point of 12.5°C aligns
// well with UK degree-day data and EPC estimates for typical houses.
// Engineers can adjust this if they have specific gains data.
const DEFAULT_BALANCE_POINT = 12.5;

export const EMITTER_EXPONENTS = {
  radiator:       { label: 'Radiators (n=1.3)',          n: 1.3  },
  low_temp_panel: { label: 'Low-temp panel (n=1.25)',    n: 1.25 },
  ufh:            { label: 'Underfloor heating (n=1.1)', n: 1.1  },
  fan_coil:       { label: 'Fan coil (n=1.0)',           n: 1.0  },
};

// ---------------------------------------------------------------------------
// CORE HELPERS
// ---------------------------------------------------------------------------

export function carnotCOP(tAir, tFlow) {
  const tHotK  = tFlow + 273.15;
  const tColdK = tAir  + 273.15;
  if (tHotK <= tColdK) return 1;
  return tHotK / (tHotK - tColdK);
}

export function fitEta(testPoints) {
  if (!testPoints || testPoints.length === 0) return { eta: 0, points: [] };
  const points = testPoints.map(p => {
    const carnot = carnotCOP(p.tAir, p.tFlow);
    const eta    = carnot > 0 ? p.cop / carnot : 0;
    return { ...p, carnot: +carnot.toFixed(3), eta: +eta.toFixed(4) };
  });
  const eta = points.reduce((s, p) => s + p.eta, 0) / points.length;
  return { eta, points };
}

export function estimateCOP(tAir, tFlow, eta) {
  return eta * carnotCOP(tAir, tFlow);
}

function lmtd(tFlow, tReturn, tRoom) {
  const d1 = tFlow  - tRoom;
  const d2 = tReturn - tRoom;
  if (Math.abs(d1 - d2) < 0.01) return d1;
  if (d1 <= 0 || d2 <= 0) return Math.max(d1, d2);
  return (d1 - d2) / Math.log(d1 / d2);
}

export function weatherCompFlowTemp(fraction, tFlowD, tReturnD, tIndoor, n) {
  if (fraction <= 0) return tIndoor + 1;
  const lmtdRated  = lmtd(tFlowD, tReturnD, tIndoor);
  const lmtdTarget = lmtdRated * Math.pow(fraction, 1 / n);
  const deltaT     = tFlowD - tReturnD;
  if (lmtdTarget <= 0) return tIndoor + 1;
  const k = Math.exp(deltaT / lmtdTarget);
  return tIndoor + (deltaT * k) / (k - 1);
}

function defrostFraction(tOut, nominalPct) {
  const nom = nominalPct / 100;
  if (tOut >= 5) return 0;
  if (tOut >= 0) return nom * (1 - tOut / 5);
  return nom * (1 + Math.abs(tOut) / 5);
}

// ---------------------------------------------------------------------------
// SPACE HEATING SCOP
// ---------------------------------------------------------------------------

export function calculateSpaceHeatingScop({
  eta,
  heatLossCoefficient,   // W/K
  avgInternalTemp,
  externalTemp,
  designFlowTemp,
  designReturnTemp,
  emitterN,
  defrostPct,
  balancePoint = DEFAULT_BALANCE_POINT,  // °C — outdoor temp below which heating runs
}) {
  if (!eta || eta <= 0 || !heatLossCoefficient || heatLossCoefficient <= 0) return null;

  // Defensive: ensure all inputs are finite numbers
  const _Ti = isFinite(avgInternalTemp)   ? avgInternalTemp   : 20;
  const _Te = isFinite(externalTemp)       ? externalTemp       : -3;
  const _Tf = isFinite(designFlowTemp)     ? designFlowTemp     : 50;
  const _Tr = isFinite(designReturnTemp)   ? designReturnTemp   : 40;
  const _n  = isFinite(emitterN)           ? emitterN           : 1.3;
  const _dp = isFinite(Number(defrostPct)) ? Number(defrostPct) : 5;
  const _bp = isFinite(balancePoint)       ? balancePoint       : DEFAULT_BALANCE_POINT;

  const designDeltaT = _Ti - _Te;
  if (designDeltaT <= 0) return null;

  const designLoadKw = (heatLossCoefficient * designDeltaT) / 1000;

  const binResults          = [];
  let totalHeatKwh          = 0;
  let totalElecKwh          = 0;
  let totalElecNoDefrostKwh = 0;

  for (const bin of UK_BIN_HOURS) {
    if (bin.tOut >= _bp) continue;

    const binDeltaT = _Ti - bin.tOut;
    const fraction  = Math.min(binDeltaT / designDeltaT, 1);
    if (fraction <= 0) continue;

    const heatKwh = designLoadKw * fraction * bin.hours;
    const tFlow   = weatherCompFlowTemp(fraction, _Tf, _Tr, _Ti, _n);
    const cop     = estimateCOP(bin.tOut, tFlow, eta);
    if (!isFinite(cop) || cop <= 0) continue;

    const elecNoDefrost = heatKwh / cop;
    const dFrac         = defrostFraction(bin.tOut, _dp);
    const heatNet       = heatKwh * (1 - dFrac);
    const elecKwh       = heatNet / cop + (heatKwh - heatNet);

    totalHeatKwh          += heatKwh;
    totalElecKwh          += elecKwh;
    totalElecNoDefrostKwh += elecNoDefrost;

    binResults.push({
      tOut:    bin.tOut,
      hours:   bin.hours,
      fraction: +fraction.toFixed(3),
      tFlow:   +tFlow.toFixed(1),
      cop:     +cop.toFixed(2),
      heatKwh: +heatKwh.toFixed(1),
      elecKwh: +elecKwh.toFixed(1),
      defrost: +(dFrac * 100).toFixed(1),
    });
  }

  if (totalElecKwh <= 0) return null;

  return {
    scop:          +(totalHeatKwh / totalElecKwh).toFixed(2),
    scopNoDefrost: +(totalHeatKwh / totalElecNoDefrostKwh).toFixed(2),
    totalHeatKwh:  +totalHeatKwh.toFixed(0),
    totalElecKwh:  +totalElecKwh.toFixed(0),
    binResults,
  };
}

// ---------------------------------------------------------------------------
// DHW SCOP
// ---------------------------------------------------------------------------

export function calculateDHWScop({
  eta,
  occupants,
  cylinderLitres,
  storeTemp     = 55,
  annualAvgTemp = T_ANNUAL_AVG_UK,
}) {
  if (!eta || eta <= 0 || !occupants || occupants <= 0) return null;

  const RHO_CP = 0.00116; // kWh/(L·K)

  const dailyLitres     = occupants * 45;
  const deltaReheat     = storeTemp - T_COLD_FEED;
  const annualReheatKwh = dailyLitres * deltaReheat * RHO_CP * 365;

  const cylL      = cylinderLitres || 200;
  const deltaPast = 60 - storeTemp;
  const pastKwh   = deltaPast > 0 ? cylL * deltaPast * RHO_CP * 52 : 0;

  const totalDHWHeatKwh = annualReheatKwh + pastKwh;

  const copReheat = estimateCOP(annualAvgTemp, storeTemp + 5, eta);
  const copPast   = estimateCOP(annualAvgTemp, 65, eta);

  const elecReheat   = copReheat > 0 ? annualReheatKwh / copReheat : 0;
  const elecPast     = copPast   > 0 ? pastKwh         / copPast   : 0;
  const totalElecKwh = elecReheat + elecPast;

  if (totalElecKwh <= 0) return null;

  return {
    dhwScop:         +(totalDHWHeatKwh / totalElecKwh).toFixed(2),
    annualReheatKwh: +annualReheatKwh.toFixed(0),
    pastKwh:         +pastKwh.toFixed(0),
    totalDHWHeatKwh: +totalDHWHeatKwh.toFixed(0),
    totalElecKwh:    +totalElecKwh.toFixed(0),
    copReheat:       +copReheat.toFixed(2),
    copPast:         +copPast.toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// WHOLE-SYSTEM SCOP
// ---------------------------------------------------------------------------

export function calculateWholeSystemScop(shResult, dhwResult) {
  if (!shResult) return null;
  const totalHeat = shResult.totalHeatKwh + (dhwResult?.totalDHWHeatKwh ?? 0);
  const totalElec = shResult.totalElecKwh + (dhwResult?.totalElecKwh    ?? 0);
  if (totalElec <= 0) return null;
  return {
    wholeSystemScop: +(totalHeat / totalElec).toFixed(2),
    totalHeatKwh:    +totalHeat.toFixed(0),
    totalElecKwh:    +totalElec.toFixed(0),
  };
}
