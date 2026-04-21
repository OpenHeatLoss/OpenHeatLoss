// client/src/components/rooms/EmitterEditor.jsx
import { useState } from 'react';
import { PlusIcon, TrashIcon } from '../common/Icons';
import { EMITTER_TYPES, RADIATOR_CONNECTION_TYPES } from '../../utils/constants';

// Radiator type options — shared convention with RadiatorSizing.jsx
const RADIATOR_TYPES = {
  'Panel radiators': [
    'K1 / Type 11 — Single panel, single convector',
    'K2 / Type 22 — Double panel, double convector',
    'K3 / Type 33 — Triple panel, triple convector',
    'P+ / Type 21 — Double panel, single convector',
    'Type 20 — Double panel, no convector',
    'Type 10 — Single panel, no convector',
  ],
  'Column radiators': [
    'Single Column',
    'Double Column',
    'Triple Column',
    'Quadruple Column',
  ],
  'Other': [
    'LST',
    'Fan Convector',
    'UFH',
    'Towel Rail',
  ],
};

const DEFAULT_TYPE = 'K2 / Type 22 — Double panel, double convector';

const EMPTY_RADIATOR = {
  manufacturer: '',
  model: '',
  type: DEFAULT_TYPE,
  height: 600,
  length: 1000,
  outputDt50: 0,
  waterVolume: 0,
  notes: '',
  source: 'library',
};

export default function EmitterEditor({ room, radiatorSpecs, onAdd, onUpdate, onDelete, onAddRadiatorSpec }) {
  // Track which emitter triggered the add-radiator form so we can auto-select
  // the new spec into that emitter's dropdown after saving.
  const [addRadiatorForEmitterId, setAddRadiatorForEmitterId] = useState(null);
  const [newRadiator, setNewRadiator] = useState(EMPTY_RADIATOR);
  const [saving, setSaving] = useState(false);

  // Dimension picker state — keyed by emitter id
  const [pickerState, setPickerState] = useState({});

  const getPickerState = (emitterId) => pickerState[emitterId] ?? { height: '', length: '' };

  const setPickerField = (emitterId, field, value) =>
    setPickerState(prev => ({
      ...prev,
      [emitterId]: { ...getPickerState(emitterId), [field]: value },
    }));

  // Standard sizes — same logic as RadiatorSizing
  const STANDARD_HEIGHTS = [300, 450, 600, 700];

  const nearestStandardHeight = (h) => {
    const n = parseInt(h, 10);
    if (isNaN(n) || n <= 0) return null;
    return STANDARD_HEIGHTS.reduce((best, s) =>
      Math.abs(s - n) < Math.abs(best - n) ? s : best
    );
  };

  const nearestStandardLength = (l) => {
    const n = parseInt(l, 10);
    if (isNaN(n) || n <= 0) return null;
    const snapped = Math.round(n / 100) * 100;
    return Math.max(300, Math.min(3000, snapped));
  };

  const findMatches = (rawHeight, rawLength) => {
    const h = nearestStandardHeight(rawHeight);
    const l = nearestStandardLength(rawLength);
    if (!h || !l) return { h: null, l: null, matches: [] };
    const matches = (radiatorSpecs ?? []).filter(s =>
      s.height === h && s.length === l && s.scope !== 'anonymous'
    );
    return { h, l, matches };
  };

  const handleAddRadiator = async () => {
    setSaving(true);
    try {
      const newId = await onAddRadiatorSpec(newRadiator);
      // Auto-select the new spec into the emitter that triggered the form
      if (newId && addRadiatorForEmitterId) {
        await onUpdate(room.id, addRadiatorForEmitterId, 'radiatorSpecId', newId);
      }
    } finally {
      setAddRadiatorForEmitterId(null);
      setNewRadiator(EMPTY_RADIATOR);
      setSaving(false);
    }
  };

  const showAddRadiator = addRadiatorForEmitterId !== null;

  return (
    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">

      {/* Header bar */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Emitters</h3>
        <button
          onClick={onAdd}
          className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1 transition"
        >
          <PlusIcon className="w-4 h-4" />
          Add Emitter
        </button>
      </div>

      <div className="p-4">

        {/* Add new radiator form — shown when triggered from a specific emitter row */}
        {showAddRadiator && (
          <div className="bg-blue-50 p-3 rounded border border-blue-300 mb-3">
            <h4 className="font-semibold text-sm mb-3">Add your own radiator</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Manufacturer</label>
                <input
                  type="text"
                  placeholder="e.g. Stelrad"
                  value={newRadiator.manufacturer}
                  onChange={(e) => setNewRadiator({...newRadiator, manufacturer: e.target.value})}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Model / Series</label>
                <input
                  type="text"
                  placeholder="e.g. Compact"
                  value={newRadiator.model}
                  onChange={(e) => setNewRadiator({...newRadiator, model: e.target.value})}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                <select
                  value={newRadiator.type}
                  onChange={(e) => setNewRadiator({...newRadiator, type: e.target.value})}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  {Object.entries(RADIATOR_TYPES).map(([group, types]) => (
                    <optgroup key={group} label={group}>
                      {types.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Height (mm)</label>
                <input
                  type="number"
                  placeholder="e.g. 600"
                  value={newRadiator.height}
                  onChange={(e) => setNewRadiator({...newRadiator, height: parseInt(e.target.value)})}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Length (mm)</label>
                <input
                  type="number"
                  placeholder="e.g. 1000"
                  value={newRadiator.length}
                  onChange={(e) => setNewRadiator({...newRadiator, length: parseInt(e.target.value)})}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Output @ ΔT50 (W)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 1245"
                  value={newRadiator.outputDt50}
                  onChange={(e) => setNewRadiator({...newRadiator, outputDt50: parseFloat(e.target.value)})}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Water volume (litres/metre)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 2.1"
                  value={newRadiator.waterVolume}
                  onChange={(e) => setNewRadiator({...newRadiator, waterVolume: parseFloat(e.target.value)})}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. low water content version"
                  value={newRadiator.notes}
                  onChange={(e) => setNewRadiator({...newRadiator, notes: e.target.value})}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-2">Radiator source</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      value="library"
                      checked={newRadiator.source === 'library'}
                      onChange={() => setNewRadiator({...newRadiator, source: 'library'})}
                      className="accent-blue-600"
                    />
                    <span>Manufacturer spec</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      value="site"
                      checked={newRadiator.source === 'site'}
                      onChange={() => setNewRadiator({...newRadiator, source: 'site'})}
                      className="accent-amber-600"
                    />
                    <span>Site-found existing</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddRadiator}
                disabled={saving}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add & Select'}
              </button>
              <button
                onClick={() => { setAddRadiatorForEmitterId(null); setNewRadiator(EMPTY_RADIATOR); }}
                className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {room.emitters && room.emitters.length > 0 && (
          <div className="mb-2 grid grid-cols-6 gap-2 text-xs font-semibold text-gray-600 px-2">
            <div>Type</div>
            <div>Specification</div>
            <div>Connection</div>
            <div>Qty</div>
            <div>Notes</div>
            <div></div>
          </div>
        )}

        {room.emitters && room.emitters.map(emitter => (
          <div key={emitter.id} className="grid grid-cols-6 gap-2 mb-2 items-start bg-gray-50 p-2 rounded border border-gray-200">
            <select
              value={emitter.emitterType}
              onChange={(e) => onUpdate(room.id, emitter.id, 'emitterType', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
            >
              {EMITTER_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            {emitter.emitterType === 'Radiator' ? (
              <>
                <div>
                  {emitter.radiatorSpecId ? (
                    // Spec already selected — show name with a clear link
                    (() => {
                      const spec = radiatorSpecs?.find(s => s.id === emitter.radiatorSpecId);
                      return (
                        <div>
                          <div className="text-xs text-gray-700 font-medium leading-tight">
                            {spec
                              ? `${spec.manufacturer} ${spec.model} — ${spec.type} ${spec.height}×${spec.length}mm`
                              : 'Unknown radiator'}
                          </div>
                          <button
                            onClick={() => onUpdate(room.id, emitter.id, 'radiatorSpecId', null)}
                            className="text-xs text-gray-400 hover:text-red-500 mt-0.5 transition"
                          >
                            ✕ change
                          </button>
                        </div>
                      );
                    })()
                  ) : (
                    // No spec yet — dimension picker
                    (() => {
                      const ps = getPickerState(emitter.id);
                      const { h, l, matches } = (ps.height && ps.length)
                        ? findMatches(ps.height, ps.length)
                        : { h: null, l: null, matches: [] };
                      const hasInput = ps.height || ps.length;
                      const snappedNote = hasInput && h && l
                        && (parseInt(ps.height) !== h || parseInt(ps.length) !== l)
                        ? `Nearest standard: ${h}×${l}mm`
                        : null;

                      return (
                        <div className="space-y-1.5">
                          <div className="text-xs font-semibold text-gray-500">Search using dimensions</div>
                          <div className="flex gap-1 items-center">
                            <input
                              type="number"
                              placeholder="H mm"
                              value={ps.height}
                              onChange={e => setPickerField(emitter.id, 'height', e.target.value)}
                              className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-gray-400 text-xs">×</span>
                            <input
                              type="number"
                              placeholder="L mm"
                              value={ps.length}
                              onChange={e => setPickerField(emitter.id, 'length', e.target.value)}
                              className="w-24 border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          {snappedNote && (
                            <p className="text-xs text-amber-600 italic">{snappedNote}</p>
                          )}

                          {/* Match chips */}
                          {hasInput && h && l && matches.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {matches.map(s => (
                                <button
                                  key={s.id}
                                  onClick={() => onUpdate(room.id, emitter.id, 'radiatorSpecId', s.id)}
                                  className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 transition text-left"
                                >
                                  <span className="font-semibold">{s.type.split(' ')[0]}</span>
                                  {' '}{s.manufacturer} {s.model}
                                  <span className="text-blue-500 ml-1">{s.output_dt50.toFixed(0)}W ΔT50</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {hasInput && h && l && matches.length === 0 && (
                            <p className="text-xs text-gray-500 italic">No specs found for {h}×{l}mm.</p>
                          )}

                          {/* Select from list */}
                          {(!showAddRadiator || addRadiatorForEmitterId === emitter.id) && (
                            <details className="text-xs">
                              <summary className="text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                                Select from list
                              </summary>
                              <select
                                value=""
                                onChange={e => e.target.value && onUpdate(room.id, emitter.id, 'radiatorSpecId', parseInt(e.target.value))}
                                className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Select radiator...</option>
                                {radiatorSpecs?.filter(s => s.scope === 'company' || s.scope === 'anonymous').length > 0 && (
                                  <optgroup label="— Your specs —">
                                    {radiatorSpecs.filter(s => s.scope === 'company' || s.scope === 'anonymous').map(s => (
                                      <option key={s.id} value={s.id}>
                                        {s.source === 'site' ? '◆ ' : ''}{s.manufacturer} {s.model} — {s.type} {s.height}×{s.length}mm
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {(() => {
                                  const lib = radiatorSpecs?.filter(s => s.scope === 'global' || s.scope === 'library') ?? [];
                                  const byMfr = lib.reduce((acc, s) => {
                                    if (!acc[s.manufacturer]) acc[s.manufacturer] = [];
                                    acc[s.manufacturer].push(s);
                                    return acc;
                                  }, {});
                                  return Object.entries(byMfr).map(([mfr, specs]) => (
                                    <optgroup key={mfr} label={`— ${mfr} —`}>
                                      {specs.map(s => (
                                        <option key={s.id} value={s.id}>
                                          {s.model} — {s.type} {s.height}×{s.length}mm
                                        </option>
                                      ))}
                                    </optgroup>
                                  ));
                                })()}
                              </select>
                            </details>
                          )}

                          {/* Add your own radiator */}
                          {(!showAddRadiator || addRadiatorForEmitterId === emitter.id) && (
                            <button
                              onClick={() => setAddRadiatorForEmitterId(emitter.id)}
                              className="text-xs text-green-600 hover:text-green-700 transition"
                            >
                              + Add your own radiator
                            </button>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
                <select
                  value={emitter.connectionType || 'TBOE'}
                  onChange={(e) => onUpdate(room.id, emitter.id, 'connectionType', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  {RADIATOR_CONNECTION_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={emitter.quantity || 1}
                  onChange={(e) => onUpdate(room.id, emitter.id, 'quantity', parseInt(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </>
            ) : emitter.emitterType === 'UFH' ? (
              <>
                <div className="col-span-2 text-sm text-gray-500 italic">UFH — sized in Radiator Sizing tab</div>
                <div className="text-sm text-gray-400">-</div>
              </>
            ) : emitter.emitterType === 'Fan Coil' ? (
              <>
                <div className="col-span-2 text-sm text-gray-500 italic">Fan Coil — sized in Radiator Sizing tab</div>
                <div className="text-sm text-gray-400">-</div>
              </>
            ) : (
              <>
                <div className="col-span-3 text-sm text-gray-400">-</div>
              </>
            )}

            <input
              type="text"
              value={emitter.notes || ''}
              onChange={(e) => onUpdate(room.id, emitter.id, 'notes', e.target.value)}
              placeholder="Optional notes"
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={() => onDelete(emitter.id)}
              className="text-red-600 hover:text-red-700 justify-self-center transition"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        ))}

        {(!room.emitters || room.emitters.length === 0) && (
          <div className="text-sm text-gray-500 italic py-2">
            No emitters added yet. Click "Add Emitter" to get started.
          </div>
        )}
      </div>
    </div>
  );
}
