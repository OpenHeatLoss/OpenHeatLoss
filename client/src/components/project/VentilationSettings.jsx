// client/src/components/project/VentilationSettings.jsx
//
// Project-level ventilation settings for BS EN 12831-1:2017 / CIBSE DHDG 2026.
// Replaces SAPVentilationSettings.jsx.
//
// Used inside ProjectInfo.jsx in the same pattern as the Design Parameters
// section — onUpdate calls go directly to React state, persisted on main Save.
//
// Field names are camelCase throughout, matching App.jsx loadProject() mapping.

import { useState } from 'react';
import { estimateQ50SAP } from '../../utils/en12831Calculations';
import {
  SAP_STRUCTURAL_INFILTRATION,
  SAP_FLOOR_INFILTRATION,
  SAP_WINDOW_DOOR_INFILTRATION,
  BUILDING_SHIELDING_OPTIONS,
  REGIONAL_REFERENCE_TEMPS,
} from '../../utils/en12831VentilationData';

const inputClass  = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const selectClass = inputClass;

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm font-semibold mb-1">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

export default function VentilationSettings({ project, onUpdate, onUpdateBatch }) {
  const [showMethodInfo, setShowMethodInfo] = useState(false);

  const isMeasured = project.airPermeabilityMethod === 'measured';

  // Live q50 recalculates from current project fields on every render
  const effectiveQ50 = isMeasured
    ? (project.q50 ?? 12.0)
    : estimateQ50SAP({
        structural:       project.sapStructural       ?? 'masonry',
        floor:            project.sapFloor            ?? 'other',
        windowDraughtPct: project.sapWindowDraughtPct ?? 100,
        draughtLobby:     !!project.sapDraughtLobby,
        storeys:          project.buildingStoreys     ?? 2,
        shielding:        project.buildingShielding   ?? 'normal',
      }).q50;

  // When switching to measured, seed q50 with the current estimated value
  const handleMethodToggle = (method) => {
    if (method === 'measured') {
      onUpdateBatch({
        airPermeabilityMethod: 'measured',
        q50: parseFloat(effectiveQ50.toFixed(1)),
      });
    } else {
      onUpdate('airPermeabilityMethod', 'estimated');
    }
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
      {/* Air permeability method                                             */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1 mb-3">
          Air Permeability
        </h3>

        {/* Method toggle */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden mb-4 text-sm">
          {[
            { value: 'estimated', label: 'SAP Estimate',      sub: 'No test available' },
            { value: 'measured',  label: 'Measured / Tested', sub: 'Blower door or pulse test' },
          ].map(({ value, label, sub }) => (
            <button
              key={value}
              onClick={() => handleMethodToggle(value)}
              className={`flex-1 py-2 px-3 text-left transition ${
                project.airPermeabilityMethod === value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="font-semibold block">{label}</span>
              <span className={`text-xs ${project.airPermeabilityMethod === value ? 'text-blue-100' : 'text-gray-500'}`}>
                {sub}
              </span>
            </button>
          ))}
        </div>

        {isMeasured ? (
          /* Measured q50 */
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <Field
              label="Air permeability q₅₀"
              hint="From blower door or pulse test report, m³/(h·m²) at 50 Pa. Post-2006 homes: check EPC for result."
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="50"
                  value={project.q50 ?? 12}
                  onChange={e => onUpdate('q50', parseFloat(e.target.value) || 12)}
                  className={inputClass + ' flex-1'}
                />
                <span className="text-sm text-gray-600 whitespace-nowrap">m³/(h·m²)</span>
              </div>
            </Field>
            <p className="text-xs text-gray-500">
              If vents or fans were sealed during the test, background ventilation
              additions are still made at room level.
            </p>
          </div>
        ) : (
          /* SAP estimation inputs */
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <p className="text-xs text-gray-600">
              Air permeability estimated from the SAP 10.2 component method
              (CIBSE DHDG 2026 Tables 2-11 to 2-15). Summed ACH additions are
              converted to q₅₀ using the shielding and height factors below.
            </p>
            <div className="grid grid-cols-2 gap-4">

              <Field label="Primary construction" hint="Dominant wall construction type">
                <select
                  value={project.sapStructural ?? 'masonry'}
                  onChange={e => onUpdate('sapStructural', e.target.value)}
                  className={selectClass}
                >
                  {Object.entries(SAP_STRUCTURAL_INFILTRATION).map(([k, v]) => (
                    <option key={k} value={k}>{v.label} ({v.ach} ACH)</option>
                  ))}
                </select>
              </Field>

              <Field label="Ground floor type" hint="Unsealed suspended timber floors add significant infiltration">
                <select
                  value={project.sapFloor ?? 'other'}
                  onChange={e => onUpdate('sapFloor', e.target.value)}
                  className={selectClass}
                >
                  {Object.entries(SAP_FLOOR_INFILTRATION).map(([k, v]) => (
                    <option key={k} value={k}>{v.label} ({v.ach} ACH)</option>
                  ))}
                </select>
              </Field>

              <Field
                label="Windows & doors draught-proofed"
                hint="Draught-proofed = installed within 10 years by FENSA-approved installer"
              >
                <select
                  value={project.sapWindowDraughtPct ?? 100}
                  onChange={e => onUpdate('sapWindowDraughtPct', parseInt(e.target.value))}
                  className={selectClass}
                >
                  {Object.keys(SAP_WINDOW_DOOR_INFILTRATION).map(pct => (
                    <option key={pct} value={pct}>{pct}%</option>
                  ))}
                </select>
              </Field>

              <Field
                label="Draught lobby at main entrance?"
                hint="Enclosed space ≥ 2 m² with two doors forming an airlock"
              >
                <select
                  value={project.sapDraughtLobby ? 'yes' : 'no'}
                  onChange={e => onUpdate('sapDraughtLobby', e.target.value === 'yes' ? 1 : 0)}
                  className={selectClass}
                >
                  <option value="no">No draught lobby</option>
                  <option value="yes">Draught lobby present</option>
                </select>
              </Field>

            </div>
          </div>
        )}

        {/* Effective q50 — always visible */}
        <div className="mt-3 flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
          <div>
            <span className="text-sm font-semibold text-gray-700">Effective q₅₀</span>
            <span className="text-xs text-gray-500 ml-2">
              {isMeasured ? 'from test — used directly in calculation' : 'SAP estimate — intermediate value, see note below'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold text-blue-600">{effectiveQ50.toFixed(1)}</span>
            <span className="text-sm text-gray-500 ml-1">m³/(h·m²)</span>
          </div>
        </div>
        {!isMeasured && (
          <p className="text-xs text-gray-500 mt-1">
            Note: when using the SAP estimate, shielding affects q₅₀ and the 50 Pa→typical conversion in opposite directions — they largely cancel for 1–2 storey buildings. The q₅₀ figure above will vary with shielding choice but room ventilation heat loss will be very similar. If you switch to a measured q₅₀ from a blower door test, shielding then only affects the 50 Pa→typical conversion and has its expected effect.
          </p>
        )}
        {isMeasured && effectiveQ50 > 15 && (
          <p className="text-xs text-amber-600 mt-1">
            ⚠ Measured q₅₀ above 15 — unusually high for a modern building. Double-check the test report units (should be m³/(h·m²) at 50 Pa, not ACH).
          </p>
        )}
      </div>

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
            hint="Affects both the ACH→q₅₀ conversion (Table 2-15) and the q₅₀→typical leakage conversion (Table 2-17). The two effects largely cancel for 1–2 storey buildings, so the displayed q₅₀ will vary with shielding but room heat loss will be similar. Shielding has more impact on taller buildings."
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
            hint="Used for height band in Table 2-15 / 2-17 and SAP storey addition"
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
      {/* Reference temperature                                               */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1 mb-3">
          Reference Temperature (Te,ref)
        </h3>
        <p className="text-xs text-gray-600 mb-3">
          Mean annual external temperature for this region (MCS MGD007 Table B1).
          Used for the typical temperature-weighted factors — feeds the generator
          modulation / oversizing check (CIBSE DHDG 2026 section 5.7.2).
        </p>
        <div className="grid grid-cols-2 gap-4">

          <Field label="Climate region">
            <select
              className={selectClass}
              value={
                Object.entries(REGIONAL_REFERENCE_TEMPS).find(
                  ([, v]) => v.annualMean === (project.referenceTemp ?? 10.6)
                )?.[0] ?? 'severn_valley'
              }
              onChange={e => {
                const region = REGIONAL_REFERENCE_TEMPS[e.target.value];
                if (region) onUpdate('referenceTemp', region.annualMean);
              }}
            >
              {Object.entries(REGIONAL_REFERENCE_TEMPS).map(([k, v]) => (
                <option key={k} value={k}>{v.label} — {v.annualMean}°C</option>
              ))}
            </select>
          </Field>

          <Field
            label="Te,ref (°C)"
            hint="Override if using custom climate data"
          >
            <input
              type="number"
              step="0.1"
              value={project.referenceTemp ?? 10.6}
              onChange={e => onUpdate('referenceTemp', parseFloat(e.target.value) || 10.6)}
              className={inputClass}
            />
          </Field>

        </div>
      </div>

    </div>
  );
}
