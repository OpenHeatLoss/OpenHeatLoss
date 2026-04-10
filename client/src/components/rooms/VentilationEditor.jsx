// client/src/components/rooms/VentilationEditor.jsx
//
// Room-level ventilation inputs for BS EN 12831-1:2017 / CIBSE DHDG 2026.
//
// Architecture note:
//   updateRoom in App.jsx calls api.updateRoom then loadProject on every change,
//   causing a server round-trip that resets state mid-interaction. To prevent
//   this breaking checkboxes, dropdowns, and +/- buttons (as well as typed inputs),
//   this component holds all ventilation fields in local state and only calls
//   onUpdate (triggering the server) when an interaction is fully complete:
//     - Typed number inputs: on blur
//     - Checkboxes, dropdowns, +/- buttons: immediately but via local state first,
//       so the UI responds instantly and the server catches up in the background

import { useState, useEffect } from 'react';
import { calculateRoomVentilationEN12831 } from '../../utils/en12831Calculations';
import { CONTINUOUS_VENT_TYPES } from '../../utils/en12831VentilationData';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const Field = ({ label, hint, children, className = '' }) => (
  <div className={className}>
    <label className="block text-sm font-semibold mb-1">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VentilationEditor({ room, project, onUpdate }) {
  const [showEnvelopeHelp, setShowEnvelopeHelp] = useState(false);
  const [showBgVentHelp,   setShowBgVentHelp]   = useState(false);

  // Local state mirrors all ventilation fields from the room prop.
  // This lets the UI respond instantly while the server catches up.
  const [local, setLocal] = useState({
    exposedEnvelopeM2:    room.exposedEnvelopeM2    ?? 0,
    hasSuspendedFloor:    room.hasSuspendedFloor    ?? 0,
    isTopStorey:          room.isTopStorey           ?? 0,
    bgVentCount:          room.bgVentCount           ?? 0,
    bgFanCount:           room.bgFanCount            ?? 0,
    bgFlueSmallCount:     room.bgFlueSmallCount      ?? 0,
    bgFlueLargeCount:     room.bgFlueLargeCount      ?? 0,
    bgOpenFireCount:      room.bgOpenFireCount       ?? 0,
    continuousVentType:   room.continuousVentType    ?? 'none',
    continuousVentRateM3h:room.continuousVentRateM3h ?? 0,
    mvhrEfficiency:       room.mvhrEfficiency        ?? 0,
  });

  // Keep local in sync if the room prop changes from outside
  // (e.g. after a save reloads the project)
  // room.id covers switching rooms; exposedEnvelopeM2 covers the envelope
  // auto-recalculation triggered by element checkbox changes in ElementEditor.
  useEffect(() => {
    setLocal({
      exposedEnvelopeM2:    room.exposedEnvelopeM2    ?? 0,
      hasSuspendedFloor:    room.hasSuspendedFloor    ?? 0,
      isTopStorey:          room.isTopStorey           ?? 0,
      bgVentCount:          room.bgVentCount           ?? 0,
      bgFanCount:           room.bgFanCount            ?? 0,
      bgFlueSmallCount:     room.bgFlueSmallCount      ?? 0,
      bgFlueLargeCount:     room.bgFlueLargeCount      ?? 0,
      bgOpenFireCount:      room.bgOpenFireCount       ?? 0,
      continuousVentType:   room.continuousVentType    ?? 'none',
      continuousVentRateM3h:room.continuousVentRateM3h ?? 0,
      mvhrEfficiency:       room.mvhrEfficiency        ?? 0,
    });
  }, [room.id, room.exposedEnvelopeM2]); // re-sync on room switch or external envelope update

  // Update local state immediately, then persist to server
  const handleDiscreteChange = (field, value) => {
    setLocal(prev => ({ ...prev, [field]: value }));
    onUpdate(field, value);
  };

  // For typed number inputs: update local state on every keystroke (so the
  // input doesn't reset), but only call onUpdate on blur
  const handleNumberChange = (field, value) => {
    setLocal(prev => ({ ...prev, [field]: value }));
  };

  const handleNumberBlur = (field) => {
    const value = local[field];
    const safe  = parseFloat(value);
    const final = isNaN(safe) ? 0 : safe;
    setLocal(prev => ({ ...prev, [field]: final }));
    onUpdate(field, final);
  };

  // Build a room-like object from local state for the live calculation,
  // so the audit panel reflects what's in the inputs right now
  const roomForCalc = { ...room, ...local };

  const isEN12831  = (project?.ventilationMethod ?? 'en12831_cibse2026') === 'en12831_cibse2026';
  const calcResult = isEN12831 && project
    ? calculateRoomVentilationEN12831(roomForCalc, project)
    : null;

  const inputClass = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">

      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
        <h3 className="text-sm font-semibold text-gray-700">Ventilation (EN 12831-1 / CIBSE 2026)</h3>
      </div>

      <div className="p-4 space-y-5">

        {/* ---------------------------------------------------------------- */}
        {/* Exposed envelope                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-semibold">Exposed Envelope Area (m²)</label>
            <button
              onClick={() => setShowEnvelopeHelp(v => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              {showEnvelopeHelp ? 'Hide help' : 'How to measure'}
            </button>
          </div>

          {showEnvelopeHelp && (
            <div className="bg-blue-50 border border-blue-100 rounded p-3 mb-2 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Exposed envelope = all surfaces through which air can infiltrate:</p>
              <ul className="space-y-0.5 ml-3">
                <li>• <strong>External walls</strong> — gross area (do not subtract windows or doors)</li>
                <li>• <strong>Walls adjoining unheated spaces</strong> — e.g. unheated garage, bin store</li>
                <li>• <strong>Suspended ground floor</strong> — tick the Env. checkbox on the floor element</li>
                <li>• <strong>Top storey ceiling / roof</strong> — tick the Env. checkbox on the roof element</li>
              </ul>
              <p className="mt-1">
                Tick the <strong>Env.</strong> checkbox on each element in the table above to include it.
                The total updates automatically. You can override the value manually below if needed.
              </p>
              <p className="text-blue-600 mt-1">Source: CIBSE DHDG 2026 section 2.5.4.2 / BS EN 12831-1:2017</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.1"
              min="0"
              value={local.exposedEnvelopeM2}
              onChange={e => handleNumberChange('exposedEnvelopeM2', e.target.value)}
              onBlur={() => handleNumberBlur('exposedEnvelopeM2')}
              className={inputClass + ' flex-1'}
            />
            <span className="text-sm text-gray-500 whitespace-nowrap">m²</span>
          </div>

          <p className="text-xs text-gray-500 mt-1">
            Auto-calculated from elements with the Env. checkbox ticked. Edit manually to override.
          </p>

          {local.exposedEnvelopeM2 === 0 && (room.volume ?? 0) > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              ⚠ Exposed envelope is 0 — ventilation heat loss will be zero. Tick the Env. checkbox on external wall elements above.
            </p>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Background ventilation additions (Table 2-16)                    */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Background Ventilation (Table 2-16)</span>
            <button
              onClick={() => setShowBgVentHelp(v => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              {showBgVentHelp ? 'Hide' : 'What counts?'}
            </button>
          </div>

          {showBgVentHelp && (
            <div className="bg-blue-50 border border-blue-100 rounded p-3 mb-2 text-xs text-blue-800 space-y-1">
              <p>
                The m³/h values below are <strong>equivalent leakage additions at 50 Pa</strong> — a standardised
                test pressure used to characterise openings consistently, not a real-world flow rate.
                They are added to the envelope leakage (exposed area × q50) and the combined total
                is then multiplied by a conversion factor (typically 0.05 for normal shielding, 1–2 storeys)
                to give the approximate leakage rate at typical wind pressure. This is why 2 trickle
                vents at 54 m³/h each does not produce 108 m³/h in the result below — the actual
                contribution at typical pressure is 108 × 0.05 = 5.4 m³/h from those vents alone,
                plus the envelope leakage. Note: the conversion factor varies with shielding —
                0.03 (intensive), 0.05 (normal), 0.07 (none) — so results will differ from this
                example if your building shielding setting is not 'normal'.
              </p>
              <ul className="space-y-0.5 ml-3 mt-1">
                <li>• <strong>Vent / trickle vent</strong> — fixed or controllable, not part of a mechanical system (54 m³/h at 50 Pa)</li>
                <li>• <strong>Intermittent extract fan</strong> — non-sealing, properly controlled (54 m³/h at 50 Pa when not running)</li>
                <li>• <strong>Flue &lt;200 mm</strong> — unconnected flue, diameter under 200 mm (109 m³/h at 50 Pa)</li>
                <li>• <strong>Flue ≥200 mm</strong> — unconnected flue, diameter 200 mm or more (435 m³/h at 50 Pa)</li>
                <li>• <strong>Open fire / blocked flue</strong> — (109 m³/h at 50 Pa)</li>
              </ul>
              <p className="text-blue-600 mt-1">Source: CIBSE DHDG 2026 Table 2-16 / SAP 10.2</p>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg px-3 py-1">
            <p className="text-xs text-gray-500 px-1 pt-2 pb-1">
              Values are equivalent leakage additions at 50 Pa test pressure (CIBSE Table 2-16).
              They are converted to typical-pressure flow rates in the calculation below —
              not directly comparable to the leakage rate shown in the audit panel.
            </p>
            {[
              { field: 'bgVentCount',      label: 'Vents / trickle vents',                  hint: '54 m³/h each at 50 Pa' },
              { field: 'bgFanCount',       label: 'Intermittent extract fans (non-sealing)', hint: '54 m³/h each at 50 Pa' },
              { field: 'bgFlueSmallCount', label: 'Unconnected flues < 200 mm',              hint: '109 m³/h each at 50 Pa' },
              { field: 'bgFlueLargeCount', label: 'Unconnected flues ≥ 200 mm',              hint: '435 m³/h each at 50 Pa' },
              { field: 'bgOpenFireCount',  label: 'Open fires / blocked flues',              hint: '109 m³/h each at 50 Pa' },
            ].map(({ field, label, hint }) => (
              <div key={field} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <span className="text-xs text-gray-500 ml-2">({hint})</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDiscreteChange(field, Math.max(0, (local[field] ?? 0) - 1))}
                    className="w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg leading-none"
                  >−</button>
                  <span className="w-6 text-center text-sm font-semibold">{local[field] ?? 0}</span>
                  <button
                    onClick={() => handleDiscreteChange(field, (local[field] ?? 0) + 1)}
                    className="w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg leading-none"
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Continuous mechanical ventilation                                 */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <Field
            label="Continuous mechanical ventilation"
            hint="Intermittent extract fans are entered above — only list continuous systems here"
          >
            <select
              value={local.continuousVentType}
              onChange={e => handleDiscreteChange('continuousVentType', e.target.value)}
              className={inputClass}
            >
              {Object.entries(CONTINUOUS_VENT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Field>

          {local.continuousVentType === 'mev' && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
              <p className="font-semibold">⚠ Unbalanced continuous extract — outside method scope</p>
              <p className="mt-1">
                Rooms with continuous unbalanced mechanical extract ventilation are not suitable
                for the CIBSE 2026 reduced method. A fully BS EN 12831-1 compliant tool should
                be used for this room. The ventilation heat loss for this room will exclude the
                continuous ventilation contribution.
              </p>
            </div>
          )}

          {(local.continuousVentType === 'mev' || local.continuousVentType === 'mvhr') && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field
                label="Supply / extract rate (m³/h)"
                hint="From ventilation system designer or manufacturer"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={local.continuousVentRateM3h}
                    onChange={e => handleNumberChange('continuousVentRateM3h', e.target.value)}
                    onBlur={() => handleNumberBlur('continuousVentRateM3h')}
                    className={inputClass + ' flex-1'}
                  />
                  <span className="text-sm text-gray-500">m³/h</span>
                </div>
              </Field>

              {local.continuousVentType === 'mvhr' && (
                <Field
                  label="Heat recovery efficiency"
                  hint="From manufacturer data — typically 0.75–0.90"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="0.95"
                      value={local.mvhrEfficiency}
                      onChange={e => handleNumberChange('mvhrEfficiency', e.target.value)}
                      onBlur={() => handleNumberBlur('mvhrEfficiency')}
                      className={inputClass + ' flex-1'}
                    />
                    <span className="text-sm text-gray-500">fraction</span>
                  </div>
                </Field>
              )}
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Live calculation audit panel                                      */}
        {/* ---------------------------------------------------------------- */}
        {calcResult && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Ventilation heat loss breakdown
            </p>

            <div className="text-xs text-gray-500 space-y-0.5">
              <div className="flex justify-between">
                <span>Approx. room leakage rate (at typical pressure)</span>
                <span className="font-mono">
                  {calcResult.stages.leakage.approximateRoomLeakageRate.toFixed(1)} m³/h
                </span>
              </div>
              {calcResult.stages.leakage.belowMinimum && (
                <p className="text-amber-600 font-medium">
                  ⚠ Calculated leakage rate is below the EN 12831-1 Table B.7 minimum
                  ({calcResult.stages.leakage.minimumRoomLeakageRate.toFixed(1)} m³/h / 0.5 ACH) —
                  the minimum rate is used for heat loss purposes. This does not indicate a Building
                  Regulations ventilation compliance issue. Ventilation adequacy should be considered separately.
                </p>
              )}
            </div>

            <div className="border-t border-gray-200 pt-2 space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-600">Emitter sizing (incl. orientation ×2)</span>
                <span className="text-sm font-bold text-blue-700">
                  {calcResult.ventEmitter.toFixed(0)} W
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-600">Generator rated output component</span>
                <span className="text-sm font-semibold text-gray-700">
                  {calcResult.ventGeneratorDesign.toFixed(0)} W
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-600">
                  Generator typical load (Te,ref = {project.referenceTemp ?? 10.6}°C)
                </span>
                <span className="text-sm font-semibold text-gray-500">
                  {calcResult.ventGeneratorTypical.toFixed(0)} W
                </span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
