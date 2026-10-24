// client/src/components/project/Q50CandidatePicker.jsx
//
// Table 2-11 candidate picker, shared by both air permeability flows
// (AirPermeabilitySettings.jsx). Four candidate cards — Built form, Age band,
// Wall construction, All dwellings — each with its own category dropdown and
// Mean + Q1/median/Q3, one "Use this candidate" radio per card, and one
// statistic radio group.
//
// mode 'select'         default_table projects. A complete pick (candidate +
//                       statistic) goes straight into project state via
//                       onUpdateBatch; the normal Save path saves it.
// mode 'update-legacy'  legacy_sap projects. Nothing reaches the project until
//                       Review → Confirm, which saves immediately.
//
// Selection rule (server COALESCE cannot clear category columns): the project
// only ever receives a COMPLETE selection from q50PickerUpdate →
// buildQ50SelectionUpdate — a basis with its category (or All dwellings),
// the other two category fields cleared. Categories chosen in the other
// columns stay local for comparison and are never written.
//
// All pure logic lives in utils/q50Selection.js.

import { useState, useEffect } from 'react';
import {
  Q50_TABLE_2_11,
  Q50_CATEGORY_FIELD,
  Q50_BASIS_OPTIONS,
  Q50_CATEGORY_LABELS,
  Q50_STATISTICS,
  Q50_STATISTIC_OPTIONS,
} from '../../utils/en12831VentilationData';
import {
  q50Candidate,
  Q50_PICKER_BASES,
  initialQ50Picker,
  q50PickerView,
  q50PickerColumnReady,
  q50PickerChange,
  q50PickerApply,
  q50PickerUpdate,
  q50CategoryOptionLabel,
  airPermeabilitySnapshot,
  ventilationTotalsChange,
  formatSignedKW,
} from '../../utils/q50Selection';

const selectClass = 'w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent';

const categoryLabel = (basis, category) => Q50_CATEGORY_LABELS[basis]?.[category] ?? category;

// "Change vs. when this project was opened" — the opened snapshot against
// candidateFields. Hidden when there is nothing reliable to show (no
// snapshot, no rooms, not the EN 12831 method).
export const OpenedChangeReadout = ({ project, candidateFields, boxed = true }) => {
  const change = project.airPermeabilityAtOpen && candidateFields
    ? ventilationTotalsChange(project, project.airPermeabilityAtOpen, candidateFields)
    : null;
  if (!change) return null;
  return (
    <div className={boxed ? 'bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700' : 'text-xs text-gray-700'}>
      <p className="font-semibold">Change vs. when this project was opened</p>
      <p className="mt-0.5">
        Generator <strong>{formatSignedKW(change.generatorDeltaW)}</strong> · Emitter <strong>{formatSignedKW(change.emitterDeltaW)}</strong>
        <span className="text-gray-600"> (q₅₀ {change.baselineQ50.toFixed(1)} → {change.candidateQ50.toFixed(1)})</span>
      </p>
    </div>
  );
};

// Q1 / median / Q3, body-text size, numbers heavier than their labels.
const Spread = ({ candidate }) => (
  <p className="text-sm text-gray-700">
    Q1 <span className="font-semibold text-gray-900">{candidate.q1.toFixed(1)}</span>
    {' · '}median <span className="font-semibold text-gray-900">{candidate.median.toFixed(1)}</span>
    {' · '}Q3 <span className="font-semibold text-gray-900">{candidate.q3.toFixed(1)}</span>
  </p>
);

// One card. Top to bottom: title, category dropdown, bold Mean, spread,
// space, "Use this candidate" radio (pinned to the bottom so the radios line
// up across cards of different heights).
const CandidateCard = ({ basis, view, radioName, onChange }) => {
  const isAll     = basis === 'all_dwellings';
  const category  = isAll ? null : view.categories[basis];
  const candidate = isAll ? q50Candidate('all_dwellings') : (category ? q50Candidate(basis, category) : null);
  const picked    = view.pickedBasis === basis;
  const ready     = q50PickerColumnReady(view, basis);

  return (
    <div className={`flex flex-col border rounded-lg p-3 ${picked ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-300 bg-white'}`}>
      <p className="text-sm font-semibold text-gray-800 mb-2">{Q50_BASIS_OPTIONS[basis].label}</p>

      {isAll ? (
        <p className="text-sm text-gray-700 py-2">No category needed</p>
      ) : (
        <select
          value={category ?? ''}
          onChange={e => onChange({ category: [basis, e.target.value] })}
          className={selectClass}
          aria-label={`${Q50_BASIS_OPTIONS[basis].label} category`}
        >
          {/* The picked column always keeps a category, so no blank option there. */}
          {!(picked && category) && <option value="">Select…</option>}
          {Object.keys(Q50_TABLE_2_11[basis]).map(k => (
            <option key={k} value={k}>{q50CategoryOptionLabel(basis, k, view.statistic)}</option>
          ))}
        </select>
      )}

      <div className="mt-2 space-y-0.5">
        {candidate ? (
          <>
            <p className="text-sm text-gray-800">Mean <strong className="text-lg text-gray-900">{candidate.mean.toFixed(1)}</strong></p>
            <Spread candidate={candidate} />
          </>
        ) : (
          <p className="text-sm text-gray-600">No category chosen</p>
        )}
      </div>

      <label className={`mt-auto pt-3 flex items-center gap-2 text-sm ${ready ? 'text-gray-800 cursor-pointer' : 'text-gray-500'}`}>
        <input
          type="radio"
          name={radioName}
          checked={picked}
          disabled={!ready}
          onChange={() => onChange({ pick: basis })}
        />
        Use this candidate
      </label>
    </div>
  );
};

const StatisticChoice = ({ view, radioName, onChange }) => (
  <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-800">
    <legend className="text-sm font-semibold text-gray-800 mb-1">Statistic</legend>
    {Q50_STATISTICS.map(k => (
      <label key={k} className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="radio"
          name={radioName}
          checked={view.statistic === k}
          onChange={() => onChange({ statistic: k })}
        />
        {Q50_STATISTIC_OPTIONS[k].label}
      </label>
    ))}
  </fieldset>
);

const Cards = ({ view, radioName, onChange }) => (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {Q50_PICKER_BASES.map(basis => (
        <CandidateCard key={basis} basis={basis} view={view} radioName={`${radioName}-candidate`} onChange={onChange} />
      ))}
    </div>
    <StatisticChoice view={view} radioName={`${radioName}-statistic`} onChange={onChange} />
  </>
);

// What is still needed before a pick applies, or null when complete.
const pendingHint = (view) =>
  !view.pickedBasis && !view.statistic ? null
  : !view.pickedBasis ? 'Pick “Use this candidate” on one card to apply this.'
  : !view.statistic   ? 'Choose a statistic to apply this candidate.'
  : null;

const selectionText = (update) =>
  `${Q50_BASIS_OPTIONS[update.q50SelectionBasis].label}` +
  (update.q50SelectionBasis === 'all_dwellings' ? '' : `: ${categoryLabel(update.q50SelectionBasis, update[Q50_CATEGORY_FIELD[update.q50SelectionBasis]])}`) +
  `, ${Q50_STATISTIC_OPTIONS[update.q50Statistic].label}`;

// ---------------------------------------------------------------------------
// mode 'select'
// ---------------------------------------------------------------------------
const SelectPicker = ({ project, onUpdateBatch }) => {
  const [local, setLocal] = useState(initialQ50Picker);
  useEffect(() => { setLocal(initialQ50Picker()); }, [project.id]);

  // The project's own selection is laid over the local state, so the
  // selected card and statistic always show what the calculation uses.
  const view = q50PickerView(local, project);

  const onChange = (change) => {
    const { state, update } = q50PickerApply(view, change, project);
    setLocal(state);
    if (update) onUpdateBatch(update);
  };

  const hint = pendingHint(view);
  return (
    <div className="space-y-4">
      <Cards view={view} radioName={`q50-select-${project.id}`} onChange={onChange} />
      {hint && <p className="text-sm text-gray-700">{hint} Until then the current value stays in use.</p>}
      <OpenedChangeReadout project={project} candidateFields={airPermeabilitySnapshot(project)} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// mode 'update-legacy'
// ---------------------------------------------------------------------------
const LegacyUpdatePicker = ({ project, onClose, onUpdateBatch, onSaveDesignParams }) => {
  const [view, setView]     = useState(initialQ50Picker);   // nothing preselected
  const [step, setStep]     = useState('choose');          // 'choose' | 'confirm'
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const update = q50PickerUpdate(view);
  const oldQ50 = project.q50;
  const onChange = (change) => setView(s => q50PickerChange(s, change));

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      // Save first; only update the screen once the database has it.
      await onSaveDesignParams(update);
      onUpdateBatch(update);
      onClose();
    } catch {
      setError('Save failed — the project has not been changed.');
      setSaving(false);
    }
  };

  return (
    <div className="border border-blue-200 bg-white rounded-lg p-4 space-y-4">
      <p className="text-sm font-semibold text-gray-800">Update to corrected method (Table 2-11)</p>

      {step === 'choose' && (
        <>
          <p className="text-xs text-gray-600">
            Pick the best-matching category on each card, then choose ONE candidate and ONE statistic.
            Nothing is preselected and nothing is saved until you confirm.
            {/* TODO(commit 5): guidance on choosing the most representative value. */}
          </p>
          <Cards view={view} radioName={`q50-legacy-${project.id}`} onChange={onChange} />
        </>
      )}

      {/* Consequences — shown before anything is saved */}
      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-700 space-y-1">
        <p>Current q₅₀ (frozen superseded estimate): <strong>{oldQ50.toFixed(1)}</strong> m³/(h·m²)</p>
        {update ? (
          <>
            <p>New q₅₀: <strong>{update.q50.toFixed(1)}</strong> m³/(h·m²) — {selectionText(update)}</p>
            {/* While on legacy_sap the air permeability fields cannot change,
                so the opened snapshot is the current frozen estimate. */}
            {ventilationTotalsChange(project, project.airPermeabilityAtOpen, update)
              ? <OpenedChangeReadout project={project} candidateFields={update} boxed={false} />
              : <p className="text-gray-600">
                  {(project.rooms ?? []).length === 0 ? 'No rooms yet, so there is no load change to show.' : 'No load change to show.'}
                </p>}
          </>
        ) : (
          <p className="text-gray-600">Pick a candidate and a statistic to see the new q₅₀ and the change in load.</p>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} disabled={saving}
          className="py-2 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition">
          Cancel
        </button>
        {step === 'choose' ? (
          <button onClick={() => setStep('confirm')} disabled={!update}
            className="py-2 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
            Review change
          </button>
        ) : (
          <>
            <button onClick={() => setStep('choose')} disabled={saving}
              className="py-2 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition">
              Back
            </button>
            <button onClick={handleConfirm} disabled={saving || !update || !onSaveDesignParams}
              className="py-2 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
              {saving ? 'Saving…' : 'Confirm and save'}
            </button>
          </>
        )}
      </div>
      {step === 'confirm' && (
        <p className="text-xs text-gray-600 text-right">
          Confirming switches this project to Table 2-11 default and saves the project now.
          The frozen estimate is no longer used.
        </p>
      )}
    </div>
  );
};

export default function Q50CandidatePicker({ mode = 'select', ...props }) {
  return mode === 'update-legacy' ? <LegacyUpdatePicker {...props} /> : <SelectPicker {...props} />;
}
