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
            <h4 className="font-semibold text-sm mb-3">Add New Radiator to Database</h4>
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
                  <select
                    value={emitter.radiatorSpecId || ''}
                    onChange={(e) => onUpdate(room.id, emitter.id, 'radiatorSpecId', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select radiator...</option>
                    {radiatorSpecs && radiatorSpecs.map(spec => (
                      <option key={spec.id} value={spec.id}>
                        {spec.source === 'site' ? '◆ ' : ''}{spec.manufacturer} {spec.model} - {spec.type} {spec.height}x{spec.length}mm
                      </option>
                    ))}
                  </select>
                  {/* Only show the add button if the form isn't already open for another emitter */}
                  {(!showAddRadiator || addRadiatorForEmitterId === emitter.id) && (
                    <button
                      onClick={() => setAddRadiatorForEmitterId(emitter.id)}
                      className="text-xs text-green-600 hover:text-green-700 mt-1"
                    >
                      + Add new radiator
                    </button>
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
