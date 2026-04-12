// client/src/components/project/UValueLibrary.jsx
//
// Architecture note:
//   Each library entry row is extracted into a UValueRow component that holds
//   its own local state for typed inputs (name, u_value, notes). This prevents
//   the server round-trip from resetting fields while the user is typing.
//   The element_category select fires onUpdate immediately — no local state needed.

import { useState, useEffect } from 'react';
import FloorUValueCalculator from './FloorUValueCalculator';
import { PlusIcon, TrashIcon } from '../common/Icons';
import { ELEMENT_TYPES } from '../../utils/constants';

// ---------------------------------------------------------------------------
// UValueRow — one row per library entry, holds local state for typed inputs
// ---------------------------------------------------------------------------
function UValueRow({ uVal, onUpdate, onDelete }) {
  const [local, setLocal] = useState({
    name:    uVal.name,
    uValue:  uVal.u_value,
    notes:   uVal.notes ?? '',
  });

  // Sync when switching projects or after an external reload changes the entry
  useEffect(() => {
    setLocal({
      name:    uVal.name,
      uValue:  uVal.u_value,
      notes:   uVal.notes ?? '',
    });
  }, [uVal.id]);

  const handleChange = (field, value) => {
    setLocal(prev => ({ ...prev, [field]: value }));
  };

  const handleTextBlur = (field) => {
    onUpdate(uVal.id, field, local[field]);
  };

  const handleNumberBlur = () => {
    const parsed = parseFloat(local.uValue);
    const safe   = isNaN(parsed) ? 0 : parsed;
    setLocal(prev => ({ ...prev, uValue: safe }));
    onUpdate(uVal.id, 'uValue', safe);
  };

  return (
    <div className="grid grid-cols-5 gap-2 items-center bg-gray-50 p-3 rounded">
      {/* Category — select fires immediately, no local state needed */}
      <select
        value={uVal.element_category}
        onChange={e => onUpdate(uVal.id, 'elementCategory', e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
      >
        {ELEMENT_TYPES.map(type => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>

      {/* Name */}
      <input
        type="text"
        value={local.name}
        onChange={e => handleChange('name', e.target.value)}
        onBlur={() => handleTextBlur('name')}
        placeholder="e.g., Cavity wall with insulation"
        className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
      />

      {/* U-value */}
      <input
        type="number"
        step="0.01"
        value={local.uValue}
        onChange={e => handleChange('uValue', e.target.value)}
        onBlur={handleNumberBlur}
        className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
      />

      {/* Notes */}
      <input
        type="text"
        value={local.notes}
        onChange={e => handleChange('notes', e.target.value)}
        onBlur={() => handleTextBlur('notes')}
        placeholder="Optional notes"
        className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
      />

      {/* Delete */}
      <button
        onClick={() => onDelete(uVal.id)}
        className="text-red-600 hover:text-red-700 justify-self-center transition"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UValueLibrary — renders the list and delegates each row to UValueRow
// ---------------------------------------------------------------------------
export default function UValueLibrary({ project, onAdd, onAddFromCalculator, onUpdate, onDelete }) {
  const [sortOrder, setSortOrder] = useState('default');

  const sortedLibrary = (() => {
    const lib = project.uValueLibrary || [];
    if (sortOrder === 'alpha') {
      return [...lib].sort((a, b) => {
        const catCmp = (a.element_category || '').localeCompare(b.element_category || '');
        if (catCmp !== 0) return catCmp;
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    return lib; // default: insertion order (by id, as returned from server)
  })();

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">U-Value Library</h2>
        <p className="text-sm text-gray-600 mb-4">
          Create a library of U-values for different construction types. You can then quickly apply these to elements in your rooms.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 transition"
          >
            <PlusIcon />
            Add U-Value
          </button>
          {sortedLibrary.length > 1 && (
            <div className="flex items-center gap-1 border border-gray-300 rounded overflow-hidden text-sm">
              <button
                onClick={() => setSortOrder('default')}
                className={`px-3 py-1.5 transition ${sortOrder === 'default' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Default order
              </button>
              <button
                onClick={() => setSortOrder('alpha')}
                className={`px-3 py-1.5 transition ${sortOrder === 'alpha' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                A–Z
              </button>
            </div>
          )}
        </div>
      </div>

      {sortedLibrary.length > 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-2 text-xs font-semibold text-gray-600 px-2 mb-2">
            <div>Category</div>
            <div>Construction Name</div>
            <div>U-Value (W/m²·K)</div>
            <div>Notes</div>
            <div></div>
          </div>
          {sortedLibrary.map(uVal => (
            <UValueRow
              key={uVal.id}
              uVal={uVal}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p>No U-values defined yet. Click "Add U-Value" to create your library.</p>
        </div>
      )}

      <div className="mt-8 border-t pt-6">
        <h2 className="text-xl font-bold mb-4">Floor U-Value Calculator</h2>
        <FloorUValueCalculator onSaveToLibrary={onAddFromCalculator} />
      </div>
    </div>
  );
}
