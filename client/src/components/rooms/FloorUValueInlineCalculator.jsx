// client/src/components/rooms/FloorUValueInlineCalculator.jsx
// Mini floor U-value calculator that embeds inside the element row.
// Pre-fills room length/width; calls onApply(uValue) when done.
import { useState, useEffect } from 'react';

// CIBSE Table 2-46 P/A ratios — same data as standalone calculator
const PA_TABLE = {
  3:  { four: 1.333, three: 1.200, two_adj: 1.091, two_opp: 0.857, one: 0.600, none: 0.500 },
  4:  { four: 1.000, three: 0.923, two_adj: 0.857, two_opp: 0.727, one: 0.533, none: 0.444 },
  5:  { four: 0.800, three: 0.750, two_adj: 0.706, two_opp: 0.625, one: 0.476, none: 0.400 },
  6:  { four: 0.667, three: 0.632, two_adj: 0.600, two_opp: 0.545, one: 0.429, none: 0.364 },
  7:  { four: 0.571, three: 0.545, two_adj: 0.522, two_opp: 0.483, one: 0.389, none: 0.333 },
  8:  { four: 0.500, three: 0.480, two_adj: 0.462, two_opp: 0.432, one: 0.356, none: 0.308 },
  9:  { four: 0.444, three: 0.429, two_adj: 0.414, two_opp: 0.391, one: 0.327, none: 0.286 },
  10: { four: 0.400, three: 0.387, two_adj: 0.375, two_opp: 0.357, one: 0.302, none: 0.267 },
};
const EXPOSURE_LABELS = {
  four:    'All 4 sides exposed',
  three:   '3 sides exposed',
  two_adj: '2 adjacent sides',
  two_opp: '2 opposite sides',
  one:     '1 side exposed',
  none:    'No exposure',
};
const FLOOR_TYPES = [
  { value: 'slab', label: 'Slab on ground' },
  { value: 'suspended_timber', label: 'Suspended timber' },
  { value: 'suspended_concrete', label: 'Suspended concrete' },
];

function lookupPA(length, width, exposure) {
  const rowKey = Math.min(10, Math.max(3, Math.round(Math.min(length, width))));
  return PA_TABLE[rowKey]?.[exposure] ?? null;
}

function calcFloorU({ floorType, length, width, exposure, insThickness, lambdaInsulation, edgeType, edgeDepth, edgeRValue }) {
  const LAMBDA_G = 2.0;
  const R_SURFACE = 0.17;
  const insThicknesM = (insThickness || 0) / 1000;
  const Rf = lambdaInsulation > 0 ? insThicknesM / lambdaInsulation : 0;

  // Get P/A from table or compute directly
  const paFromTable = lookupPA(length, width, exposure);
  const area = length * width;
  // Perimeter based on exposure key
  const exposureSides = { four: 4, three: 3, two_adj: 2, two_opp: 2, one: 1, none: 0 };
  const sides = exposureSides[exposure] ?? 2;
  const perimFromTable = paFromTable ? paFromTable * area : (sides * (length + width) / 2);
  const PA = paFromTable ?? (area > 0 ? perimFromTable / area : 0);

  const Bprime = 2 / PA; // characteristic dimension
  const w = 0.1; // typical wall thickness
  const dt = w + LAMBDA_G * (Rf + R_SURFACE);

  let U;
  if (floorType === 'slab') {
    if (dt < Bprime) {
      U = (2 * LAMBDA_G) / (Math.PI * Bprime + dt) * Math.log(Math.PI * Bprime / dt + 1);
    } else {
      U = LAMBDA_G / (0.457 * Bprime + dt);
    }
  } else if (floorType === 'suspended_timber') {
    // Simplified suspended timber: additional air gap resistance ~0.2 m²K/W
    const Rfloor = Rf + 0.2;
    const dtSusp = w + LAMBDA_G * (Rfloor + R_SURFACE);
    if (dtSusp < Bprime) {
      U = (2 * LAMBDA_G) / (Math.PI * Bprime + dtSusp) * Math.log(Math.PI * Bprime / dtSusp + 1);
    } else {
      U = LAMBDA_G / (0.457 * Bprime + dtSusp);
    }
  } else {
    // Suspended concrete: similar to slab but R_SURFACE slightly higher
    const dtConc = w + LAMBDA_G * (Rf + 0.2);
    if (dtConc < Bprime) {
      U = (2 * LAMBDA_G) / (Math.PI * Bprime + dtConc) * Math.log(Math.PI * Bprime / dtConc + 1);
    } else {
      U = LAMBDA_G / (0.457 * Bprime + dtConc);
    }
  }

  // Edge insulation correction
  let edgeCorrection = 0;
  if (edgeType === 'horizontal' && edgeDepth > 0 && edgeRValue > 0) {
    edgeCorrection = -(edgeRValue * LAMBDA_G) / (Math.PI * Bprime) * Math.log(edgeDepth / dt + 1);
  } else if (edgeType === 'vertical' && edgeDepth > 0 && edgeRValue > 0) {
    edgeCorrection = -(2 * edgeRValue * LAMBDA_G) / (Math.PI * Bprime) * Math.log(edgeDepth / dt + 1);
  }

  return Math.max(0.01, U + edgeCorrection);
}

export default function FloorUValueInlineCalculator({ room, onApply, onClose }) {
  const [floorType, setFloorType] = useState('slab');
  const [length, setLength] = useState(room.roomLength || 0);
  const [width, setWidth] = useState(room.roomWidth || 0);
  const [exposure, setExposure] = useState('two_adj');
  const [insThickness, setInsThickness] = useState(100);
  const [lambdaInsulation, setLambdaInsulation] = useState(0.035);
  const [edgeType, setEdgeType] = useState('none');
  const [edgeDepth, setEdgeDepth] = useState(1.0);
  const [edgeRValue, setEdgeRValue] = useState(1.0);

  // Sync if room dimensions change
  useEffect(() => {
    if (room.roomLength > 0) setLength(room.roomLength);
    if (room.roomWidth > 0) setWidth(room.roomWidth);
  }, [room.roomLength, room.roomWidth]);

  const uValue = (length > 0 && width > 0)
    ? calcFloorU({ floorType, length, width, exposure, insThickness, lambdaInsulation,
                   edgeType: edgeType === 'none' ? null : edgeType, edgeDepth, edgeRValue })
    : null;

  const paDisplay = lookupPA(length, width, exposure);

  return (
    <div className="col-span-10 mt-1 mb-2 bg-orange-50 border border-orange-300 rounded-lg p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-orange-900">Floor U-value Calculator (BS EN ISO 13370)</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xs">✕ Close</button>
      </div>

      <div className="grid grid-cols-6 gap-2 text-xs">
        {/* Floor type */}
        <div>
          <label className="block font-semibold mb-1 text-gray-700">Floor Type</label>
          <select value={floorType} onChange={e => setFloorType(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400">
            {FLOOR_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
          </select>
        </div>

        {/* Dimensions — pre-filled from room */}
        <div>
          <label className="block font-semibold mb-1 text-gray-700">Length (m)</label>
          <input type="number" step="0.1" value={length}
            onChange={e => setLength(parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400" />
          {room.roomLength > 0 && (
            <div className="text-gray-400 mt-0.5">Room: {room.roomLength} m</div>
          )}
        </div>

        <div>
          <label className="block font-semibold mb-1 text-gray-700">Width (m)</label>
          <input type="number" step="0.1" value={width}
            onChange={e => setWidth(parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400" />
          {room.roomWidth > 0 && (
            <div className="text-gray-400 mt-0.5">Room: {room.roomWidth} m</div>
          )}
        </div>

        {/* Exposure */}
        <div>
          <label className="block font-semibold mb-1 text-gray-700">Exposure</label>
          <select value={exposure} onChange={e => setExposure(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400">
            {Object.entries(EXPOSURE_LABELS).map(([k, v]) =>
              <option key={k} value={k}>{v}</option>)}
          </select>
          {paDisplay && (
            <div className="text-gray-500 mt-0.5">P/A = {paDisplay.toFixed(3)} m⁻¹</div>
          )}
        </div>

        {/* Insulation */}
        <div>
          <label className="block font-semibold mb-1 text-gray-700">Ins. Thickness (mm)</label>
          <input type="number" step="5" value={insThickness}
            onChange={e => setInsThickness(parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400" />
        </div>

        <div>
          <label className="block font-semibold mb-1 text-gray-700">λ insulation (W/mK)</label>
          <input type="number" step="0.001" value={lambdaInsulation}
            onChange={e => setLambdaInsulation(parseFloat(e.target.value) || 0.035)}
            className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400" />
        </div>

        {/* Edge insulation */}
        <div>
          <label className="block font-semibold mb-1 text-gray-700">Edge Insulation</label>
          <select value={edgeType} onChange={e => setEdgeType(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400">
            <option value="none">None</option>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>

        {edgeType !== 'none' && (
          <>
            <div>
              <label className="block font-semibold mb-1 text-gray-700">Edge Depth (m)</label>
              <input type="number" step="0.1" value={edgeDepth}
                onChange={e => setEdgeDepth(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-gray-700">Edge R-value (m²K/W)</label>
              <input type="number" step="0.1" value={edgeRValue}
                onChange={e => setEdgeRValue(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400" />
            </div>
          </>
        )}
      </div>

      {/* Result + Apply */}
      <div className="mt-3 flex items-center gap-4">
        {uValue !== null ? (
          <>
            <div className="bg-white border-2 border-orange-400 rounded px-4 py-2 text-center">
              <div className="text-xs text-gray-500">Calculated U-value</div>
              <div className="text-2xl font-bold text-orange-700">{uValue.toFixed(3)}</div>
              <div className="text-xs text-gray-500">W/(m²·K)</div>
            </div>
            <div className="text-xs text-gray-500">
              {uValue <= 0.13 && <span className="text-green-700 font-semibold">✓ Meets Part L new build (≤0.13)</span>}
              {uValue > 0.13 && uValue <= 0.25 && <span className="text-blue-700 font-semibold">✓ Meets Part L existing (≤0.25)</span>}
              {uValue > 0.25 && <span className="text-red-600 font-semibold">✗ Does not meet Part L</span>}
            </div>
            <button
              onClick={() => onApply(parseFloat(uValue.toFixed(3)), length, width)}
              className="ml-auto bg-orange-600 text-white px-5 py-2 rounded hover:bg-orange-700 font-semibold text-sm transition"
            >
              Apply {uValue.toFixed(3)} W/(m²·K) → (area: {(length * width).toFixed(2)} m²)
            </button>
          </>
        ) : (
          <div className="text-xs text-gray-500 italic">Enter length and width to calculate</div>
        )}
      </div>
    </div>
  );
}
