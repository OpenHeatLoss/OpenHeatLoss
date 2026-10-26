// client/src/components/project/AirPermeabilitySettings.jsx
//
// Air permeability section of VentilationSettings (B25 commit 4).
// CIBSE DHDG 2026 section 2.5.4.1, as corrected by DHDG-2026-1-COR-001.
//
// Methods:
//   default_table  Table 2-11 lookup — candidate picker (Q50CandidatePicker, 'select')
//   measured       q50 from an airtightness test
//   design_target  q50 from the designer's / builder's own evidence (free entry)
//   legacy_sap     frozen superseded estimate — banner + opt-in update flow
//                  (Q50CandidatePicker, 'update-legacy')
//
// Selection rule: see Q50CandidatePicker.jsx. The project only ever receives
// a complete selection, and resolveQ50 reads only the category matching
// q50SelectionBasis, so a stale value in another category column is inert.
//
// Saving (stopgap — see BACKLOG "Single design_params save path"): outside
// legacy_sap, each discrete choice is saved at once through
// onSaveDesignParams (App's saveDesignParams, as the MCS tabs use): picker
// choices, a switch to Table 2-11, and typed numbers on blur when valid and
// changed. Saves run one at a time in order; "Saved" or an error shows on
// a status line below the panel, above Effective q50. legacy_sap keeps its
// Review → Confirm save.
//
// Drafts: choosing Measured or Design target opens an empty input and saves
// nothing. The project's method and q50 (and so the calculation and Save
// Project) stay as they were until a valid figure is entered; on blur the
// method and value are saved together. Clicking the stored method again
// drops the draft. The draft is local state here only.
//
// All pure logic lives in utils/q50Selection.js.

import { useState, useEffect, useRef } from 'react';
import { resolveQ50 } from '../../utils/en12831Calculations';
import { Q50_TABLE_2_11, Q50_INPUT_MIN, Q50_INPUT_MAX } from '../../utils/en12831VentilationData';
import {
  validateQ50Input,
  effectiveQ50 as effectiveQ50Of,
  methodClick,
  q50BlurSave,
  draftBlurSave,
  createSerialSaver,
  statusAfterInput,
} from '../../utils/q50Selection';
import Q50CandidatePicker from './Q50CandidatePicker';

const inputClass = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';

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

// ---------------------------------------------------------------------------
// default_table panel
// ---------------------------------------------------------------------------
const DefaultTablePanel = ({ project, resolved, onSelect, onInput }) => (
  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
    <p className="text-xs text-gray-600">
      Default air permeability from CIBSE DHDG 2026 Table 2-11 (as corrected by DHDG-2026-1-COR-001),
      used directly with no conversion.
      {/* TODO(commit 5): explanatory help text on choosing the most representative value. */}
    </p>

    {resolved.defaulted && (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        ⚠ No dwelling characteristic selected — the all-dwellings mean
        ({Q50_TABLE_2_11.all.mean.toFixed(1)} m³/(h·m²)) is being used. Pick a candidate and a
        statistic below.
      </p>
    )}

    <Q50CandidatePicker mode="select" project={project} onSelect={onSelect} onInput={onInput} />
  </div>
);

// ---------------------------------------------------------------------------
// Typed q50 (measured, design target)
// ---------------------------------------------------------------------------
// Local text so an invalid entry is shown with its error but never reaches
// the project (the calculation keeps the last valid value). Valid keystrokes
// update project state; the value is saved on blur only if valid and changed.
//
// With draftMethod set (the method was just chosen and is not stored yet) the
// input starts empty, keystrokes never touch the project, and blur hands the
// method and value to onSave together once the text is valid.
const Q50NumberInput = ({ project, draftMethod, onUpdate, onSave, onInput, label, hint }) => {
  const asText = (q50) => (q50 == null ? '' : String(q50));
  const [text, setText] = useState(draftMethod ? '' : asText(project.q50));
  const lastSaved = useRef(project.q50);
  useEffect(() => {
    if (draftMethod) return;
    setText(asText(project.q50)); lastSaved.current = project.q50;
  }, [project.id]);
  // An empty draft is not an error yet — the draft note explains it.
  const check = draftMethod && text.trim() === '' ? {} : validateQ50Input(text);

  const handleBlur = () => {
    const fields = draftMethod ? draftBlurSave(draftMethod, text) : q50BlurSave(text, lastSaved.current);
    if (!fields) return;
    lastSaved.current = fields.q50;
    onSave(fields);
  };

  return (
    <>
      <Field label={label} hint={hint}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            min={Q50_INPUT_MIN}
            max={Q50_INPUT_MAX}
            value={text}
            onChange={e => {
              onInput();
              setText(e.target.value);
              if (draftMethod) return;
              const r = validateQ50Input(e.target.value);
              if (r.error === undefined) onUpdate('q50', r.value);
            }}
            onBlur={handleBlur}
            className={inputClass + ' flex-1' + (check.error ? ' border-red-400' : '')}
          />
          <span className="text-sm text-gray-600 whitespace-nowrap">m³/(h·m²)</span>
        </div>
      </Field>
      {check.error && (
        <p className="text-xs text-red-600">
          {check.error}{' '}
          {draftMethod ? "The current method's q₅₀ is still in use and nothing is saved."
            : 'The last valid value is still in use and nothing is saved.'}
        </p>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Save status — serialised saves (createSerialSaver), latest outcome shown
// ---------------------------------------------------------------------------
const useSerialSave = (onSaveDesignParams, projectId) => {
  const [status, setStatus] = useState(null);   // null | { state: 'saving'|'saved'|'error', fields, message }
  // One queue per project. The save function is captured with each request,
  // so a queued save always goes to the project it was made for; its outcome
  // is shown only while that project is still open.
  const openId = useRef(projectId);
  openId.current = projectId;
  const saver = useRef(null);
  if (saver.current?.projectId !== projectId) {
    saver.current = {
      projectId,
      save: createSerialSaver((st) => { if (openId.current === projectId) setStatus(st); }),
    };
  }
  useEffect(() => { setStatus(null); }, [projectId]);

  const save = (fields) => {
    if (onSaveDesignParams) saver.current.save(fields, onSaveDesignParams);
  };
  // Any input after a save clears "Saved" (see statusAfterInput).
  const noteInput = () => {
    saver.current.save.noteInput();
    setStatus(statusAfterInput);
  };
  return { status, save, noteInput };
};

// Centred line between the panel and Effective q50. Its height is reserved
// (min-h) so the card below does not move when a status appears or clears.
const SaveStatus = ({ status, onRetry }) => (
  <div className="min-h-[1.25rem] my-2 text-center text-sm leading-5" aria-live="polite">
    <SaveStatusText status={status} onRetry={onRetry} />
  </div>
);

const SaveStatusText = ({ status, onRetry }) => {
  if (!status) return null;
  if (status.state === 'saving') return <span className="text-gray-600">Saving…</span>;
  if (status.state === 'saved')  return <span className="font-semibold text-green-700">✓ Saved</span>;
  return (
    <span className="font-bold text-red-700" role="alert">
      ⚠ Not saved ({status.message}). Your choice is still shown; press Save Project or{' '}
      <button onClick={onRetry} className="underline hover:text-red-900">retry</button>.
    </span>
  );
};

// ---------------------------------------------------------------------------
// legacy_sap: banner + opt-in update to the corrected method
// ---------------------------------------------------------------------------
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

// Buttons used while a draft is open keep focus off them on mousedown, so the
// input's blur (which would save a valid figure) does not run before a cancel.
const keepFocus = (e) => e.preventDefault();

// Shown while a Measured / Design target draft is open.
const DraftNote = ({ effectiveQ50, onCancel }) => (
  <p className="text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded px-3 py-2">
    Enter a figure to use this method. Until a valid figure is entered, the current method's
    q₅₀ ({effectiveQ50.toFixed(1)} m³/(h·m²)) stays in use and nothing is saved.{' '}
    <button onMouseDown={keepFocus} onClick={onCancel} className="underline hover:text-blue-700">Keep the current method</button>
  </p>
);

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
export default function AirPermeabilitySettings({ project, onUpdate, onUpdateBatch, onSaveDesignParams }) {
  const [updatingLegacy, setUpdatingLegacy] = useState(false);
  const [draft, setDraftState] = useState(null);   // method of an open Measured / Design target draft
  // Mirrors draft synchronously, so a blur that lands after a cancel is ignored.
  const draftRef = useRef(null);
  const setDraft = (m) => { draftRef.current = m; setDraftState(m); };
  useEffect(() => { setUpdatingLegacy(false); }, [project.id]);
  useEffect(() => { setDraft(null); }, [project.id, project.airPermeabilityMethod]);
  const { status, save, noteInput } = useSerialSave(onSaveDesignParams, project.id);

  const method       = project.airPermeabilityMethod;   // as stored — what the calculation uses
  const shown        = draft ?? method;                 // what the selector and panel show
  const isMeasured   = method === 'measured';
  const isLegacySap  = method === 'legacy_sap';
  const resolved     = resolveQ50(project);
  const effectiveQ50 = effectiveQ50Of(project);

  // A discrete choice: into project state, then saved.
  const choose = (fields) => {
    onUpdateBatch(fields);
    save(fields);
  };

  const handleMethod = (target) => {
    const action = methodClick(project, draft, target);
    if (action.kind === 'none') return;
    noteInput();
    if (action.kind === 'cancelDraft') { setDraft(null); return; }
    if (action.kind === 'legacyUpdate') {
      setDraft(null);
      setUpdatingLegacy(true);      // comparison first — nothing changes yet
      return;
    }
    if (action.kind === 'openDraft') {
      if (isLegacySap && !draft && !window.confirm(
        // TODO(commit 5): final wording.
        'Switch this project away from its frozen superseded estimate? Once saved, the frozen estimate is no longer used.'
      )) return;
      setUpdatingLegacy(false);
      setDraft(action.method);
      return;
    }
    choose(action.fields);
  };

  // A draft's first valid blur: method and value saved together.
  const commitDraft = (fields) => {
    if (draftRef.current !== fields.airPermeabilityMethod) return;   // cancelled meanwhile
    setDraft(null);
    choose(fields);
  };

  const typedInput = (label, hint) => (
    <Q50NumberInput
      key={draft ? `draft-${draft}` : 'stored'}
      project={project}
      draftMethod={draft}
      onUpdate={onUpdate}
      onSave={draft ? commitDraft : save}
      onInput={noteInput}
      label={label}
      hint={hint}
    />
  );

  return (
    <div>
      <div className="border-b border-gray-200 pb-1 mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Air Permeability</h3>
      </div>

      {/* Method selector — directly under the heading in every state */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden mb-4 text-sm">
        {METHOD_OPTIONS.map(({ value, label, sub }) => (
          <button
            key={value}
            onMouseDown={draft ? keepFocus : undefined}
            onClick={() => handleMethod(value)}
            className={`flex-1 py-2 px-3 text-left transition ${
              shown === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="font-semibold block">{label}</span>
            <span className={`text-xs ${shown === value ? 'text-blue-100' : 'text-gray-500'}`}>{sub}</span>
          </button>
        ))}
      </div>

      {isLegacySap && !draft && (
        <div className="mb-4 space-y-3">
          <LegacyBanner onStartUpdate={() => setUpdatingLegacy(true)} updating={updatingLegacy} />
          {updatingLegacy && (
            <Q50CandidatePicker
              mode="update-legacy"
              project={project}
              onClose={() => setUpdatingLegacy(false)}
              onUpdateBatch={onUpdateBatch}
              onSaveDesignParams={onSaveDesignParams}
            />
          )}
        </div>
      )}

      {shown === 'default_table' && (
        <DefaultTablePanel project={project} resolved={resolved} onSelect={choose} onInput={noteInput} />
      )}

      {shown === 'measured' && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          {draft && <DraftNote effectiveQ50={effectiveQ50} onCancel={() => handleMethod(method)} />}
          {typedInput(
            'Air permeability q₅₀',
            'From blower door or pulse test report, m³/(h·m²) at 50 Pa. Post-2006 homes: check EPC for result.'
          )}
          <p className="text-xs text-gray-500">
            If vents or fans were sealed during the test, background ventilation
            additions are still made at room level.
          </p>
        </div>
      )}

      {shown === 'design_target' && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          {draft && <DraftNote effectiveQ50={effectiveQ50} onCancel={() => handleMethod(method)} />}
          {typedInput(
            'Design target q₅₀',
            "The figure must come from the designer's or builder's own airtightness design or compliance evidence. No preset values are offered."
          )}
        </div>
      )}

      {isLegacySap && !draft && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-600">
            Frozen estimate from the superseded SAP 10.2 method (CIBSE DHDG 2026-01, corrected by
            DHDG-2026-1-COR-001) — preserved so previously issued figures remain reproducible.
          </p>
        </div>
      )}

      <SaveStatus status={status} onRetry={() => status?.fields && save(status.fields)} />

      {/* Effective q50 — always visible */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
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
