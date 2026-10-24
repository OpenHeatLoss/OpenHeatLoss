// client/src/components/project/VentilationSettings.jsx
//
// Project-level ventilation settings for BS EN 12831-1:2017 / CIBSE DHDG 2026.
// Replaces SAPVentilationSettings.jsx.
//
// Used inside ProjectInfo.jsx in the same pattern as the Design Parameters
// section — onUpdate calls go directly to React state, persisted on main Save.
//
// Field names are camelCase throughout, matching App.jsx loadProject() mapping.

import { useState, useEffect } from 'react';
import { BUILDING_SHIELDING_OPTIONS } from '../../utils/en12831VentilationData';
import AirPermeabilitySettings from './AirPermeabilitySettings';

const inputClass  = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const selectClass = inputClass;

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm font-semibold mb-1">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

export default function VentilationSettings({ project, onUpdate, onUpdateBatch, onSaveDesignParams, onApplyMVHR, onClearMVHR }) {
  const [showMethodInfo, setShowMethodInfo] = useState(false);

  // Local state for the whole-house MVHR inputs so they don't round-trip
  // through the server on every keystroke. Applied only when the engineer
  // clicks "Apply to all rooms".
  const isWHMVHR = project.ventilationSystemType === 'mvhr';
  const [mvhrRate, setMvhrRate]       = useState(project.mvhrWholeHouseRate ?? 0);
  const [mvhrEff,  setMvhrEff]        = useState(project.mvhrEfficiency ?? 0);
  const [applying, setApplying]       = useState(false);
  const [applied,  setApplied]        = useState(false);

  // Sync local MVHR inputs when project reloads (e.g. after apply or on tab switch).
  // Same pattern as DeltaTInput — useState initialisers only run on first mount.
  useEffect(() => {
    setMvhrRate(project.mvhrWholeHouseRate ?? 0);
    setMvhrEff(project.mvhrEfficiency ?? 0);
  }, [project.mvhrWholeHouseRate, project.mvhrEfficiency]);

  const handleApply = async () => {
    const rate = parseFloat(mvhrRate) || 0;
    const eff  = parseFloat(mvhrEff)  || 0;
    if (rate <= 0) return;
    setApplying(true);
    setApplied(false);
    await onApplyMVHR(rate, eff);
    setApplying(false);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  const handleClear = async () => {
    if (!window.confirm('Remove whole-house MVHR from all rooms? This resets continuous ventilation to "None" for every room.')) return;
    await onClearMVHR();
  };

  return (
    <div className="space-y-6">

      {/* ------------------------------------------------------------------ */}
      {/* Compliance badge                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-blue-900">
            BS EN 12831-1:2017 — CIBSE DHDG 2026 Reduced Method
          </p>
          <p className="text-xs text-blue-700 mt-0.5">
            MCS MIS 3005-D compliant from April 2025 · Scope: domestic UK,
            naturally ventilated or balanced mechanical ventilation, all combustion appliances room-sealed
          </p>
        </div>
        <button
          onClick={() => setShowMethodInfo(v => !v)}
          className="shrink-0 text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
        >
          {showMethodInfo ? 'Less' : 'About this method'}
        </button>
      </div>

      {showMethodInfo && (
        <div className="bg-white border border-blue-100 rounded-lg p-4 text-sm text-gray-700 space-y-2">
          <p>
            This tool uses the reduced implementation of BS EN 12831-1 as specified in the
            CIBSE Domestic Heating Design Guide 2026 (section 2.5.4). Building air permeability
            set here feeds into every room's ventilation heat loss calculation.
          </p>
          <p>Three figures are produced per room:</p>
          <ul className="space-y-1 ml-4 text-sm">
            <li><strong>Emitter / pipework sizing</strong> — uses an orientation factor of ×2 on the
              leakage term, accounting for the windward room being at peak infiltration load.</li>
            <li><strong>Generator rated output</strong> — no orientation factor; the generator does
              not need to cover every room simultaneously at peak windward infiltration.</li>
            <li><strong>Generator typical load</strong> — at mean annual outdoor temperature (Te,ref
              below); used to verify the generator modulation range avoids short-cycling (section 5.7.2).</li>
          </ul>
          <p className="text-xs text-gray-500 mt-1">
            Properties with whole-house unbalanced mechanical extract ventilation are outside
            the scope of this method.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Air permeability (B25 commit 4 — see AirPermeabilitySettings.jsx)    */}
      {/* ------------------------------------------------------------------ */}
      <AirPermeabilitySettings
        project={project}
        onUpdate={onUpdate}
        onUpdateBatch={onUpdateBatch}
        onSaveDesignParams={onSaveDesignParams}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Building characteristics                                            */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1 mb-3">
          Building Characteristics
        </h3>
        <div className="grid grid-cols-2 gap-4">

          <Field
            label="Building shielding"
            hint="Affects the conversion from air permeability at 50 Pa to typical leakage (Table 2-13). Changing shielding or the number of storeys changes room ventilation heat loss."
          >
            <select
              value={project.buildingShielding ?? 'normal'}
              onChange={e => onUpdate('buildingShielding', e.target.value)}
              className={selectClass}
            >
              {Object.entries(BUILDING_SHIELDING_OPTIONS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Field>

          <Field
            label="Number of storeys"
            hint="Used for the height band in Table 2-13."
          >
            <input
              type="number"
              min="1"
              max="6"
              value={project.buildingStoreys ?? 2}
              onChange={e => onUpdate('buildingStoreys', parseInt(e.target.value) || 2)}
              className={inputClass}
            />
          </Field>

        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Whole-house MVHR                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1 mb-3">
          Whole-House MVHR
        </h3>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-xs text-blue-800 space-y-1">
          <p>
            Whole-house MVHR is outside the formal scope of the CIBSE DHDG 2026 reduced method,
            which is designed for naturally ventilated dwellings. OpenHeatLoss handles it by applying
            BS EN 12831-1:2017 §6.3.3 (Equation 2.4) directly: supply air temperature is calculated
            per room from the outdoor design temperature and the system's heat recovery efficiency,
            and the total system rate is distributed to rooms in proportion to their volume.
          </p>
          <p>
            This is a documented deviation — appropriate for new builds and deep retrofits where
            whole-house MVHR is specified. Engineers with a room-by-room duct schedule can override
            individual room rates in the room ventilation editor.
          </p>
        </div>

        {!isWHMVHR ? (
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <p className="text-sm text-gray-600">
              No whole-house MVHR configured. Enter system details below and click
              "Apply to all rooms" to distribute the supply rate by room volume.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Total system supply rate"
                hint="From the ventilation system designer's duct schedule or manufacturer's commissioning data"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="10" min="0"
                    value={mvhrRate}
                    onChange={e => setMvhrRate(e.target.value)}
                    className={inputClass + ' flex-1'}
                    placeholder="e.g. 200"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">m³/h</span>
                </div>
              </Field>
              <Field
                label="Heat recovery efficiency"
                hint="Manufacturer's stated thermal efficiency — typically 0.75–0.90"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="0.01" min="0" max="0.95"
                    value={mvhrEff}
                    onChange={e => setMvhrEff(e.target.value)}
                    className={inputClass + ' flex-1'}
                    placeholder="e.g. 0.82"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">fraction</span>
                </div>
              </Field>
            </div>
            <button
              onClick={handleApply}
              disabled={applying || !mvhrRate || parseFloat(mvhrRate) <= 0}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {applying ? 'Applying…' : 'Apply to all rooms'}
            </button>
            {applied && (
              <p className="text-xs text-green-700 font-medium text-center">
                ✓ Whole-house MVHR applied to all rooms
              </p>
            )}
          </div>
        ) : (
          <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-green-800">
                  ✓ Whole-house MVHR active
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  {project.mvhrWholeHouseRate ?? '—'} m³/h total · {
                    project.mvhrEfficiency ? `${(project.mvhrEfficiency * 100).toFixed(0)}% efficiency` : '—'
                  } · distributed to rooms by volume
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Update total rate"
                hint="Change and re-apply to redistribute to rooms"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="10" min="0"
                    value={mvhrRate}
                    onChange={e => setMvhrRate(e.target.value)}
                    className={inputClass + ' flex-1'}
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">m³/h</span>
                </div>
              </Field>
              <Field
                label="Update efficiency"
                hint="Change and re-apply"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="0.01" min="0" max="0.95"
                    value={mvhrEff}
                    onChange={e => setMvhrEff(e.target.value)}
                    className={inputClass + ' flex-1'}
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">fraction</span>
                </div>
              </Field>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                disabled={applying}
                className="flex-1 py-2 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {applying ? 'Re-applying…' : 'Re-apply to all rooms'}
              </button>
              <button
                onClick={handleClear}
                className="py-2 px-4 bg-white border border-red-300 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition"
              >
                Remove
              </button>
            </div>
            {applied && (
              <p className="text-xs text-green-700 font-medium text-center">
                ✓ Rates redistributed to all rooms
              </p>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
