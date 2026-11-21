// client/src/components/calculations/HotWaterDesign.jsx
//
// Hot water design panel on the Heat Loss Summary (MIS 3005-D 5.6, 5.9.2(b)(e)).
// Edits the occupancy, cylinder specification and agreed reheat time, and
// shows the daily demand and the cylinder recovery time.
//
// Bedrooms, occupants and cylinder volume are the same project fields the
// MCS031 tab edits (the pre-sale estimate often comes first), so either tab
// can be used; the cylinder detail fields (migration 028) live only here.
//
// One explicit Save rather than save-on-blur: the fields are interdependent
// (volume, heat-up time and output together give the recovery time), so they
// are checked and written together.

import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { buildDesignParamsPayload } from '../../utils/projectPayloads';
import {
  dailyHotWaterDemand,
  recoveryAssessment,
  HEATUP_FROM_C,
  HEATUP_TO_C,
} from '../../utils/dhwCalculations';

// ── Form ⇄ project mapping ────────────────────────────────────────────────
// The form holds strings (as typed); toUpdates converts to stored values.
// Blank / zero / negative numbers mean "not entered" and are stored as null
// (the server applies the same rule), never as an assumed default.

function fromProject(p) {
  return {
    bedrooms:         p.mcsBedrooms  ? String(p.mcsBedrooms)  : '',
    occupants:        p.mcsOccupants ? String(p.mcsOccupants) : '',
    cylinderIsNew:    p.dhwCylinderIsNew == null ? '' : (p.dhwCylinderIsNew ? 'new' : 'existing'),
    manufacturer:     p.dhwCylinderManufacturer || '',
    model:            p.dhwCylinderModel || '',
    volume:           p.mcsCylinderVolume ? String(p.mcsCylinderVolume) : '',
    coilArea:         p.dhwCoilAreaM2 != null ? String(p.dhwCoilAreaM2) : '',
    heatupMin:        p.dhwHeatupTimeMin != null ? String(p.dhwHeatupTimeMin) : '',
    heatupConditions: p.dhwHeatupConditions || '',
    hpOutputKw:       p.dhwHpOutputKw != null ? String(p.dhwHpOutputKw) : '',
    reheatAgreed:     !!p.dhwReheatAgreed,
    reheatAgreedMin:  p.dhwReheatTimeAgreedMin != null ? String(p.dhwReheatTimeAgreedMin) : '',
  };
}

const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const countOrZero = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function toUpdates(f) {
  return {
    mcsBedrooms:             countOrZero(f.bedrooms),
    mcsOccupants:            countOrZero(f.occupants),
    // Existing column, where 0 has always meant "not entered".
    mcsCylinderVolume:       numOrNull(f.volume) ?? 0,
    dhwCylinderIsNew:        f.cylinderIsNew === '' ? null : f.cylinderIsNew === 'new',
    dhwCylinderManufacturer: f.manufacturer.trim(),
    dhwCylinderModel:        f.model.trim(),
    dhwCoilAreaM2:           numOrNull(f.coilArea),
    dhwHeatupTimeMin:        numOrNull(f.heatupMin),
    dhwHeatupConditions:     f.heatupConditions.trim(),
    dhwHpOutputKw:           numOrNull(f.hpOutputKw),
    dhwReheatAgreed:         !!f.reheatAgreed,
    dhwReheatTimeAgreedMin:  f.reheatAgreed ? numOrNull(f.reheatAgreedMin) : null,
  };
}

// Anything typed into a number field must be a positive number. (Blank is fine.)
function validate(f) {
  const errors = [];
  const checks = [
    ['bedrooms',        'Bedrooms',               true],
    ['occupants',       'Occupants',              true],
    ['volume',          'Cylinder volume',        false],
    ['coilArea',        'Coil area',              false],
    ['heatupMin',       'Heat-up time',           false],
    ['hpOutputKw',      'Heat pump output for hot water', false],
    ['reheatAgreedMin', 'Agreed reheat time',     false],
  ];
  for (const [key, label, isCount] of checks) {
    const v = f[key];
    if (v === '' || v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || (!isCount && n === 0)) {
      errors.push(`${label} must be a positive number or left blank.`);
    } else if (isCount && !Number.isInteger(n)) {
      errors.push(`${label} must be a whole number.`);
    }
  }
  if (f.reheatAgreed && numOrNull(f.reheatAgreedMin) == null) {
    errors.push('Enter the reheat time agreed with the customer, or untick "agreed".');
  }
  return errors;
}

const fmtMin = (m) => (m == null ? '—' : `${Math.round(m)} min`);

// ── Component ─────────────────────────────────────────────────────────────

export default function HotWaterDesign({ project, onUpdateBatch }) {
  const [form, setForm]     = useState(() => fromProject(project));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // A different project: start again from its saved values.
  useEffect(() => {
    setForm(fromProject(project));
    setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const saved   = toUpdates(fromProject(project));
  const current = toUpdates(form);
  const dirty   = JSON.stringify(saved) !== JSON.stringify(current);

  // ── Calculations (live, from what is on screen) ──
  const demand = dailyHotWaterDemand({
    bedrooms:  current.mcsBedrooms,
    occupants: current.mcsOccupants,
  });
  const ratedKw     = Number(project.heatPumpRatedOutput) > 0 ? Number(project.heatPumpRatedOutput) : null;
  const hpKw        = current.dhwHpOutputKw ?? ratedKw;
  const hpKwSource  = current.dhwHpOutputKw != null ? 'entered' : (ratedKw ? 'rated' : null);
  const litres      = current.mcsCylinderVolume || null;
  const rec         = recoveryAssessment({
    litres,
    datasheetMin: current.dhwHeatupTimeMin,
    hpOutputKw:   hpKw,
  });
  const agreedTooShort = current.dhwReheatAgreed
    && current.dhwReheatTimeAgreedMin != null
    && rec.governingMin != null
    && current.dhwReheatTimeAgreedMin < rec.governingMin;
  const cylinderBelowDemand = demand && litres && litres < demand.litres;

  const missing = [
    !demand                                    && 'bedrooms or occupants',
    !litres                                    && 'cylinder volume',
    !(current.dhwCylinderManufacturer && current.dhwCylinderModel) && 'cylinder make and model',
    current.dhwCylinderIsNew == null           && 'new or existing cylinder',
    rec.governingMin == null                   && 'heat-up time or heat pump output',
    !current.dhwReheatAgreed                   && 'reheat time agreed with the customer',
  ].filter(Boolean);

  const handleSave = async () => {
    const errors = validate(form);
    if (errors.length) { setError(errors.join(' ')); return; }
    setSaving(true);
    setError('');
    let res;
    try {
      res = await api.updateDesignParams(project.id, buildDesignParamsPayload(project, current));
    } catch {
      res = { error: 'network' };
    }
    setSaving(false);
    // api.updateDesignParams resolves (not rejects) on HTTP errors, with { error }.
    if (res && typeof res === 'object' && 'error' in res) {
      setError('Not saved: the server rejected the update. Check your connection and try again.');
      return;
    }
    onUpdateBatch?.(current);
  };

  const input = 'w-full border border-gray-300 rounded px-3 py-2 text-sm';
  const label = 'block text-sm font-semibold text-gray-700 mb-1';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-start mb-1">
        <h3 className="text-xl font-bold">Hot Water Design</h3>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          {dirty && (
            <button onClick={() => { setForm(fromProject(project)); setError(''); }}
              className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5">Discard</button>
          )}
          <button onClick={handleSave} disabled={!dirty || saving}
            className="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Daily demand (MIS 3005-D 5.6.2), cylinder specification and recovery (5.9.2(e)), and the reheat
        time agreed with the customer (5.6.4). Bedrooms, occupants and volume are shared with the MCS031 tab.
      </p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">{error}</div>
      )}

      {/* ── Demand ── */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div>
          <label className={label}>Bedrooms</label>
          <input type="number" min="0" step="1" value={form.bedrooms} onChange={set('bedrooms')} className={input} />
        </div>
        <div>
          <label className={label}>Known occupants</label>
          <input type="number" min="0" step="1" value={form.occupants} onChange={set('occupants')} className={input} />
        </div>
        <div className="bg-green-50 border border-green-300 rounded px-3 py-2">
          <div className="text-sm font-semibold text-green-800">Daily hot water demand</div>
          <div className="text-2xl font-bold text-green-700">{demand ? `${demand.litres} L/day` : '—'}</div>
          {demand && (
            <div className="text-xs text-green-700">
              45 × N, N = {demand.n} (from {demand.basis === 'occupants' ? 'occupants' : 'bedrooms + 1'})
            </div>
          )}
        </div>
      </div>

      {/* ── Cylinder ── */}
      <h4 className="font-semibold text-gray-800 mb-2">Cylinder</h4>
      <div className="grid grid-cols-4 gap-4 mb-2">
        <div>
          <label className={label}>New or existing</label>
          <select value={form.cylinderIsNew} onChange={set('cylinderIsNew')} className={input}>
            <option value="">Not stated</option>
            <option value="new">New</option>
            <option value="existing">Existing (retained)</option>
          </select>
        </div>
        <div>
          <label className={label}>Manufacturer</label>
          <input type="text" value={form.manufacturer} onChange={set('manufacturer')} placeholder="e.g. Gledhill" className={input} />
        </div>
        <div>
          <label className={label}>Model</label>
          <input type="text" value={form.model} onChange={set('model')} placeholder="e.g. StainlessLite Plus HP 210" className={input} />
        </div>
        <div>
          <label className={label}>Volume (litres)</label>
          <input type="number" min="0" step="1" value={form.volume} onChange={set('volume')} placeholder="e.g. 210" className={input} />
        </div>
      </div>
      {cylinderBelowDemand && (
        <p className="text-xs text-amber-700 mb-2">
          The cylinder ({litres} L) is smaller than the daily demand ({demand.litres} L/day). That can be fine
          with a short reheat time — check against MGD 007 and the recovery below.
        </p>
      )}

      {/* ── Recovery ── */}
      <h4 className="font-semibold text-gray-800 mt-4 mb-2">Recovery ({HEATUP_FROM_C} → {HEATUP_TO_C} °C)</h4>
      <div className="grid grid-cols-4 gap-4 mb-3">
        <div>
          <label className={label}>Datasheet heat-up time (min)</label>
          <input type="number" min="0" step="0.1" value={form.heatupMin} onChange={set('heatupMin')} className={input} />
        </div>
        <div className="col-span-2">
          <label className={label}>Datasheet test conditions</label>
          <input type="text" value={form.heatupConditions} onChange={set('heatupConditions')}
            placeholder="From the datasheet footnote, e.g. primary flow temperature and rate" className={input} />
        </div>
        <div>
          <label className={label}>Heat pump output for hot water (kW)</label>
          <input type="number" min="0" step="0.1" value={form.hpOutputKw} onChange={set('hpOutputKw')}
            placeholder={ratedKw ? `Rated: ${ratedKw}` : 'e.g. 7.5'} className={input} />
        </div>
        <div>
          <label className={label}>Coil surface area (m²)</label>
          <input type="number" min="0" step="0.1" value={form.coilArea} onChange={set('coilArea')} className={input} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-3">
        <div className="bg-gray-50 rounded p-3">
          <div className="text-xs text-gray-600">Datasheet</div>
          <div className="font-bold text-gray-800">{fmtMin(current.dhwHeatupTimeMin)}</div>
          {rec.impliedKw != null && (
            <div className="text-xs text-gray-500">implies {rec.impliedKw.toFixed(1)} kW</div>
          )}
        </div>
        <div className="bg-gray-50 rounded p-3">
          <div className="text-xs text-gray-600">Heat pump minimum</div>
          <div className="font-bold text-gray-800">{fmtMin(rec.hpLimitedMin)}</div>
          {hpKw != null && (
            <div className="text-xs text-gray-500">
              at {hpKw} kW ({hpKwSource === 'entered' ? 'entered' : 'rated output'})
            </div>
          )}
        </div>
        <div className={`rounded p-3 border-2 ${rec.governingMin != null ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-200'}`}>
          <div className="text-xs text-gray-600">Recovery time to state</div>
          <div className="text-xl font-bold text-blue-700">{fmtMin(rec.governingMin)}</div>
          {rec.governingMin != null && (
            <div className="text-xs text-blue-700">
              {rec.governedBy === 'heat_pump' ? 'set by the heat pump output' : 'set by the datasheet'}
              {rec.recoveryLph != null && ` · ${Math.round(rec.recoveryLph)} L/h`}
            </div>
          )}
        </div>
      </div>

      {rec.datasheetAchievable === false && (
        <p className="text-xs text-amber-700 mb-1">
          ⚠ The datasheet time needs about {rec.impliedKw.toFixed(1)} kW, more than the {hpKw} kW available, so it
          was not measured at this heat pump's output. The heat-pump minimum is used instead.
        </p>
      )}
      {hpKwSource === 'rated' && rec.hpLimitedMin != null && (
        <p className="text-xs text-gray-500 mb-1">
          Using the rated output. Output at hot water flow temperatures is usually lower — enter it from the
          heat pump datasheet for a more accurate figure.
        </p>
      )}
      <p className="text-xs text-gray-400 mb-4">
        The heat-pump minimum is energy-limited (volume × {HEATUP_TO_C - HEATUP_FROM_C} K ÷ output) and ignores
        coil transfer limits and stratification, so real recovery is longer.
      </p>

      {/* ── Agreed reheat ── */}
      <div className="flex items-end gap-4 mb-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 pb-2">
          <input type="checkbox" checked={form.reheatAgreed} onChange={set('reheatAgreed')} />
          Reheat time agreed with the customer (5.6.4)
        </label>
        {form.reheatAgreed && (
          <div className="w-48">
            <label className={label}>Agreed time (min)</label>
            <input type="number" min="0" step="1" value={form.reheatAgreedMin} onChange={set('reheatAgreedMin')} className={input} />
          </div>
        )}
      </div>
      {agreedTooShort && (
        <p className="text-xs text-amber-700 mb-3">
          ⚠ The agreed time ({fmtMin(current.dhwReheatTimeAgreedMin)}) is shorter than the recovery time this
          cylinder and heat pump can achieve ({fmtMin(rec.governingMin)}).
        </p>
      )}

      {missing.length > 0 && (
        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2">
          <span className="font-semibold">Not yet entered for the customer design information:</span>{' '}
          {missing.join(', ')}.
        </div>
      )}
    </div>
  );
}
