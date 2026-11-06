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
import { parseEfficiencyPercentInput, fractionToPercentText } from '../../utils/mvhrEfficiency';

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
  // mvhrEff is the efficiency input TEXT (a percentage); the stored value is a
  // fraction, and utils/mvhrEfficiency does all conversion.
  //
  // When whole-house MVHR is NOT active the inputs start blank (initially and
  // on every re-sync, including straight after Remove), so the placeholders
  // show and the blank-field error keeps Apply disabled until the engineer
  // types a value. Typing 0 deliberately is still accepted. When it IS active
  // they show the stored values.
  const isWHMVHR = project.ventilationSystemType === 'mvhr';
  const storedRateText = () => (isWHMVHR ? (project.mvhrWholeHouseRate ?? 0) : '');
  const storedEffText  = () => (isWHMVHR ? fractionToPercentText(project.mvhrEfficiency ?? 0) : '');

  const [mvhrRate, setMvhrRate]       = useState(storedRateText);
  const [mvhrEff,  setMvhrEff]        = useState(storedEffText);
  const [applying, setApplying]       = useState(false);
  const [removing, setRemoving]       = useState(false);
  const busy = applying || removing;   // Apply/Re-apply and Remove are disabled while either runs
  // Outcome of the last apply / re-apply / remove: null | { ok, text }.
  // Shown below both panels, since a successful apply or remove switches panel.
  const [status,   setStatus]         = useState(null);

  // Sync local MVHR inputs when project reloads (e.g. after apply or on tab switch)
  // or whole-house MVHR is switched on or off.
  // Same pattern as DeltaTInput — useState initialisers only run on first mount.
  useEffect(() => {
    setMvhrRate(storedRateText());
    setMvhrEff(storedEffText());
  }, [isWHMVHR, project.mvhrWholeHouseRate, project.mvhrEfficiency]);

  // Parsed live, so the error or warning shows while typing and Apply is
  // disabled until the value is valid.
  const effParse = parseEfficiencyPercentInput(mvhrEff);

  // A blank field shows no red message (the placeholder prompts instead) but
  // still keeps Apply/Re-apply disabled via effParse.ok. Any non-blank invalid
  // entry shows its error live.
  const effBlank     = String(mvhrEff ?? '').trim() === '';

  // Active panel only: a STORED efficiency that fails its own check (e.g. a
  // B26 value of 85, shown as "8500") says so. Nothing is saved automatically,
  // and Apply stays disabled while the field still holds that value.
  const savedEffText   = storedEffText();   // '' when not active
  const effStoredError = isWHMVHR && !parseEfficiencyPercentInput(savedEffText).ok
    ? `The saved value (${savedEffText} %) is not valid. Enter the efficiency as a percentage, e.g. 85.`
    : null;
  // The field starts out showing the stored text, so it is only a draft once
  // the engineer changes it. A draft error takes priority over the stored one,
  // and a VALID draft supersedes the stored error entirely (no red while
  // Re-apply is enabled; the reload after Re-apply clears the stored problem).
  const effIsDraft    = String(mvhrEff ?? '').trim() !== savedEffText;
  const effDraftError = !effParse.ok && !effBlank && (effIsDraft || !effStoredError) ? effParse.error : null;
  const effValidDraft = effIsDraft && effParse.ok;
  const effShownError = effDraftError ?? (effValidDraft ? null : effStoredError);
  const effShowError  = !!effShownError;

  const effMessage = (
    <>
      {effShownError && <p className="text-xs text-red-600 mt-1">{effShownError}</p>}
      {effParse.ok && effParse.warning && <p className="text-xs text-amber-600 mt-1">⚠ {effParse.warning}</p>}
    </>
  );

  const showSuccess = (text) => {
    const shown = { ok: true, text };
    setStatus(shown);
    setTimeout(() => setStatus(cur => (cur === shown ? null : cur)), 3000);
  };

  // Anything other than an explicit success is reported as a failure, naming
  // what failed: "3 of 8 rooms", "the project setting", or both.
  const failureText = (result, verb, advice) => {
    if (result?.error) return `Not ${verb}: ${result.error}`;
    const parts = [];
    if (result?.failedRooms > 0)     parts.push(`${result.failedRooms} of ${result.totalRooms} rooms`);
    if (result?.designParamsFailed)  parts.push('the project setting');
    if (parts.length === 0) return `Not ${verb}: the save did not report success. ${advice}`;
    return `Not fully ${verb}: ${parts.join(' and ')} could not be saved. ${advice}`;
  };

  const handleApply = async () => {
    if (busy) return;
    const rate = parseFloat(mvhrRate) || 0;
    if (rate <= 0 || !effParse.ok) return;   // a blank or invalid efficiency is never sent
    const wasActive = isWHMVHR;
    setApplying(true);
    setStatus(null);
    let result;
    try {
      result = await onApplyMVHR(rate, effParse.fraction);
    } catch (error) {
      console.error('Apply whole-house MVHR failed:', error);
      result = { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    } finally {
      setApplying(false);
    }
    if (result?.ok === true) {
      showSuccess(wasActive ? '✓ Rates redistributed to all rooms' : '✓ Whole-house MVHR applied to all rooms');
    } else {
      setStatus({ ok: false, text: failureText(result, 'applied', 'Check the values and try again.') });
    }
  };

  const handleClear = async () => {
    if (busy) return;
    if (!window.confirm('Remove whole-house MVHR from all rooms? This resets continuous ventilation to "None" for every room.')) return;
    setRemoving(true);
    setStatus(null);
    let result;
    try {
      result = await onClearMVHR();
    } catch (error) {
      console.error('Remove whole-house MVHR failed:', error);
      result = { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    } finally {
      setRemoving(false);
    }
    if (result?.ok === true) {
      showSuccess('✓ Whole-house MVHR removed from all rooms');
    } else {
      setStatus({ ok: false, text: failureText(result, 'removed', 'Try again.') });
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
                hint="Manufacturer's stated thermal efficiency — typically 75–90 %"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="0.1" min="0" max="100"
                    value={mvhrEff}
                    onChange={e => setMvhrEff(e.target.value)}
                    aria-invalid={effShowError ? true : undefined}
                    className={inputClass + ' flex-1' + (effShowError ? ' border-red-500' : '')}
                    placeholder="e.g. 82"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">%</span>
                </div>
                {effMessage}
              </Field>
            </div>
            <button
              onClick={handleApply}
              disabled={busy || !mvhrRate || parseFloat(mvhrRate) <= 0 || !effParse.ok}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {applying ? 'Applying…' : 'Apply to all rooms'}
            </button>
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
                    project.mvhrEfficiency != null ? `${fractionToPercentText(project.mvhrEfficiency)}% efficiency` : '—'
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
                hint="Manufacturer's stated thermal efficiency — typically 75–90 %"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="0.1" min="0" max="100"
                    value={mvhrEff}
                    onChange={e => setMvhrEff(e.target.value)}
                    aria-invalid={effShowError ? true : undefined}
                    className={inputClass + ' flex-1' + (effShowError ? ' border-red-500' : '')}
                    placeholder="e.g. 82"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">%</span>
                </div>
                {effMessage}
              </Field>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                disabled={busy || !mvhrRate || parseFloat(mvhrRate) <= 0 || !effParse.ok}
                className="flex-1 py-2 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {applying ? 'Re-applying…' : 'Re-apply to all rooms'}
              </button>
              <button
                onClick={handleClear}
                disabled={busy}
                className="py-2 px-4 bg-white border border-red-300 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        )}

        {/* clearWholeHouseMVHR flips the project to 'natural' before saving, so
            the panel switches straight away and the Remove button (with its
            "Removing…" label) is gone; this line keeps the progress visible. */}
        {removing && (
          <p role="status" className="mt-2 text-xs font-medium text-center text-gray-600">
            Removing whole-house MVHR…
          </p>
        )}

        {status && (
          <p
            role={status.ok ? 'status' : 'alert'}
            className={'mt-2 text-xs font-medium text-center ' + (status.ok ? 'text-green-700' : 'text-red-600')}
          >
            {status.text}
          </p>
        )}
      </div>

    </div>
  );
}
