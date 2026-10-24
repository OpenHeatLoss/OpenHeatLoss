// client/src/components/project/AirPermeabilitySettings.jsx
//
// Air permeability section of VentilationSettings (B25 commit 4).
// CIBSE DHDG 2026 section 2.5.4.1, as corrected by DHDG-2026-1-COR-001.
//
// Methods:
//   default_table  Table 2-11 lookup — basis → category → statistic
//   measured       q50 from an airtightness test
//   design_target  q50 from the designer's / builder's own evidence (free entry)
//   legacy_sap     frozen superseded estimate — banner + opt-in update flow
//
// Selection rule (server COALESCE cannot clear category columns): the project
// only ever receives a COMPLETE selection — a basis together with its
// category (or 'all_dwellings') — from buildQ50SelectionUpdate. Choosing a
// new basis is held in local state until its category is picked, so the
// basis saved is always paired with the category just written, and a stale
// value left in another category column is never read (resolveQ50 reads only
// the category matching q50SelectionBasis).
//
// All pure logic lives in utils/q50Selection.js.

import { useState, useEffect } from 'react';
import { resolveQ50 } from '../../utils/en12831Calculations';
import {
  Q50_TABLE_2_11,
  Q50_CATEGORY_FIELD,
  Q50_BASIS_OPTIONS,
  Q50_CATEGORY_LABELS,
  Q50_STATISTICS,
  Q50_STATISTIC_OPTIONS,
  Q50_INPUT_MIN,
  Q50_INPUT_MAX,
} from '../../utils/en12831VentilationData';
import {
  buildQ50SelectionUpdate,
  q50Candidate,
  LEGACY_CANDIDATE_BASES,
  initialLegacyComparison,
  legacyComparisonUpdate,
  airPermeabilitySnapshot,
  ventilationTotalsChange,
  formatSignedKW,
  validateQ50Input,
} from '../../utils/q50Selection';

const inputClass  = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const selectClass = inputClass;

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm font-semibold mb-1">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

const METHOD_OPTIONS = [
  { value: 'default_table', label: 'Table 2-11 default', sub: 'No test available' },
  { value: 'measured',      label: 'Measured',           sub: 'Blower door or pulse test' },
  { value: 'design_target', label: 'Design target',      sub: "Designer's or builder's figure" },
];

const round1 = (x) => parseFloat(x.toFixed(1));
const categoryLabel = (basis, category) => Q50_CATEGORY_LABELS[basis]?.[category] ?? category;

// Q1 / median / Q3 for a candidate, e.g. "Q1 7.1 · median 8.6 · Q3 10.8"
const Spread = ({ candidate }) => (
  <span className="text-xs text-gray-500">
    Q1 {candidate.q1.toFixed(1)} · median {candidate.median.toFixed(1)} · Q3 {candidate.q3.toFixed(1)}
  </span>
);

// "Change vs. when this project was opened" — hidden when there is nothing
// reliable to show (no snapshot, no rooms, not the EN 12831 method).
const OpenedChangeReadout = ({ project }) => {
  const change = project.airPermeabilityAtOpen
    ? ventilationTotalsChange(project, project.airPermeabilityAtOpen, airPermeabilitySnapshot(project))
    : null;
  if (!change) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700">
      <p className="font-semibold">Change vs. when this project was opened</p>
      <p className="mt-0.5">
        Generator {formatSignedKW(change.generatorDeltaW)} · Emitter {formatSignedKW(change.emitterDeltaW)}
        <span className="text-gray-500"> (q₅₀ {change.baselineQ50.toFixed(1)} → {change.candidateQ50.toFixed(1)})</span>
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// default_table panel
// ---------------------------------------------------------------------------
const DefaultTablePanel = ({ project, resolved, onUpdateBatch }) => {
  const savedBasis    = project.q50SelectionBasis ?? null;
  const savedCategory = savedBasis && Q50_CATEGORY_FIELD[savedBasis] ? (project[Q50_CATEGORY_FIELD[savedBasis]] ?? null) : null;
  const statistic     = project.q50Statistic ?? 'mean';
  const complete      = !resolved.defaulted;

  // Basis being chosen; differs from savedBasis only until a category is picked.
  const [pendingBasis, setPendingBasis] = useState(savedBasis);
  useEffect(() => { setPendingBasis(savedBasis); }, [project.id, savedBasis]);

  const handleBasis = (basis) => {
    const next = basis || null;
    setPendingBasis(next);
    if (next === 'all_dwellings' && savedBasis !== 'all_dwellings') {
      onUpdateBatch(buildQ50SelectionUpdate({ basis: 'all_dwellings', statistic }));
    }
  };

  const handleCategory = (category) => {
    const update = buildQ50SelectionUpdate({ basis: pendingBasis, category: category || null, statistic });
    if (update) onUpdateBatch(update);
  };

  const handleStatistic = (next) => {
    const update = buildQ50SelectionUpdate({ basis: savedBasis, category: savedCategory, statistic: next });
    if (update) onUpdateBatch(update);
  };

  const pendingIsNew  = pendingBasis !== savedBasis;
  const shownCategory = pendingIsNew ? '' : (savedCategory ?? '');
  const candidate     = complete ? q50Candidate(savedBasis, savedCategory) : q50Candidate('all_dwellings');

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <p className="text-xs text-gray-600">
        Default air permeability from CIBSE DHDG 2026 Table 2-11 (as corrected by DHDG-2026-1-COR-001),
        used directly with no conversion.
        {/* TODO(commit 5): explanatory help text on choosing the most representative value. */}
      </p>

      {resolved.defaulted && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          ⚠ No dwelling characteristic selected — the all-dwellings mean
          ({Q50_TABLE_2_11.all.mean.toFixed(1)} m³/(h·m²)) is being used. Choose how to describe
          the dwelling below.
        </p>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Field label="1. Describe the dwelling by">
          <select value={pendingBasis ?? ''} onChange={e => handleBasis(e.target.value)} className={selectClass}>
            <option value="">Select…</option>
            {Object.entries(Q50_BASIS_OPTIONS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>

        <Field label="2. Category">
          {pendingBasis && pendingBasis !== 'all_dwellings' ? (
            <select value={shownCategory} onChange={e => handleCategory(e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {Object.keys(Q50_TABLE_2_11[pendingBasis]).map(k => (
                <option key={k} value={k}>{categoryLabel(pendingBasis, k)}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-gray-500 py-2">
              {pendingBasis === 'all_dwellings' ? 'Not needed for all dwellings' : 'Choose step 1 first'}
            </p>
          )}
        </Field>

        <Field label="3. Statistic">
          <select
            value={statistic}
            onChange={e => handleStatistic(e.target.value)}
            disabled={!complete || pendingIsNew}
            className={selectClass + ' disabled:bg-gray-100 disabled:text-gray-400'}
          >
            {Q50_STATISTICS.map(k => (
              <option key={k} value={k}>{Q50_STATISTIC_OPTIONS[k].label}</option>
            ))}
          </select>
        </Field>
      </div>

      {pendingIsNew && pendingBasis !== 'all_dwellings' && pendingBasis && (
        <p className="text-xs text-gray-600">
          Choose a category to apply this. Until then the current value stays in use.
        </p>
      )}

      {candidate && (
        <div className="flex items-baseline justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-700">
            {complete
              ? <>{Q50_BASIS_OPTIONS[savedBasis].label}{savedCategory ? `: ${categoryLabel(savedBasis, savedCategory)}` : ''} — {Q50_STATISTIC_OPTIONS[statistic]?.label ?? statistic}</>
              : 'All dwellings — mean (default)'}
          </span>
          <Spread candidate={candidate} />
        </div>
      )}

      <OpenedChangeReadout project={project} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// design_target panel
// ---------------------------------------------------------------------------
const DesignTargetPanel = ({ project, onUpdate }) => {
  // Local text so an invalid entry is shown with its error but never reaches
  // the project (the calculation keeps the last valid value).
  const [text, setText] = useState(project.q50 == null ? '' : String(project.q50));
  useEffect(() => { setText(project.q50 == null ? '' : String(project.q50)); }, [project.id]);
  const check = validateQ50Input(text);

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <Field
        label="Design target q₅₀"
        hint="The figure must come from the designer's or builder's own airtightness design or compliance evidence. No preset values are offered."
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            min={Q50_INPUT_MIN}
            max={Q50_INPUT_MAX}
            value={text}
            onChange={e => {
              setText(e.target.value);
              const r = validateQ50Input(e.target.value);
              if (r.error === undefined) onUpdate('q50', r.value);
            }}
            className={inputClass + ' flex-1' + (check.error ? ' border-red-400' : '')}
          />
          <span className="text-sm text-gray-600 whitespace-nowrap">m³/(h·m²)</span>
        </div>
      </Field>
      {check.error && <p className="text-xs text-red-600">{check.error} The last valid value is still in use.</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// legacy_sap: banner + opt-in update to the corrected method
// ---------------------------------------------------------------------------
const LegacyUpdateFlow = ({ project, onClose, onUpdateBatch, onSaveDesignParams }) => {
  const [cmp, setCmp]       = useState(initialLegacyComparison);
  const [step, setStep]     = useState('choose');   // 'choose' | 'confirm'
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const update = legacyComparisonUpdate(cmp);
  const change = update ? ventilationTotalsChange(project, airPermeabilitySnapshot(project), update) : null;
  const oldQ50 = project.q50;

  const setCategory = (basis, category) =>
    setCmp(s => ({ ...s, categories: { ...s.categories, [basis]: category || null } }));

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
            Pick the best-matching category in each column, then choose ONE candidate and ONE statistic.
            Nothing is preselected and nothing is saved until you confirm.
            {/* TODO(commit 5): guidance on choosing the most representative value. */}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {LEGACY_CANDIDATE_BASES.map(basis => {
              const category  = cmp.categories[basis];
              const candidate = category ? q50Candidate(basis, category) : null;
              return (
                <div key={basis} className={`border rounded-lg p-3 space-y-2 ${cmp.pickedBasis === basis ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <p className="text-xs font-semibold text-gray-700">{Q50_BASIS_OPTIONS[basis].label}</p>
                  <select value={category ?? ''} onChange={e => setCategory(basis, e.target.value)} className={selectClass}>
                    <option value="">Select…</option>
                    {Object.keys(Q50_TABLE_2_11[basis]).map(k => (
                      <option key={k} value={k}>{categoryLabel(basis, k)}</option>
                    ))}
                  </select>
                  {candidate ? (
                    <>
                      <p className="text-sm">Mean <strong>{candidate.mean.toFixed(1)}</strong></p>
                      <Spread candidate={candidate} />
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">No category chosen</p>
                  )}
                  <label className={`flex items-center gap-2 text-xs ${candidate ? 'text-gray-700' : 'text-gray-400'}`}>
                    <input
                      type="radio"
                      name="legacy-candidate"
                      checked={cmp.pickedBasis === basis}
                      disabled={!candidate}
                      onChange={() => setCmp(s => ({ ...s, pickedBasis: basis }))}
                    />
                    Use this candidate
                  </label>
                </div>
              );
            })}
          </div>

          <fieldset className="flex flex-wrap gap-4 text-xs text-gray-700">
            <legend className="font-semibold mb-1">Statistic</legend>
            {Q50_STATISTICS.map(k => (
              <label key={k} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="legacy-statistic"
                  checked={cmp.statistic === k}
                  onChange={() => setCmp(s => ({ ...s, statistic: k }))}
                />
                {Q50_STATISTIC_OPTIONS[k].label}
              </label>
            ))}
          </fieldset>
        </>
      )}

      {/* Consequences — shown before anything is saved */}
      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-700 space-y-0.5">
        <p>Current q₅₀ (frozen superseded estimate): <strong>{oldQ50.toFixed(1)}</strong> m³/(h·m²)</p>
        {update ? (
          <>
            <p>
              New q₅₀: <strong>{update.q50.toFixed(1)}</strong> m³/(h·m²) —{' '}
              {Q50_BASIS_OPTIONS[update.q50SelectionBasis].label}: {categoryLabel(update.q50SelectionBasis, update[Q50_CATEGORY_FIELD[update.q50SelectionBasis]])},{' '}
              {Q50_STATISTIC_OPTIONS[update.q50Statistic].label}
            </p>
            {change
              ? <p>Change in load: generator <strong>{formatSignedKW(change.generatorDeltaW)}</strong> · emitter <strong>{formatSignedKW(change.emitterDeltaW)}</strong></p>
              : <p className="text-gray-500">No rooms yet, so there is no load change to show.</p>}
          </>
        ) : (
          <p className="text-gray-500">Pick a candidate and a statistic to see the new q₅₀ and the change in load.</p>
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

const LegacyBanner = ({ onStartUpdate, updating }) => (
  <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
    {/* TODO(commit 5): final banner wording — placeholder below. */}
    <p className="text-sm font-semibold text-amber-900">Calculation basis: superseded</p>
    <p className="text-xs text-amber-900">
      [Placeholder] This project's air permeability is an estimate from a method that CIBSE has
      since withdrawn (DHDG-2026-1-COR-001). The estimate has been kept, so the results are
      unchanged until you choose to update. Nothing changes automatically.
    </p>
    {!updating && (
      <button onClick={onStartUpdate}
        className="py-1.5 px-3 bg-white border border-amber-400 text-amber-900 text-xs font-semibold rounded-lg hover:bg-amber-100 transition">
        Update to corrected method
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
export default function AirPermeabilitySettings({ project, onUpdate, onUpdateBatch, onSaveDesignParams }) {
  const [updatingLegacy, setUpdatingLegacy] = useState(false);
  useEffect(() => { setUpdatingLegacy(false); }, [project.id]);

  const method       = project.airPermeabilityMethod;
  const isMeasured   = method === 'measured';
  const isLegacySap  = method === 'legacy_sap';
  const resolved     = resolveQ50(project);
  const effectiveQ50 = isMeasured ? (project.q50 ?? 12.0) : resolved.q50;

  // Measured / design target are seeded with the current effective value
  // (rounded to 1 dp, as before); default_table resolves its own value.
  const handleMethod = (target) => {
    if (target === method) return;
    if (isLegacySap && target === 'default_table') {
      setUpdatingLegacy(true);      // comparison first — nothing changes yet
      return;
    }
    if (isLegacySap && !window.confirm(
      // TODO(commit 5): final wording.
      'Switch this project away from its frozen superseded estimate? Once saved, the frozen estimate is no longer used.'
    )) return;
    if (target === 'default_table') {
      const next = { ...project, airPermeabilityMethod: 'default_table' };
      onUpdateBatch({ airPermeabilityMethod: 'default_table', q50: resolveQ50(next).q50 });
    } else {
      onUpdateBatch({ airPermeabilityMethod: target, q50: round1(effectiveQ50) });
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1 mb-3">
        Air Permeability
      </h3>

      {isLegacySap && (
        <div className="mb-4 space-y-3">
          <LegacyBanner onStartUpdate={() => setUpdatingLegacy(true)} updating={updatingLegacy} />
          {updatingLegacy && (
            <LegacyUpdateFlow
              project={project}
              onClose={() => setUpdatingLegacy(false)}
              onUpdateBatch={onUpdateBatch}
              onSaveDesignParams={onSaveDesignParams}
            />
          )}
        </div>
      )}

      {/* Method selector */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden mb-4 text-sm">
        {METHOD_OPTIONS.map(({ value, label, sub }) => (
          <button
            key={value}
            onClick={() => handleMethod(value)}
            className={`flex-1 py-2 px-3 text-left transition ${
              method === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="font-semibold block">{label}</span>
            <span className={`text-xs ${method === value ? 'text-blue-100' : 'text-gray-500'}`}>{sub}</span>
          </button>
        ))}
      </div>

      {method === 'default_table' && (
        <DefaultTablePanel project={project} resolved={resolved} onUpdateBatch={onUpdateBatch} />
      )}

      {isMeasured && (
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
      )}

      {method === 'design_target' && <DesignTargetPanel project={project} onUpdate={onUpdate} />}

      {isLegacySap && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-600">
            Frozen estimate from the superseded SAP 10.2 method (CIBSE DHDG 2026-01, corrected by
            DHDG-2026-1-COR-001) — preserved so previously issued figures remain reproducible.
          </p>
        </div>
      )}

      {/* Effective q50 — always visible */}
      <div className="mt-3 flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div>
          <span className="text-sm font-semibold text-gray-700">Effective q₅₀</span>
          <span className="text-xs text-gray-500 ml-2">
            {isMeasured ? 'from test — used directly in calculation'
              : isLegacySap ? 'frozen superseded estimate — used directly in calculation'
              : method === 'design_target' ? 'design target — used directly in calculation'
              : method === 'default_table' && resolved.defaulted ? 'Table 2-11 all-dwellings mean (no selection yet)'
              : method === 'default_table' ? 'Table 2-11 — used directly in calculation'
              : 'stored value — used directly in calculation'}
          </span>
        </div>
        <div className="text-right">
          <span className="text-xl font-bold text-blue-600">{effectiveQ50.toFixed(1)}</span>
          <span className="text-sm text-gray-500 ml-1">m³/(h·m²)</span>
        </div>
      </div>
      {isMeasured && effectiveQ50 > 15 && (
        <p className="text-xs text-amber-600 mt-1">
          ⚠ Measured q₅₀ above 15 — unusually high for a modern building. Double-check the test report units (should be m³/(h·m²) at 50 Pa, not ACH).
        </p>
      )}
    </div>
  );
}
