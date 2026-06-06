# OpenHeatLoss — Calculation Reference

Last updated: June 2026  
Standards: BS EN 12831-1:2017, CIBSE DHDG 2026, CIBSE Guide C

This document is the authoritative reference for which calculation function to call
for which purpose. It exists because several functions have similar names but return
different load types — using the wrong one is a common source of bugs.

---

## The three load types

Understanding these three figures is essential before calling any calculation function.

| Load type | Definition | Used for |
|-----------|-----------|----------|
| **Emitter load** | Fabric loss + ventilation emitter loss (×2 orientation factor on leakage) | Radiator/emitter sizing, pipe sizing, system flow rate |
| **Generator load** | Fabric loss + ventilation generator loss (×1 orientation factor on leakage) | Heat pump output selection, W/K coefficient, MCS 031 |
| **Typical load** | Fabric loss at Te,ref + ventilation typical loss | Modulation check, oversizing verification (MCS 5.7.2) |

The emitter load is **always higher** than the generator load for naturally ventilated
buildings because the orientation factor (×2) on the ventilation leakage term accounts
for worst-case wind direction. This is per CIBSE DHDG 2026 section 2.5.4.4 and the
EN 12831-1 fi-z factor.

**Do not confuse generator load with heat pump rated output.** Generator load is the
calculated design heat loss of the building. Heat pump rated output is the selected
product's catalogue figure, which should be ≥ generator load.

---

## Quick reference — which function to call

| Purpose | Function | File | Returns |
|---------|----------|------|---------|
| Room emitter load (W) | `calculateRoomTotal(room, project)` | calculations.js | Emitter load in W |
| Room generator load (W) | `calculateTransmissionLoss(room, externalTemp)` + `ventGeneratorDesign` from `calculateRoomVentilationEN12831` | calculations.js + en12831Calculations.js | Generator load in W |
| Room typical load (W) | `calculateTransmissionLoss(room, referenceTemp)` + `ventGeneratorTypical` | calculations.js + en12831Calculations.js | Typical load in W |
| Building emitter total (W) | `calculateBuildingTotal(rooms, project)` | calculations.js | Sum of room emitter loads |
| All three ventilation figures | `calculateRoomVentilationEN12831(room, project)` | en12831Calculations.js | `{ ventEmitter, ventGeneratorDesign, ventGeneratorTypical }` |
| Building ventilation summary | `calculateBuildingVentilationEN12831(rooms, project)` | en12831Calculations.js | Totals + per-room breakdown + warnings |
| Pipe section flow rate (l/s) | `calculateFlowRate(heatLoad, deltaT)` | pipeMaterialData.js | Flow rate in l/s |
| Pipe pressure drop | `calculatePressureDrop(flowRate, diameter, length, material, temperature)` | pipeMaterialData.js | `{ velocity, pressureDrop, isVelocityOK, ... }` |
| Suggest pipe size | `suggestPipeSize(flowRate, material)` | pipeMaterialData.js | `{ size, velocity, isAcceptable }` |
| q50 from SAP inputs | `estimateQ50SAP(params)` | en12831Calculations.js | `{ q50, breakdown }` |
| Effective q50 for project | `resolveQ50(project)` | en12831Calculations.js | q50 in m³/(h·m²) |

---

## calculations.js

### `calculateTransmissionLoss(room, externalTemp)` → W
Fabric heat loss only. No ventilation component.

Pass `project.externalTemp` for design loss, `project.referenceTemp` for typical loss.
The function is temperature-agnostic — it is the caller's responsibility to pass
the correct temperature for the intended output.

**Field requirements on room:** `elements` array with camelCase fields (`uValue`,
`customDeltaT`, `subtractFromElementId`, `tempFactor`, `area`), `internalTemp`,
`thermalBridgingAddition`.

### `calculateVentilationLoss(room, externalTemp, airDensity, specificHeat, project)` → W
Returns **emitter ventilation loss** (`ventEmitter`) when `project.ventilationMethod`
is `'en12831_cibse2026'`. This is the emitter-sizing ventilation figure with the ×2
orientation factor applied. It does **not** return generator ventilation loss.

To get all three ventilation figures, call `calculateRoomVentilationEN12831` directly.

### `calculateRoomTotal(room, project)` → W  ⚠ Returns EMITTER load
**This is the most commonly used function. Read this entry carefully.**

Returns: `fabric loss at design temp` + `ventEmitter`  
= **emitter load in Watts**

Use this for:
- Pipe section heat load (room-connected sections)
- Radiator sizing verification
- Building emitter total

Do **not** use this for heat pump sizing — use generator load figures from
`calculateRoomVentilationEN12831` instead.

**Field requirements:** room must have camelCase fields as mapped by `App.jsx loadProject()`.
Do not call this on raw DB rows (snake_case fields) — `uValue`, `customDeltaT` etc.
will be undefined and transmission loss will return zero.

### `calculateBuildingTotal(rooms, project)` → W
Sum of `calculateRoomTotal` across all rooms. Returns **total emitter load** in Watts.
This is the "Emitter Heat Load" figure shown in the Summary tab.

---

## en12831Calculations.js

Implements the CIBSE DHDG 2026 reduced method for BS EN 12831-1:2017 ventilation
heat loss. Five calculation stages matching the DHDG 2026 worksheet:

1. **Stage 1** — Building air permeability (q50): `estimateQ50SAP` / `resolveQ50`
2. **Stage 2/3** — Room leakage rate: `calculateRoomLeakageRate`
3. **Stage 4** — Temperature-weighted factors: `calculateTempWeightedFactors`
4. **Stage 5** — Ventilation heat loss (three outputs): `calculateVentilationHeatLoss`
5. **Entry point** — All stages for one room: `calculateRoomVentilationEN12831`

### `calculateRoomVentilationEN12831(room, project)` → Object
Main entry point. Returns all three ventilation heat loss figures plus full audit trail.

```
{
  ventEmitter,             // W — emitter/pipework sizing (×2 orientation factor)
  ventGeneratorDesign,     // W — generator rated output selection (×1 orientation factor)
  ventGeneratorTypical,    // W — modulation check at Te,ref
  belowMinimumVentilation, // bool — true if below EN 12831-1 minimum 0.5 ACH
  contVentWarning,         // 'mev_unbalanced' | null
  stages: { q50, leakage, factors, loss }  // full audit trail
}
```

The difference between `ventEmitter` and `ventGeneratorDesign` is the ×2 orientation
factor on the leakage term. For MVHR buildings the difference is smaller because the
continuous ventilation factor is the same in both (MVHR is not orientation-dependent).

### `resolveQ50(project)` → number
Returns effective q50 in m³/(h·m²). If `project.airPermeabilityMethod === 'measured'`,
returns `project.q50` directly. Otherwise calls `estimateQ50SAP` with the SAP 10.2
component inputs.

---

## pipeMaterialData.js

### `calculateFlowRate(heatLoad, deltaT)` → l/s
```
Q (l/s) = heatLoad (kW) / (4.18 × deltaT (K))
```
Uses approximate water specific heat capacity × density at mean system temperature.
`deltaT` defaults to 10K if not supplied — always pass the design ΔT explicitly.

**Use for:**
- `useWholeProperty` pipe sections: `calculateFlowRate(project.heatPumpRatedOutput, designDeltaT)`
- Room-connected pipe sections: `calculateFlowRate(calculateRoomTotal(room, project) / 1000, designDeltaT)`

### `calculatePressureDrop(flowRate, diameter, length, material, temperature)` → Object
Darcy-Weisbach with Swamee-Jain friction factor. Handles laminar (Re < 2300) and
turbulent flow. Water properties interpolated from table at 10–80°C.

```
{
  velocity,        // m/s
  reynoldsNumber,
  frictionFactor,
  pressureDrop,    // kPa
  isVelocityOK,    // bool — velocity ≤ material maxVelocity
  maxVelocity      // m/s — from PIPE_MATERIALS
}
```

`isVelocityOK` and `maxVelocity` are **derived at call time** — never store these
values. Always re-derive from a fresh `calculatePressureDrop` call or from
`PIPE_MATERIALS[key].maxVelocity` directly. Storing them risks stale values if
material limits change.

### `PIPE_MATERIALS` constant
Key-value lookup of pipe material specifications. Keys: `copper_tableX`,
`copper_tableY`, `polybutylene`, `mlcp`, `pex`. Legacy keys `mlcp_riifo` and
`mlcp_maincor` are remapped to `mlcp` inside `calculatePressureDrop` and
`suggestPipeSize`.

Velocity limits:
- Copper (Table X and Y): 1.5 m/s
- Polybutylene: 1.5 m/s (Pipelife limit — no lower hard limit for hot water)
- MLCP: 1.2 m/s
- PEX: 1.0 m/s (erosion limit)

---

## Field naming — critical rule

All calculation functions in this codebase expect **camelCase** field names, as
mapped by `App.jsx loadProject()`. Raw DB rows use `snake_case`.

**Never call `calculateRoomTotal` or `calculateTransmissionLoss` on raw DB rows.**
The most dangerous symptom is silent zero — `el.uValue` returns `undefined` on a
raw row, so `effectiveUValue` becomes `0 + thermalBridging`, giving a very small
but non-zero result rather than an obvious error.

The correct place to call these functions is:
- Any React component receiving `project` from `App.jsx` props ✓
- `PipeSectionEditor` using `rooms` prop (passed from `project.rooms`) ✓
- `PipeSizing` using `project.rooms` ✓

Do **not** call them on objects from raw `fetch()` responses or `api.*` return values
before they have been through `loadProject()` mapping.

---

## Pipe sizing — emitter vs generator load

Pipe sections must use **emitter load**, not generator load. The pipework carries
the heat that emitters emit, which includes the ×2 orientation factor on ventilation
leakage. Using generator load would undersize the pipework for worst-case conditions.

- `useWholeProperty` sections → `project.heatPumpRatedOutput` (kW)  
  The main header carries full pump output, which is selected against generator load
  but sized for the maximum flow the pump will ever produce.
- Room-connected sections → `calculateRoomTotal(room, project) / 1000` (kW)  
  Emitter load per room. Sum across all connected rooms for the section heat load.

The staleness check in `PipeSizing.jsx` uses `calculateRoomTotal` for this reason.
