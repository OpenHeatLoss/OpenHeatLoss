// client/src/components/settings/SettingsPage.jsx
import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { RADIATOR_CONNECTION_TYPES } from '../../utils/constants';

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

const SOURCE_LABELS = {
  library: { label: 'Manufacturer spec', colour: 'bg-blue-100 text-blue-700' },
  site:    { label: 'Site-found',        colour: 'bg-amber-100 text-amber-700' },
};

const SCOPE_LABELS = {
  global:    { label: 'Global library', colour: 'bg-purple-100 text-purple-700' },
  library:   { label: 'Global library', colour: 'bg-purple-100 text-purple-700' },
  company:   { label: 'Company',        colour: 'bg-gray-100 text-gray-600' },
  anonymous: { label: 'Anonymous',      colour: 'bg-amber-100 text-amber-700' },
};

// ---------------------------------------------------------------------------
// Radiator Library tab
// ---------------------------------------------------------------------------
function RadiatorLibrary() {
  const [specs, setSpecs]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState(null);
  const [editDraft, setEditDraft]   = useState({});
  const [saving, setSaving]         = useState(false);
  const [filterSource, setFilterSource] = useState('all');
  const [showAddForm, setShowAddForm]   = useState(false);
  const [newSpec, setNewSpec] = useState({
    manufacturer: '', model: '',
    type: 'K2 / Type 22 — Double panel, double convector',
    height: 600, length: 1000,
    outputDt50: 0, waterVolume: 0,
    notes: '', source: 'library', scope: 'company',
  });

  const loadSpecs = async () => {
    setLoading(true);
    try {
      const data = await api.getRadiatorSpecs();
      setSpecs(data);
    } catch (err) {
      console.error('Error loading radiator specs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSpecs(); }, []);

  const startEdit = (spec) => {
    setEditingId(spec.id);
    setEditDraft({
      manufacturer: spec.manufacturer,
      model:        spec.model,
      type:         spec.type,
      height:       spec.height,
      length:       spec.length,
      outputDt50:   spec.output_dt50,
      waterVolume:  spec.water_volume,
      notes:        spec.notes || '',
      source:       spec.source || 'library',
      scope:        spec.scope  || 'company',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.updateRadiatorSpec(editingId, editDraft);
      await loadSpecs();
      setEditingId(null);
    } catch (err) {
      console.error('Error saving radiator spec:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (spec) => {
    try {
      const { count } = await api.getRadiatorSpecUsage(spec.id);
      const message = count > 0
        ? `"${spec.manufacturer} ${spec.model}" is used in ${count} radiator schedule${count > 1 ? 's' : ''}. Deleting it will leave those schedule rows without a specification. Are you sure?`
        : `Delete "${spec.manufacturer} ${spec.model}"? This cannot be undone.`;

      if (!window.confirm(message)) return;
      await api.deleteRadiatorSpec(spec.id);
      await loadSpecs();
    } catch (err) {
      console.error('Error deleting radiator spec:', err);
    }
  };

  const handleAdd = async () => {
    try {
      await api.createRadiatorSpec(newSpec);
      await loadSpecs();
      setShowAddForm(false);
      setNewSpec({
        manufacturer: '', model: '',
        type: 'K2 / Type 22 — Double panel, double convector',
        height: 600, length: 1000,
        outputDt50: 0, waterVolume: 0,
        notes: '', source: 'library', scope: 'company',
      });
    } catch (err) {
      console.error('Error adding radiator spec:', err);
    }
  };

  const filtered = specs.filter(s => {
    // Only show specs the engineer can actually edit — company or anonymous.
    // Global library records are surfaced in the emitter picker, not here.
    if (s.scope === 'global' || s.scope === 'library') return false;
    if (filterSource !== 'all' && (s.source || 'library') !== filterSource) return false;
    return true;
  });

  // Count of global library records (for the info note)
  const globalCount = specs.filter(s => s.scope === 'global' || s.scope === 'library').length;

  if (loading) return (
    <div className="text-gray-500 text-sm py-8 text-center">Loading radiator library...</div>
  );

  return (
    <div>
      {/* Global library info note */}
      {globalCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
          <span className="font-semibold">{globalCount} manufacturer specs</span> are available in the global library (e.g. Stelrad Classic Compact).
          These appear in the radiator picker when sizing emitters — they can't be edited here.
          Add your own specs below to supplement the library.
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex gap-3 items-center">
          <div>
            <label className="text-xs font-semibold text-gray-600 mr-1">Source:</label>
            <select
              value={filterSource}
              onChange={e => setFilterSource(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="library">Manufacturer spec</option>
              <option value="site">Site-found</option>
            </select>
          </div>
          <span className="text-xs text-gray-400">{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition"
        >
          {showAddForm ? 'Cancel' : '+ Add Radiator'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
          <h4 className="font-semibold text-sm mb-3 text-green-900">Add new radiator to library</h4>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Manufacturer', field: 'manufacturer', type: 'text', placeholder: 'e.g. Stelrad' },
              { label: 'Model / Series', field: 'model', type: 'text', placeholder: 'e.g. Compact' },
              { label: 'Height (mm)', field: 'height', type: 'number', placeholder: '600' },
              { label: 'Length (mm)', field: 'length', type: 'number', placeholder: '1000' },
              { label: 'Output @ ΔT50 (W)', field: 'outputDt50', type: 'number', placeholder: '1245' },
              { label: 'Water content (L/m)', field: 'waterVolume', type: 'number', placeholder: '1.7' },
            ].map(({ label, field, type, placeholder }) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                <input
                  type={type}
                  step={type === 'number' ? '0.01' : undefined}
                  placeholder={placeholder}
                  value={newSpec[field]}
                  onChange={e => setNewSpec(p => ({
                    ...p,
                    [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                  }))}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
              <select
                value={newSpec.type}
                onChange={e => setNewSpec(p => ({...p, type: e.target.value}))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                {Object.entries(RADIATOR_TYPES).map(([group, types]) => (
                  <optgroup key={group} label={group}>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                placeholder="Optional"
                value={newSpec.notes}
                onChange={e => setNewSpec(p => ({...p, notes: e.target.value}))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Scope</label>
              <select
                value={newSpec.scope}
                onChange={e => setNewSpec(p => ({...p, scope: e.target.value}))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="company">Company</option>
                <option value="global">Global</option>
              </select>
            </div>
            <div className="col-span-4">
              <label className="block text-xs font-semibold text-gray-600 mb-2">Source</label>
              <div className="flex gap-4">
                {[
                  { value: 'library', label: 'Manufacturer spec', hint: '— from datasheet' },
                  { value: 'site',    label: 'Site-found existing', hint: '— found on survey' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      value={opt.value}
                      checked={newSpec.source === opt.value}
                      onChange={() => setNewSpec(p => ({...p, source: opt.value}))}
                      className={opt.value === 'site' ? 'accent-amber-600' : 'accent-blue-600'}
                    />
                    <span>{opt.label}</span>
                    <span className="text-xs text-gray-400">{opt.hint}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAdd}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700"
            >
              Add to Library
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border border-gray-200">Manufacturer</th>
              <th className="text-left p-2 border border-gray-200">Model</th>
              <th className="text-left p-2 border border-gray-200">Type</th>
              <th className="text-right p-2 border border-gray-200">H (mm)</th>
              <th className="text-right p-2 border border-gray-200">L (mm)</th>
              <th className="text-right p-2 border border-gray-200">ΔT50 (W)</th>
              <th className="text-right p-2 border border-gray-200">L/m</th>
              <th className="text-left p-2 border border-gray-200">Notes</th>
              <th className="text-center p-2 border border-gray-200">Source</th>
              <th className="text-center p-2 border border-gray-200">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan="10" className="text-center py-8 text-gray-400">
                  {specs.length === 0
                    ? 'No custom radiators added yet. Click "+ Add Radiator" to add your own specs.'
                    : 'No radiators match the current filter.'}
                </td>
              </tr>
            )}
            {filtered.map(spec => {
              const isEditing = editingId === spec.id;
              const src = SOURCE_LABELS[spec.source || 'library'] ?? { label: spec.source || '—', colour: 'bg-gray-100 text-gray-500' };

              return (
                <tr key={spec.id} className={`border-b border-gray-100 ${isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  {isEditing ? (
                    <>
                      {/* Editable cells */}
                      {[
                        { field: 'manufacturer', type: 'text' },
                        { field: 'model',        type: 'text' },
                      ].map(({ field, type }) => (
                        <td key={field} className="p-1 border border-gray-200">
                          <input
                            type={type}
                            value={editDraft[field]}
                            onChange={e => setEditDraft(p => ({...p, [field]: e.target.value}))}
                            className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                      <td className="p-1 border border-gray-200">
                        <select
                          value={editDraft.type}
                          onChange={e => setEditDraft(p => ({...p, type: e.target.value}))}
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                        >
                          {Object.entries(RADIATOR_TYPES).map(([group, types]) => (
                            <optgroup key={group} label={group}>
                              {types.map(t => <option key={t} value={t}>{t}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      {[
                        { field: 'height',      step: '1' },
                        { field: 'length',      step: '1' },
                        { field: 'outputDt50',  step: '0.1' },
                        { field: 'waterVolume', step: '0.01' },
                      ].map(({ field, step }) => (
                        <td key={field} className="p-1 border border-gray-200">
                          <input
                            type="number"
                            step={step}
                            value={editDraft[field]}
                            onChange={e => setEditDraft(p => ({...p, [field]: parseFloat(e.target.value) || 0}))}
                            className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                      <td className="p-1 border border-gray-200">
                        <input
                          type="text"
                          value={editDraft.notes}
                          onChange={e => setEditDraft(p => ({...p, notes: e.target.value}))}
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="p-1 border border-gray-200 text-center">
                        <select
                          value={editDraft.source}
                          onChange={e => setEditDraft(p => ({...p, source: e.target.value}))}
                          className="text-xs border border-blue-300 rounded px-1 py-1 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="library">Manufacturer</option>
                          <option value="site">Site-found</option>
                        </select>
                      </td>
                      <td className="p-1 border border-gray-200 text-center">
                        <select
                          value={editDraft.scope}
                          onChange={e => setEditDraft(p => ({...p, scope: e.target.value}))}
                          className="text-xs border border-blue-300 rounded px-1 py-1 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="company">Company</option>
                          <option value="global">Global</option>
                        </select>
                      </td>
                      <td className="p-1 border border-gray-200 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      {/* Read-only cells */}
                      <td className="p-2 border border-gray-200 font-medium">{spec.manufacturer}</td>
                      <td className="p-2 border border-gray-200 text-gray-700">{spec.model}</td>
                      <td className="p-2 border border-gray-200 text-gray-600 text-xs">{spec.type}</td>
                      <td className="p-2 border border-gray-200 text-right">{spec.height}</td>
                      <td className="p-2 border border-gray-200 text-right">{spec.length}</td>
                      <td className="p-2 border border-gray-200 text-right font-semibold">{spec.output_dt50?.toFixed(0)}</td>
                      <td className="p-2 border border-gray-200 text-right text-gray-600">{spec.water_volume?.toFixed(2)}</td>
                      <td className="p-2 border border-gray-200 text-gray-500 text-xs">{spec.notes}</td>
                      <td className="p-2 border border-gray-200 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${src.colour}`}>
                          {src.label}
                        </span>
                      </td>
                      <td className="p-2 border border-gray-200 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => startEdit(spec)}
                            className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(spec)}
                            className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Materials Library tab
// Company-scoped reusable item templates. Built organically via "Save to
// library" in the job materials editor, or managed directly here.
// ---------------------------------------------------------------------------

const MAT_CATEGORIES = [
  { key: 'heat_pump',  label: 'Heat pump' },
  { key: 'cylinder',   label: 'Cylinder' },
  { key: 'radiators',  label: 'Radiators / emitters' },
  { key: 'pipework',   label: 'Pipework & materials' },
  { key: 'electrical', label: 'Electrical works' },
  { key: 'labour',     label: 'Labour' },
  { key: 'design',     label: 'Design / survey fee' },
  { key: 'mcs',        label: 'MCS registration' },
  { key: 'other',      label: 'Other' },
];

const MAT_PRICING_MODES = [
  { value: 'unit',      label: 'Unit × price' },
  { value: 'per_metre', label: 'Length × price/m' },
  { value: 'flat',      label: 'Flat figure' },
];

function MaterialsLibrarySettings() {
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [editingId,   setEditingId]   = useState(null);
  const [editDraft,   setEditDraft]   = useState({});
  const [saving,      setSaving]      = useState(false);
  const [filterCat,   setFilterCat]   = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    categoryKey:     'pipework',
    description:     '',
    pricingMode:     'unit',
    unitLabel:       'each',
    defaultUnitCost: 0,
    notes:           '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getMaterialsLibrary();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading materials library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = filterCat === 'all'
    ? items
    : items.filter(i => i.category_key === filterCat);

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditDraft({
      categoryKey:     item.category_key,
      description:     item.description,
      pricingMode:     item.pricing_mode,
      unitLabel:       item.unit_label || '',
      defaultUnitCost: item.default_unit_cost,
      notes:           item.notes || '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.updateMaterialsLibraryItem(editingId, editDraft);
      await load();
      setEditingId(null);
    } catch (err) {
      console.error('Error saving library item:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.description}"? This cannot be undone.`)) return;
    try {
      await api.deleteMaterialsLibraryItem(item.id);
      await load();
    } catch (err) {
      console.error('Error deleting library item:', err);
    }
  };

  const handleAdd = async () => {
    if (!newItem.description.trim()) return;
    try {
      await api.createMaterialsLibraryItem(newItem);
      await load();
      setShowAddForm(false);
      setNewItem({
        categoryKey: 'pipework', description: '', pricingMode: 'unit',
        unitLabel: 'each', defaultUnitCost: 0, notes: '',
      });
    } catch (err) {
      console.error('Error adding library item:', err);
    }
  };

  if (loading) return (
    <div className="text-gray-500 text-sm py-8 text-center">Loading materials library...</div>
  );

  return (
    <div>
      <div className="mb-5">
        <h3 className="font-semibold text-gray-800 mb-1">Materials library</h3>
        <p className="text-sm text-gray-500">
          Company-wide reusable items. Add items here or use the "Save to library" button
          on any job materials line. Default prices are copied to the job at time of use —
          changes here don't affect existing job items.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex gap-3 items-center">
          <div>
            <label className="text-xs font-semibold text-gray-600 mr-1">Category:</label>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All categories</option>
              {MAT_CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-gray-400">{filtered.length} {filtered.length === 1 ? 'item' : 'items'}</span>
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition"
        >
          {showAddForm ? 'Cancel' : '+ Add Item'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
          <h4 className="font-semibold text-sm mb-3 text-green-900">Add new library item</h4>
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Description *</label>
              <input
                type="text"
                placeholder="e.g. 22mm copper pipe, Grundfos UPS3 15-50"
                value={newItem.description}
                onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
              <select
                value={newItem.categoryKey}
                onChange={e => setNewItem(p => ({ ...p, categoryKey: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                {MAT_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Pricing mode</label>
              <select
                value={newItem.pricingMode}
                onChange={e => setNewItem(p => ({ ...p, pricingMode: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              >
                {MAT_PRICING_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Unit label</label>
              <input
                type="text"
                placeholder="e.g. m, each, coil"
                value={newItem.unitLabel}
                onChange={e => setNewItem(p => ({ ...p, unitLabel: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Default price £</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newItem.defaultUnitCost}
                onChange={e => setNewItem(p => ({ ...p, defaultUnitCost: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                placeholder="Optional"
                value={newItem.notes}
                onChange={e => setNewItem(p => ({ ...p, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAdd}
              disabled={!newItem.description.trim()}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition"
            >
              Add to Library
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border border-gray-200">Description</th>
              <th className="text-left p-2 border border-gray-200">Category</th>
              <th className="text-left p-2 border border-gray-200">Mode</th>
              <th className="text-left p-2 border border-gray-200">Unit</th>
              <th className="text-right p-2 border border-gray-200">Default price £</th>
              <th className="text-left p-2 border border-gray-200">Notes</th>
              <th className="text-center p-2 border border-gray-200">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center py-8 text-gray-400">
                  No library items yet. Add items above or use "Save to library" on a job materials line.
                </td>
              </tr>
            )}
            {filtered.map(item => {
              const isEditing = editingId === item.id;
              const catLabel  = MAT_CATEGORIES.find(c => c.key === item.category_key)?.label || item.category_key;
              return (
                <tr key={item.id} className={`border-b border-gray-100 ${isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  {isEditing ? (
                    <>
                      <td className="p-1 border border-gray-200">
                        <input type="text" value={editDraft.description}
                          onChange={e => setEditDraft(p => ({ ...p, description: e.target.value }))}
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="p-1 border border-gray-200">
                        <select value={editDraft.categoryKey}
                          onChange={e => setEditDraft(p => ({ ...p, categoryKey: e.target.value }))}
                          className="w-full border border-blue-300 rounded px-1 py-1 text-sm focus:ring-2 focus:ring-blue-500">
                          {MAT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </td>
                      <td className="p-1 border border-gray-200">
                        <select value={editDraft.pricingMode}
                          onChange={e => setEditDraft(p => ({ ...p, pricingMode: e.target.value }))}
                          className="w-full border border-blue-300 rounded px-1 py-1 text-sm focus:ring-2 focus:ring-blue-500">
                          {MAT_PRICING_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </td>
                      <td className="p-1 border border-gray-200">
                        <input type="text" value={editDraft.unitLabel}
                          onChange={e => setEditDraft(p => ({ ...p, unitLabel: e.target.value }))}
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="p-1 border border-gray-200">
                        <input type="number" step="0.01" value={editDraft.defaultUnitCost}
                          onChange={e => setEditDraft(p => ({ ...p, defaultUnitCost: parseFloat(e.target.value) || 0 }))}
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="p-1 border border-gray-200">
                        <input type="text" value={editDraft.notes}
                          onChange={e => setEditDraft(p => ({ ...p, notes: e.target.value }))}
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="p-1 border border-gray-200 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={saveEdit} disabled={saving}
                            className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50">
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={cancelEdit}
                            className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-300">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-2 border border-gray-200 font-medium">{item.description}</td>
                      <td className="p-2 border border-gray-200 text-xs text-gray-600">{catLabel}</td>
                      <td className="p-2 border border-gray-200 text-xs text-gray-600">
                        {MAT_PRICING_MODES.find(m => m.value === item.pricing_mode)?.label || item.pricing_mode}
                      </td>
                      <td className="p-2 border border-gray-200 text-gray-600">{item.unit_label || '—'}</td>
                      <td className="p-2 border border-gray-200 text-right font-semibold">
                        £{(item.default_unit_cost || 0).toFixed(2)}
                      </td>
                      <td className="p-2 border border-gray-200 text-gray-500 text-xs">{item.notes || ''}</td>
                      <td className="p-2 border border-gray-200 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => startEdit(item)}
                            className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(item)}
                            className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700">
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rate Card tab
// Company-wide versioned rate cards. One card is "current" at any time.
// Historical cards are retained for reference — never deleted.
// Standard task items (e.g. Radiator installation) sit beneath each card.
// ---------------------------------------------------------------------------

const RATE_UNITS = [
  { value: 'unit', label: 'Per item / task' },
  { value: 'day',  label: 'Per day' },
  { value: 'hour', label: 'Per hour' },
];

function RateCardSettings() {
  const [cards,       setCards]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [expandedId,  setExpandedId]  = useState(null); // which card is expanded
  const [showNewCard, setShowNewCard] = useState(false);
  const [saving,      setSaving]      = useState(false);

  const [newCard, setNewCard] = useState({
    effectiveFrom: new Date().toISOString().slice(0, 10),
    reviewDue:     '',
    dayRate:       0,
    hourlyRate:    0,
    notes:         '',
    isCurrent:     true,
  });

  // Per-card item addition state keyed by card id
  const [newItemDraft, setNewItemDraft] = useState({}); // { [cardId]: { description, unit, rate } }

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getLabourRateCards();
      const cards = Array.isArray(data) ? data : [];
      // Load full card with items for each (parallel)
      const full = await Promise.all(
        cards.map(c => api.getLabourRateCard(c.id).catch(() => ({ ...c, items: [] })))
      );
      setCards(full);
      // Auto-expand the current card
      const current = full.find(c => c.is_current);
      if (current) setExpandedId(current.id);
    } catch (err) {
      console.error('Error loading rate cards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreateCard = async () => {
    if (!newCard.effectiveFrom) return;
    setSaving(true);
    try {
      await api.createLabourRateCard(newCard);
      await load();
      setShowNewCard(false);
      setNewCard({
        effectiveFrom: new Date().toISOString().slice(0, 10),
        reviewDue: '', dayRate: 0, hourlyRate: 0, notes: '', isCurrent: true,
      });
    } catch (err) {
      console.error('Error creating rate card:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSetCurrent = async (card) => {
    if (!window.confirm(`Make the card effective from ${new Date(card.effective_from).toLocaleDateString('en-GB')} the current rate card?`)) return;
    try {
      await api.updateLabourRateCard(card.id, { ...card, isCurrent: true });
      await load();
    } catch (err) {
      console.error('Error setting current card:', err);
    }
  };

  const handleAddItem = async (cardId) => {
    const draft = newItemDraft[cardId] || {};
    if (!draft.description?.trim()) return;
    try {
      await api.addLabourRateItem(cardId, {
        description: draft.description,
        unit:        draft.unit || 'unit',
        rate:        parseFloat(draft.rate) || 0,
      });
      setNewItemDraft(p => ({ ...p, [cardId]: { description: '', unit: 'unit', rate: '' } }));
      await load();
    } catch (err) {
      console.error('Error adding rate item:', err);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Delete this rate item?')) return;
    try {
      await api.deleteLabourRateItem(itemId);
      await load();
    } catch (err) {
      console.error('Error deleting rate item:', err);
    }
  };

  const setItemDraft = (cardId, field, value) => {
    setNewItemDraft(p => ({
      ...p,
      [cardId]: { ...(p[cardId] || { description: '', unit: 'unit', rate: '' }), [field]: value },
    }));
  };

  if (loading) return (
    <div className="text-gray-500 text-sm py-8 text-center">Loading rate cards...</div>
  );

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-800 mb-1">Labour rate card</h3>
          <p className="text-sm text-gray-500">
            Company-wide rates. The current card is recorded on each quote for historical reference.
            Create a new card when rates change — old cards are kept for audit purposes.
          </p>
        </div>
        <button
          onClick={() => setShowNewCard(v => !v)}
          className="shrink-0 bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition"
        >
          {showNewCard ? 'Cancel' : '+ New Rate Card'}
        </button>
      </div>

      {/* New card form */}
      {showNewCard && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-6">
          <h4 className="font-semibold text-sm mb-3 text-green-900">New rate card</h4>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Effective from *</label>
              <input type="date" value={newCard.effectiveFrom}
                onChange={e => setNewCard(p => ({ ...p, effectiveFrom: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Review due</label>
              <input type="date" value={newCard.reviewDue}
                onChange={e => setNewCard(p => ({ ...p, reviewDue: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Day rate £</label>
              <input type="number" step="1" min="0" value={newCard.dayRate}
                onChange={e => setNewCard(p => ({ ...p, dayRate: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Hourly rate £</label>
              <input type="number" step="1" min="0" value={newCard.hourlyRate}
                onChange={e => setNewCard(p => ({ ...p, hourlyRate: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
              <input type="text" placeholder="e.g. Revised Jan 2026 — materials cost increase"
                value={newCard.notes}
                onChange={e => setNewCard(p => ({ ...p, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={newCard.isCurrent}
                  onChange={e => setNewCard(p => ({ ...p, isCurrent: e.target.checked }))}
                  className="accent-blue-600" />
                Set as current
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleCreateCard} disabled={saving || !newCard.effectiveFrom}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition">
              {saving ? 'Creating...' : 'Create Rate Card'}
            </button>
            <button onClick={() => setShowNewCard(false)}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {cards.length === 0 && !showNewCard && (
        <div className="text-gray-400 text-sm py-8 text-center border border-gray-200 rounded-lg">
          No rate cards yet. Create one above to start recording your labour rates.
        </div>
      )}

      {/* Card list */}
      <div className="space-y-3">
        {cards.map(card => {
          const isExpanded = expandedId === card.id;
          const effDate = new Date(card.effective_from).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          });
          const reviewDate = card.review_due
            ? new Date(card.review_due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : null;
          const itemDraft = newItemDraft[card.id] || { description: '', unit: 'unit', rate: '' };

          return (
            <div key={card.id} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Card header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : card.id)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
              >
                <div className="flex items-center gap-3">
                  {card.is_current && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-semibold">
                      Current
                    </span>
                  )}
                  <span className="text-sm font-semibold text-gray-700">Effective {effDate}</span>
                  {reviewDate && (
                    <span className="text-xs text-gray-400">Review due {reviewDate}</span>
                  )}
                  {card.notes && (
                    <span className="text-xs text-gray-500 italic">{card.notes}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600 text-right">
                    <span className="font-medium">£{card.day_rate}/day</span>
                    <span className="text-gray-400 mx-1">·</span>
                    <span className="font-medium">£{card.hourly_rate}/hr</span>
                  </div>
                  <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="bg-white">
                  {/* Set as current — only shown for non-current cards */}
                  {!card.is_current && (
                    <div className="px-4 pt-3">
                      <button
                        onClick={() => handleSetCurrent(card)}
                        className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1.5 rounded font-medium transition"
                      >
                        Set as current rate card
                      </button>
                    </div>
                  )}

                  {/* Standard task items */}
                  <div className="px-4 pt-3 pb-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Standard tasks ({card.items?.length || 0})
                    </div>

                    {(!card.items || card.items.length === 0) && (
                      <div className="text-xs text-gray-400 py-2">
                        No standard tasks yet — add common labour items below.
                      </div>
                    )}

                    {card.items && card.items.length > 0 && (
                      <table className="w-full text-sm mb-3">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b border-gray-100">
                            <th className="text-left pb-1 font-semibold">Task</th>
                            <th className="text-left pb-1 font-semibold">Unit</th>
                            <th className="text-right pb-1 font-semibold">Rate £</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {card.items.map(item => (
                            <tr key={item.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-1.5 text-gray-800">{item.description}</td>
                              <td className="py-1.5 text-gray-500 text-xs">
                                {RATE_UNITS.find(u => u.value === item.unit)?.label || item.unit}
                              </td>
                              <td className="py-1.5 text-right font-medium">
                                £{(item.rate || 0).toFixed(2)}
                              </td>
                              <td className="py-1.5 text-right">
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="text-red-400 hover:text-red-600 text-xs px-1"
                                  title="Delete"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* Add task item row */}
                    <div className="flex gap-2 items-end pt-1 border-t border-gray-100">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Task description</label>
                        <input
                          type="text"
                          placeholder="e.g. Radiator installation"
                          value={itemDraft.description}
                          onChange={e => setItemDraft(card.id, 'description', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddItem(card.id)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="w-40">
                        <label className="block text-xs text-gray-500 mb-1">Unit</label>
                        <select
                          value={itemDraft.unit || 'unit'}
                          onChange={e => setItemDraft(card.id, 'unit', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                        >
                          {RATE_UNITS.map(u => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-28">
                        <label className="block text-xs text-gray-500 mb-1">Rate £</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0"
                          value={itemDraft.rate}
                          onChange={e => setItemDraft(card.id, 'rate', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddItem(card.id)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        onClick={() => handleAddItem(card.id)}
                        disabled={!itemDraft.description?.trim()}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-40 transition"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project Management tab
// ---------------------------------------------------------------------------
function ProjectManagement({ onDeleteProject }) {
  const [projects, setProjects]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [confirmId, setConfirmId]       = useState(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting]         = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Error loading projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const confirmProject = projects.find(p => p.id === confirmId);
  const nameMatches    = confirmProject && confirmInput === confirmProject.name;

  const handleDelete = async () => {
    if (!nameMatches) return;
    setDeleting(true);
    try {
      await onDeleteProject(confirmId);
      setConfirmId(null);
      setConfirmInput('');
      await load();
    } catch (err) {
      console.error('Error deleting project:', err);
    } finally {
      setDeleting(false);
    }
  };

  const cancelConfirm = () => {
    setConfirmId(null);
    setConfirmInput('');
  };

  if (loading) return (
    <div className="text-gray-500 text-sm py-8 text-center">Loading projects...</div>
  );

  return (
    <div>
      <div className="mb-5">
        <h3 className="font-semibold text-gray-800 mb-1">Delete a project</h3>
        <p className="text-sm text-gray-500">
          Deleting a project permanently removes all rooms, elements, emitter schedules,
          quotes, and design data associated with it. This cannot be undone.
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {projects.length === 0 ? (
          <div className="text-gray-400 text-sm py-8 text-center">No projects found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">Project</th>
                <th className="text-left p-3 font-semibold text-gray-600">Status</th>
                <th className="text-left p-3 font-semibold text-gray-600">Created</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0">
                  <td className="p-3 font-medium text-gray-800">{p.name}</td>
                  <td className="p-3 text-gray-500 capitalize">{p.status}</td>
                  <td className="p-3 text-gray-400">
                    {new Date(p.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td className="p-3 text-right">
                    {confirmId === p.id ? (
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          Type project name to confirm:
                        </span>
                        <input
                          type="text"
                          value={confirmInput}
                          onChange={e => setConfirmInput(e.target.value)}
                          placeholder={p.name}
                          autoFocus
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-48
                                     focus:ring-2 focus:ring-red-400 focus:border-red-400"
                        />
                        <button
                          onClick={handleDelete}
                          disabled={!nameMatches || deleting}
                          className="bg-red-600 text-white px-3 py-1 rounded text-xs
                                     hover:bg-red-700 disabled:opacity-40
                                     disabled:cursor-not-allowed transition"
                        >
                          {deleting ? 'Deleting…' : 'Delete'}
                        </button>
                        <button
                          onClick={cancelConfirm}
                          className="text-gray-500 hover:text-gray-700 px-2 py-1 rounded
                                     text-xs border border-gray-300 hover:bg-gray-50 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setConfirmId(p.id); setConfirmInput(''); }}
                        className="text-red-600 hover:text-red-700 text-xs border
                                   border-red-300 px-3 py-1 rounded hover:bg-red-50 transition"
                      >
                        Delete…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Settings page — tab shell
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'radiators',        label: 'Radiator Library' },
  { id: 'materials-library',label: 'Materials Library' },
  { id: 'rate-card',        label: 'Rate Card' },
  { id: 'projects',         label: 'Project Management' },
  { id: 'company',          label: 'Company Details' },
  { id: 'users',            label: 'Users' },
];

export default function SettingsPage({ onBack, onDeleteProject }) {
  const [activeTab, setActiveTab] = useState('radiators');

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">

          {/* Header */}
          <div className="bg-gray-800 text-white px-8 py-5 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Settings</h1>
              <p className="text-gray-400 text-sm mt-0.5">Settings</p>
            </div>
            <button
              onClick={onBack}
              className="text-gray-300 hover:text-white text-sm transition"
            >
              ← Back to dashboard
            </button>
          </div>

          {/* Tab nav */}
          <div className="border-b border-gray-200 px-8">
            <nav className="flex gap-0">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-3 text-sm font-semibold border-b-2 transition ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div className="p-8">
            {activeTab === 'radiators'         && <RadiatorLibrary />}
            {activeTab === 'materials-library' && <MaterialsLibrarySettings />}
            {activeTab === 'rate-card'         && <RateCardSettings />}
            {activeTab === 'projects'          && <ProjectManagement onDeleteProject={onDeleteProject} />}

            {activeTab === 'company' && (
              <div className="text-gray-400 text-sm py-12 text-center">
                Company details management — coming soon.
              </div>
            )}

            {activeTab === 'users' && (
              <div className="text-gray-400 text-sm py-12 text-center">
                User management — coming soon.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}