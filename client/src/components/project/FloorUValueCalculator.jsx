import { useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CIBSE Table 2-46  –  P/A ratio lookup
// Keys: `${a}_${b}` where a ≤ b (always pass smaller dim as a)
// Columns: four, three, twoAdj, twoOpp, one, none
// ─────────────────────────────────────────────────────────────────────────────
const PA_TABLE = {
  "3_3":  { four:1.33, three:1.00, twoAdj:0.67, twoOpp:0.67, one:0.33, none:0.00 },
  "3_4":  { four:1.17, three:0.92, twoAdj:0.58, twoOpp:0.67, one:0.33, none:0.00 },
  "3_5":  { four:1.07, three:0.87, twoAdj:0.53, twoOpp:0.67, one:0.33, none:0.00 },
  "3_6":  { four:1.00, three:0.83, twoAdj:0.50, twoOpp:0.67, one:0.33, none:0.00 },
  "3_7":  { four:0.95, three:0.81, twoAdj:0.48, twoOpp:0.67, one:0.33, none:0.00 },
  "3_8":  { four:0.92, three:0.79, twoAdj:0.46, twoOpp:0.67, one:0.33, none:0.00 },
  "3_9":  { four:0.89, three:0.78, twoAdj:0.44, twoOpp:0.67, one:0.33, none:0.00 },
  "3_10": { four:0.87, three:0.77, twoAdj:0.43, twoOpp:0.67, one:0.33, none:0.00 },
  "4_4":  { four:1.00, three:0.75, twoAdj:0.50, twoOpp:0.50, one:0.25, none:0.00 },
  "4_5":  { four:0.90, three:0.70, twoAdj:0.45, twoOpp:0.50, one:0.25, none:0.00 },
  "4_6":  { four:0.83, three:0.67, twoAdj:0.42, twoOpp:0.50, one:0.25, none:0.00 },
  "4_7":  { four:0.79, three:0.64, twoAdj:0.39, twoOpp:0.50, one:0.25, none:0.00 },
  "4_8":  { four:0.75, three:0.63, twoAdj:0.38, twoOpp:0.50, one:0.25, none:0.00 },
  "4_9":  { four:0.72, three:0.61, twoAdj:0.36, twoOpp:0.50, one:0.25, none:0.00 },
  "4_10": { four:0.70, three:0.60, twoAdj:0.35, twoOpp:0.50, one:0.25, none:0.00 },
  "5_5":  { four:0.80, three:0.60, twoAdj:0.40, twoOpp:0.40, one:0.20, none:0.00 },
  "5_6":  { four:0.73, three:0.57, twoAdj:0.37, twoOpp:0.40, one:0.20, none:0.00 },
  "5_7":  { four:0.69, three:0.54, twoAdj:0.34, twoOpp:0.40, one:0.20, none:0.00 },
  "5_8":  { four:0.65, three:0.53, twoAdj:0.33, twoOpp:0.40, one:0.20, none:0.00 },
  "5_9":  { four:0.62, three:0.51, twoAdj:0.31, twoOpp:0.40, one:0.20, none:0.00 },
  "5_10": { four:0.60, three:0.50, twoAdj:0.30, twoOpp:0.40, one:0.20, none:0.00 },
  "6_6":  { four:0.67, three:0.50, twoAdj:0.33, twoOpp:0.33, one:0.17, none:0.00 },
  "6_7":  { four:0.62, three:0.48, twoAdj:0.31, twoOpp:0.33, one:0.17, none:0.00 },
  "6_8":  { four:0.58, three:0.46, twoAdj:0.29, twoOpp:0.33, one:0.17, none:0.00 },
  "6_9":  { four:0.56, three:0.44, twoAdj:0.28, twoOpp:0.33, one:0.17, none:0.00 },
  "6_10": { four:0.53, three:0.43, twoAdj:0.27, twoOpp:0.33, one:0.17, none:0.00 },
  "7_7":  { four:0.57, three:0.43, twoAdj:0.29, twoOpp:0.29, one:0.14, none:0.00 },
  "7_8":  { four:0.54, three:0.41, twoAdj:0.27, twoOpp:0.29, one:0.14, none:0.00 },
  "7_9":  { four:0.51, three:0.40, twoAdj:0.25, twoOpp:0.29, one:0.14, none:0.00 },
  "7_10": { four:0.49, three:0.39, twoAdj:0.24, twoOpp:0.29, one:0.14, none:0.00 },
  "8_8":  { four:0.50, three:0.38, twoAdj:0.25, twoOpp:0.25, one:0.13, none:0.00 },
  "8_9":  { four:0.47, three:0.36, twoAdj:0.24, twoOpp:0.25, one:0.13, none:0.00 },
  "8_10": { four:0.45, three:0.35, twoAdj:0.23, twoOpp:0.25, one:0.13, none:0.00 },
  "9_9":  { four:0.44, three:0.33, twoAdj:0.22, twoOpp:0.22, one:0.11, none:0.00 },
  "9_10": { four:0.42, three:0.32, twoAdj:0.21, twoOpp:0.22, one:0.11, none:0.00 },
  "10_10":{ four:0.40, three:0.30, twoAdj:0.20, twoOpp:0.20, one:0.10, none:0.00 },
};

// Look up P/A from table, or calculate if dimensions outside table range
function getPARatio(dimA, dimB, exposedSides) {
  const a = Math.min(dimA, dimB);
  const b = Math.max(dimA, dimB);
  const aR = Math.round(a);
  const bR = Math.round(b);

  const key = `${aR}_${bR}`;
  if (PA_TABLE[key]) {
    return PA_TABLE[key][exposedSides];
  }
  // Fallback: calculate from first principles
  // P = exposed perimeter, A = floor area
  return calculatePAFromDims(dimA, dimB, exposedSides);
}

function calculatePAFromDims(a, b, exposedSides) {
  const area = a * b;
  let perimeter;
  switch (exposedSides) {
    case "four":    perimeter = 2 * (a + b); break;
    case "three":   perimeter = a + 2 * b; break;   // longer edge internal
    case "twoAdj":  perimeter = a + b; break;
    case "twoOpp":  perimeter = 2 * b; break;        // two opposite long sides
    case "one":     perimeter = b; break;
    case "none":    return 0;
    default:        perimeter = 2 * (a + b);
  }
  return perimeter / area;
}

// ─────────────────────────────────────────────────────────────────────────────
// BS EN ISO 13370 / CIBSE floor U-value formulas
// ─────────────────────────────────────────────────────────────────────────────

// Ground thermal conductivity (λg) typical values
const LAMBDA_G = 2.0; // W/mK  (clay/silt=1.5, sand/gravel=2.0, homogeneous rock=3.5)

// Combined surface resistances (Rsi + Rse) = 0.17 m²K/W
const R_SURFACE = 0.17;

/**
 * Slab-on-ground U-value (BS EN ISO 13370 Eq. 1)
 * dt = total equivalent thickness = w + λg × (Rf + R_SURFACE)
 * w  = wall thickness (m)
 *
 * If dt < B'  (B' = characteristic floor dimension = A / (0.5 × P))
 *   Uf = (2 × λg) / (π × B' + dt) × ln(π × B' / dt + 1)
 * If dt ≥ B'
 *   Uf = λg / (0.457 × B' + dt)
 */
function calcSlabOnGround({ paRatio, floorInsulation, wallThickness, lambdaIns, edgeInsulation, edgeDepth, edgeWidth }) {
  if (paRatio <= 0) return null;

  const B_prime = 1 / (0.5 * paRatio); // = A / (0.5 × P) but paRatio = P/A, so B' = 2/PA
  const lambdaG = LAMBDA_G;

  // Total insulation resistance
  const Rf = floorInsulation > 0 ? (floorInsulation / 1000) / lambdaIns : 0; // thickness mm → m

  const w = wallThickness / 1000; // mm → m
  const dt = w + lambdaG * (Rf + R_SURFACE);

  let Uf;
  if (dt < B_prime) {
    Uf = (2 * lambdaG) / (Math.PI * B_prime + dt) * Math.log(Math.PI * B_prime / dt + 1);
  } else {
    Uf = lambdaG / (0.457 * B_prime + dt);
  }

  // Edge insulation correction (BS EN ISO 13370 Eq. 2 & 3)
  let deltaU = 0;
  if (edgeInsulation !== "none" && edgeDepth > 0) {
    const Rn = (edgeDepth / 1000) / lambdaIns; // edge insulation resistance
    const dn = w + lambdaG * (Rn + R_SURFACE);
    if (edgeInsulation === "horizontal") {
      const D = edgeWidth / 1000;
      deltaU = (lambdaG / (Math.PI * B_prime)) *
        (Math.log(D / dt + 1) - Math.log(D / dn + 1));
    } else {
      // vertical
      const D = edgeDepth / 1000;
      deltaU = (lambdaG / (Math.PI * B_prime)) *
        (Math.log(2 * D / dt + 1) - Math.log(2 * D / dn + 1));
    }
  }

  return Math.max(0.01, Uf - deltaU);
}

/**
 * Suspended timber floor (BS EN ISO 13370 Eq. 7)
 * Combines ground loss and ventilated sub-floor loss
 */
function calcSuspendedTimber({ paRatio, floorInsulation, wallThickness, lambdaIns, vWindward, vLeeward, heightAboveGround }) {
  if (paRatio <= 0) return null;

  const B_prime = 1 / (0.5 * paRatio);
  const lambdaG = LAMBDA_G;
  const Rf = floorInsulation > 0 ? (floorInsulation / 1000) / lambdaIns : 0;
  const w = wallThickness / 1000;

  // U-value of floor construction (upper surface to sub-floor)
  const Uf_construction = 1 / (0.17 + Rf + 0.17);

  // Sub-floor ventilation rate (simplified: use default 0.003 m/s × windward factor)
  const vAvg = ((vWindward + vLeeward) / 2) * 0.003;
  const h = heightAboveGround / 1000; // mm → m
  const epsilon = 0.003; // m (default for open vents)

  // Ground heat loss component
  const dt_g = w + lambdaG * R_SURFACE;
  let Ug;
  if (dt_g < B_prime) {
    Ug = (2 * lambdaG) / (Math.PI * B_prime + dt_g) * Math.log(Math.PI * B_prime / dt_g + 1);
  } else {
    Ug = lambdaG / (0.457 * B_prime + dt_g);
  }

  // Ventilation loss component
  const Uv = (1450 * epsilon * vAvg * h) / B_prime;

  // Combined U-value (resistances in parallel through sub-floor)
  const Uf = (2 / B_prime) * (Ug + Uv) / (1 / 0.17 + 1 / Uf_construction);

  // Simplified practical formula: series combination
  const U_ground = 1 / (1 / Ug + 0.2 + Rf);
  const U_vent   = 1 / (0.17 + Rf + 0.17);
  const U_combined = Math.min(U_ground, U_vent + 0.05 * Uv);

  return Math.max(0.05, U_combined);
}

/**
 * Unheated basement / void – simplified slab method with added void resistance
 */
function calcSuspendedConcrete({ paRatio, floorInsulation, wallThickness, lambdaIns }) {
  // Treat as slab with additional air gap resistance (0.15 m²K/W for unventilated void)
  const Uf = calcSlabOnGround({ paRatio, floorInsulation: floorInsulation + 50, wallThickness, lambdaIns, edgeInsulation: "none", edgeDepth: 0, edgeWidth: 0 });
  return Uf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance thresholds (Part L 2021 / SAP 10.2)
// ─────────────────────────────────────────────────────────────────────────────
function getCompliance(uValue, floorType) {
  // Part L 2021 notional values
  const limits = { new: 0.13, existing: 0.25 };
  if (uValue <= limits.new)      return { label: "Exceeds Part L 2021", color: "#16a34a", bg: "#dcfce7" };
  if (uValue <= limits.existing) return { label: "Meets Part L 2021", color: "#ca8a04", bg: "#fef9c3" };
  return { label: "Below Part L 2021", color: "#dc2626", bg: "#fee2e2" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function FloorUValueCalculator({ onSaveToLibrary }) {
  const [floorType, setFloorType] = useState("slab");
  const [dimMode, setDimMode] = useState("table"); // "table" | "manual"

  // Dimensions
  const [dimA, setDimA] = useState(5);
  const [dimB, setDimB] = useState(8);
  const [exposedSides, setExposedSides] = useState("four");
  const [manualPA, setManualPA] = useState(0.5);

  // Construction
  const [wallThickness, setWallThickness] = useState(300); // mm
  const [floorInsulation, setFloorInsulation] = useState(100); // mm
  const [insType, setInsType] = useState("eps"); // eps | xps | mineral | pir
  const [edgeInsulation, setEdgeInsulation] = useState("none");
  const [edgeDepth, setEdgeDepth] = useState(500); // mm
  const [edgeWidth, setEdgeWidth] = useState(500); // mm

  // Suspended timber extras
  const [vWindward, setVWindward] = useState(5);
  const [vLeeward, setVLeeward] = useState(3);
  const [heightAboveGround, setHeightAboveGround] = useState(300); // mm

  const [customLambda, setCustomLambda] = useState(0.035);
  const INS_LAMBDA = { eps: 0.038, xps: 0.033, mineral: 0.036, pir: 0.023 };
  const lambdaIns = insType === 'custom' ? (parseFloat(customLambda) || 0.035) : INS_LAMBDA[insType];

  const [saveName, setSaveName] = useState('Ground Floor Construction');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Compute P/A ratio
  const paRatio = dimMode === "table"
    ? getPARatio(dimA, dimB, exposedSides)
    : (parseFloat(manualPA) > 0
        ? parseFloat(manualPA)
        : calculatePAFromDims(dimA, dimB, exposedSides));

  // Compute U-value
  let uValue = null;
  let calcSteps = [];

  if (paRatio > 0) {
    const params = { paRatio, floorInsulation, wallThickness, lambdaIns, edgeInsulation, edgeDepth, edgeWidth, vWindward, vLeeward, heightAboveGround };

    if (floorType === "slab") {
      uValue = calcSlabOnGround(params);
      const Rf = floorInsulation > 0 ? (floorInsulation / 1000) / lambdaIns : 0;
      const w = wallThickness / 1000;
      const dt = w + LAMBDA_G * (Rf + R_SURFACE);
      const B_prime = 1 / (0.5 * paRatio);
      calcSteps = [
        { label: "P/A ratio", value: paRatio.toFixed(3), unit: "m⁻¹" },
        { label: "Characteristic dimension B'", value: B_prime.toFixed(2), unit: "m" },
        { label: "Floor insulation resistance Rf", value: Rf.toFixed(3), unit: "m²K/W" },
        { label: "Equivalent thickness dt", value: dt.toFixed(3), unit: "m" },
        { label: "Method", value: dt < B_prime ? "dt < B′ (logarithmic)" : "dt ≥ B′ (linear)", unit: "" },
      ];
    } else if (floorType === "suspended_timber") {
      uValue = calcSuspendedTimber(params);
      calcSteps = [
        { label: "P/A ratio", value: paRatio.toFixed(3), unit: "m⁻¹" },
        { label: "Characteristic dimension B'", value: (1 / (0.5 * paRatio)).toFixed(2), unit: "m" },
        { label: "Floor insulation resistance Rf", value: (floorInsulation > 0 ? (floorInsulation / 1000) / lambdaIns : 0).toFixed(3), unit: "m²K/W" },
        { label: "Sub-floor ventilation", value: `${vWindward} / ${vLeeward}`, unit: "m/s W/L" },
      ];
    } else {
      uValue = calcSuspendedConcrete(params);
      calcSteps = [
        { label: "P/A ratio", value: paRatio.toFixed(3), unit: "m⁻¹" },
        { label: "Characteristic dimension B'", value: (1 / (0.5 * paRatio)).toFixed(2), unit: "m" },
        { label: "Method", value: "Slab + void correction", unit: "" },
      ];
    }
  }

  const compliance = uValue ? getCompliance(uValue, floorType) : null;

  const inputStyle = {
    width: "100%", padding: "8px 10px", border: "1px solid #d1d5db",
    borderRadius: 6, fontSize: 14, background: "#fff",
    outline: "none", boxSizing: "border-box",
    fontFamily: "'DM Mono', monospace",
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" };
  const sectionStyle = { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 16 };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: 820, margin: "0 auto", padding: 24, background: "#f3f4f6", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        select:focus, input:focus { border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .tab-btn { padding: 7px 18px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; font-size: 13px; font-weight: 600; color: #6b7280; transition: all .15s; font-family: 'DM Sans', sans-serif; }
        .tab-btn.active { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }
        .tab-btn:hover:not(.active) { background: #f1f5f9; }
        .step-row:nth-child(odd) { background: #f0f4ff; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#1e3a5f", borderRadius: 12, padding: "22px 28px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
            BS EN ISO 13370 · CIBSE Table 2-46
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff" }}>Floor U-Value Calculator</h1>
        </div>
        {uValue && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>U-Value</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#fff", lineHeight: 1.1, fontFamily: "'DM Mono', monospace" }}>
              {uValue.toFixed(3)}
            </div>
            <div style={{ fontSize: 13, color: "#bfdbfe" }}>W/m²K</div>
          </div>
        )}
      </div>

      {/* Compliance Banner */}
      {compliance && (
        <div style={{ background: compliance.bg, border: `1px solid ${compliance.color}30`, borderRadius: 8, padding: "12px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: compliance.color, flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: 700, color: compliance.color, fontSize: 14 }}>{compliance.label}</span>
            <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 8 }}>
              Part L 2021: New build ≤ 0.13 W/m²K · Existing ≤ 0.25 W/m²K
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* LEFT COLUMN */}
        <div>
          {/* Floor Type */}
          <div style={sectionStyle}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Floor Construction Type</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { v: "slab", label: "Slab on Ground" },
                { v: "suspended_timber", label: "Suspended Timber" },
                { v: "suspended_concrete", label: "Suspended Concrete" },
              ].map(ft => (
                <button key={ft.v} className={`tab-btn${floorType === ft.v ? " active" : ""}`} onClick={() => setFloorType(ft.v)}>
                  {ft.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions / P/A */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={labelStyle}>Floor Dimensions & Exposure</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className={`tab-btn${dimMode === "table" ? " active" : ""}`} onClick={() => setDimMode("table")} style={{ padding: "5px 12px", fontSize: 12 }}>Table Lookup</button>
                <button className={`tab-btn${dimMode === "manual" ? " active" : ""}`} onClick={() => setDimMode("manual")} style={{ padding: "5px 12px", fontSize: 12 }}>Manual P/A</button>
              </div>
            </div>

            {dimMode === "table" ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>Dimension A (m)</label>
                    <input type="number" style={inputStyle} min={3} max={20} step={0.5} value={dimA} onChange={e => setDimA(parseFloat(e.target.value))} />
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>Table range: 3–10m</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Dimension B (m)</label>
                    <input type="number" style={inputStyle} min={3} max={20} step={0.5} value={dimB} onChange={e => setDimB(parseFloat(e.target.value))} />
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>Table range: 3–10m</div>
                  </div>
                </div>
                {/* A/B diagram */}
                <div style={{ marginBottom: 12, background: "#f0f4ff", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14 }}>
                  <svg width="110" height="80" viewBox="0 0 110 80" style={{ flexShrink: 0 }}>
                    {/* Floor rectangle */}
                    <rect x="18" y="10" width="74" height="54" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" rx="2"/>
                    {/* B arrow (horizontal, top) */}
                    <line x1="18" y1="5" x2="92" y2="5" stroke="#2563eb" strokeWidth="1.5" markerStart="url(#arrowL)" markerEnd="url(#arrowR)"/>
                    <text x="55" y="3" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1e40af" dy="0">B</text>
                    {/* A arrow (vertical, left) */}
                    <line x1="13" y1="10" x2="13" y2="64" stroke="#7c3aed" strokeWidth="1.5" markerStart="url(#arrowU)" markerEnd="url(#arrowD)"/>
                    <text x="7" y="40" textAnchor="middle" fontSize="10" fontWeight="700" fill="#7c3aed">A</text>
                    {/* Arrow markers */}
                    <defs>
                      <marker id="arrowL" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto"><polygon points="5,0 0,2.5 5,5" fill="#2563eb"/></marker>
                      <marker id="arrowR" markerWidth="5" markerHeight="5" refX="0" refY="2.5" orient="auto"><polygon points="0,0 5,2.5 0,5" fill="#2563eb"/></marker>
                      <marker id="arrowU" markerWidth="5" markerHeight="5" refX="2.5" refY="5" orient="auto"><polygon points="0,5 2.5,0 5,5" fill="#7c3aed"/></marker>
                      <marker id="arrowD" markerWidth="5" markerHeight="5" refX="2.5" refY="0" orient="auto"><polygon points="0,0 2.5,5 5,0" fill="#7c3aed"/></marker>
                    </defs>
                  </svg>
                  <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                    <strong>A</strong> = shorter floor dimension · <strong>B</strong> = longer dimension.<br/>
                    The table sorts automatically — enter either dimension in either box.<br/>
                    <span style={{ color: "#6b7280" }}>Outside 3–10 m range: P/A is calculated directly.</span>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Exposed Sides</label>
                  <select style={inputStyle} value={exposedSides} onChange={e => setExposedSides(e.target.value)}>
                    <option value="four">Four sides exposed (detached)</option>
                    <option value="three">Three sides exposed (end-of-terrace)</option>
                    <option value="twoAdj">Two adjacent sides (corner)</option>
                    <option value="twoOpp">Two opposite sides (mid-terrace)</option>
                    <option value="one">One side exposed</option>
                    <option value="none">No sides exposed (internal floor)</option>
                  </select>
                </div>
                {paRatio > 0 && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "#eff6ff", borderRadius: 6, fontSize: 13, color: "#1e40af" }}>
                    <strong>P/A = {paRatio.toFixed(3)} m⁻¹</strong>
                    {(dimA < 3 || dimA > 10 || dimB < 3 || dimB > 10) && (
                      <span style={{ color: "#b45309", marginLeft: 8 }}>⚠ Outside table range – calculated</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                  Enter the actual floor dimensions and exposed sides below — P/A is calculated for you.
                  Use this when dimensions fall outside the 3–10 m table range, or for irregular footprints
                  where you know the exact exposed perimeter.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>Floor length (m)</label>
                    <input type="number" style={inputStyle} min={0.5} max={100} step={0.1}
                      value={dimA} onChange={e => setDimA(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Floor width (m)</label>
                    <input type="number" style={inputStyle} min={0.5} max={100} step={0.1}
                      value={dimB} onChange={e => setDimB(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Exposed sides</label>
                  <select style={inputStyle} value={exposedSides} onChange={e => setExposedSides(e.target.value)}>
                    <option value="four">Four sides exposed (detached)</option>
                    <option value="three">Three sides exposed (end-of-terrace)</option>
                    <option value="twoAdj">Two adjacent sides (corner)</option>
                    <option value="twoOpp">Two opposite sides (mid-terrace)</option>
                    <option value="one">One side exposed</option>
                    <option value="none">No sides exposed (internal floor)</option>
                  </select>
                </div>
                {dimA > 0 && dimB > 0 && (
                  <div style={{ padding: "10px 14px", background: "#eff6ff", borderRadius: 6, fontSize: 13 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, color: "#374151" }}>
                      <div>
                        <span style={{ color: "#6b7280", fontSize: 11, display: "block", fontWeight: 600, textTransform: "uppercase" }}>Floor area</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{(dimA * dimB).toFixed(2)} m²</span>
                      </div>
                      <div>
                        <span style={{ color: "#6b7280", fontSize: 11, display: "block", fontWeight: 600, textTransform: "uppercase" }}>Exp. perimeter</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                          {calculatePAFromDims(dimA, dimB, exposedSides) > 0
                            ? (calculatePAFromDims(dimA, dimB, exposedSides) * dimA * dimB).toFixed(2)
                            : "0.00"} m
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "#6b7280", fontSize: 11, display: "block", fontWeight: 600, textTransform: "uppercase" }}>P/A ratio</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#1e3a5f" }}>
                          {calculatePAFromDims(dimA, dimB, exposedSides).toFixed(3)} m⁻¹
                        </span>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
                      P/A = exposed perimeter ÷ floor area
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>Or enter P/A directly (m⁻¹)</label>
                  <input type="number" style={inputStyle} min={0.05} max={2.0} step={0.001}
                    value={manualPA}
                    onChange={e => setManualPA(e.target.value)}
                    placeholder="Override calculated value" />
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                    Leave at 0 to use the calculated value above. Enter a non-zero value to override (e.g. for an L-shaped floor).
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Suspended timber extras */}
          {floorType === "suspended_timber" && (
            <div style={sectionStyle}>
              <div style={labelStyle}>Sub-Floor Ventilation</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>Windward vent area (m/s)</label>
                  <input type="number" style={inputStyle} min={0} max={20} step={0.5} value={vWindward} onChange={e => setVWindward(parseFloat(e.target.value))} />
                </div>
                <div>
                  <label style={labelStyle}>Leeward vent area (m/s)</label>
                  <input type="number" style={inputStyle} min={0} max={20} step={0.5} value={vLeeward} onChange={e => setVLeeward(parseFloat(e.target.value))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Height above ground (mm)</label>
                <input type="number" style={inputStyle} min={100} max={1500} step={50} value={heightAboveGround} onChange={e => setHeightAboveGround(parseFloat(e.target.value))} />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* Construction */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Construction Details</div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Wall / slab thickness (mm)</label>
              <input type="number" style={inputStyle} min={100} max={600} step={25} value={wallThickness} onChange={e => setWallThickness(parseFloat(e.target.value))} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Floor insulation thickness (mm)</label>
              <input type="number" style={inputStyle} min={0} max={500} step={10} value={floorInsulation} onChange={e => setFloorInsulation(parseFloat(e.target.value))} />
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>Enter 0 for uninsulated</div>
            </div>
            <div>
              <label style={labelStyle}>Insulation type</label>
              <select style={inputStyle} value={insType} onChange={e => setInsType(e.target.value)}>
                <option value="eps">EPS (λ = 0.038 W/mK)</option>
                <option value="xps">XPS (λ = 0.033 W/mK)</option>
                <option value="mineral">Mineral wool (λ = 0.036 W/mK)</option>
                <option value="pir">PIR (λ = 0.023 W/mK)</option>
                <option value="custom">Custom — enter λ value</option>
              </select>
              {insType === 'custom' && (
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Thermal conductivity λ (W/mK)</label>
                  <input
                    type="number" style={inputStyle}
                    min={0.010} max={0.100} step={0.001}
                    value={customLambda}
                    onChange={e => setCustomLambda(e.target.value)}
                  />
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                    Typical range: 0.020–0.045 W/mK. Check manufacturer datasheet.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Edge Insulation (slab only) */}
          {floorType === "slab" && (
            <div style={sectionStyle}>
              <div style={labelStyle}>Edge Insulation</div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Edge insulation type</label>
                <select style={inputStyle} value={edgeInsulation} onChange={e => setEdgeInsulation(e.target.value)}>
                  <option value="none">None</option>
                  <option value="horizontal">Horizontal (under slab edge)</option>
                  <option value="vertical">Vertical (outside perimeter)</option>
                </select>
              </div>
              {edgeInsulation !== "none" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>{edgeInsulation === "horizontal" ? "Width" : "Depth"} (mm)</label>
                    <input type="number" style={inputStyle} min={100} max={1000} step={50}
                      value={edgeInsulation === "horizontal" ? edgeWidth : edgeDepth}
                      onChange={e => edgeInsulation === "horizontal" ? setEdgeWidth(parseFloat(e.target.value)) : setEdgeDepth(parseFloat(e.target.value))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Thickness (mm)</label>
                    <input type="number" style={inputStyle} min={25} max={200} step={25} value={edgeDepth} onChange={e => setEdgeDepth(parseFloat(e.target.value))} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Calculation steps */}
          {calcSteps.length > 0 && (
            <div style={{ ...sectionStyle, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 13, color: "#374151", background: "#fff" }}>
                Calculation Steps
              </div>
              {calcSteps.map((s, i) => (
                <div key={i} className="step-row" style={{ display: "flex", justifyContent: "space-between", padding: "9px 16px", fontSize: 13 }}>
                  <span style={{ color: "#6b7280" }}>{s.label}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "#1e3a5f" }}>
                    {s.value} {s.unit && <span style={{ color: "#9ca3af", fontSize: 11 }}>{s.unit}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Result card */}
      {uValue && (
        <div style={{ background: "#fff", border: "2px solid #1e3a5f", borderRadius: 12, padding: 24, marginTop: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                Floor U-Value
              </div>
              <div style={{ fontSize: 40, fontWeight: 700, color: "#1e3a5f", fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                {uValue.toFixed(3)}
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>W/m²K</div>
            </div>
            <div style={{ textAlign: "center", borderLeft: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                Insulation Rf
              </div>
              <div style={{ fontSize: 40, fontWeight: 700, color: "#374151", fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                {(floorInsulation > 0 ? (floorInsulation / 1000) / lambdaIns : 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>m²K/W</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                P/A Ratio
              </div>
              <div style={{ fontSize: 40, fontWeight: 700, color: "#374151", fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                {paRatio.toFixed(3)}
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>m⁻¹</div>
            </div>
          </div>

          {/* Insulation comparison */}
          <div style={{ marginTop: 20, borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Insulation Comparison (at current dimensions)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
              {[0, 50, 75, 100, 150, 200].map(thick => {
                const u = floorType === "slab"
                  ? calcSlabOnGround({ paRatio, floorInsulation: thick, wallThickness, lambdaIns, edgeInsulation, edgeDepth, edgeWidth })
                  : floorType === "suspended_timber"
                  ? calcSuspendedTimber({ paRatio, floorInsulation: thick, wallThickness, lambdaIns, vWindward, vLeeward, heightAboveGround })
                  : calcSuspendedConcrete({ paRatio, floorInsulation: thick, wallThickness, lambdaIns });
                const isActive = thick === floorInsulation;
                const c = getCompliance(u);
                return (
                  <div key={thick} onClick={() => setFloorInsulation(thick)} style={{ padding: "8px 6px", borderRadius: 6, textAlign: "center", cursor: "pointer", border: isActive ? `2px solid #1e3a5f` : `1px solid #e5e7eb`, background: isActive ? "#eff6ff" : "#fafafa", transition: "all .12s" }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{thick}mm</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a5f", fontFamily: "'DM Mono', monospace" }}>{u?.toFixed(3)}</div>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, margin: "4px auto 0" }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Save to Library */}
        {uValue && onSaveToLibrary && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f", whiteSpace: "nowrap" }}>
              Save to U-Value Library
            </div>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Construction name..."
              style={{ flex: 1, minWidth: 200, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, fontFamily: "'DM Mono', monospace" }}
            />
            <button
              onClick={async () => {
                const categoryMap = {
                  slab:               'Ground Floor (Slab)',
                  suspended_timber:   'Ground Floor (Suspended)',
                  suspended_concrete: 'Ground Floor (Suspended)',
                };
                await onSaveToLibrary({
                  elementCategory: categoryMap[floorType] || 'Ground Floor (Slab)',
                  name: saveName,
                  uValue: parseFloat(uValue.toFixed(3)),
                  notes: `Floor type: ${floorType} · P/A: ${paRatio.toFixed(3)} · Insulation: ${floorInsulation}mm ${insType === 'custom' ? `custom λ${lambdaIns}` : insType.toUpperCase()}`
                });
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
              }}
              style={{ padding: "8px 20px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {saveSuccess ? "✓ Saved!" : "Save to Library"}
            </button>
            {saveSuccess && (
              <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
                Scroll up to see it in your library
              </span>
            )}
          </div>
        )}
        
      {/* Footer note */}
      <div style={{ marginTop: 16, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
        Calculations per BS EN ISO 13370:2017 · P/A ratios from CIBSE Table 2-46 · λg = 2.0 W/mK (sand/gravel) · Part L 2021 thresholds
      </div>
    </div>
  );
}
