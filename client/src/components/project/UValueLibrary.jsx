// client/src/components/project/UValueLibrary.jsx
import FloorUValueCalculator from './FloorUValueCalculator';
import { PlusIcon, TrashIcon } from '../common/Icons';
import { ELEMENT_TYPES } from '../../utils/constants';

export default function UValueLibrary({ project, onAdd, onAddFromCalculator, onUpdate, onDelete }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">U-Value Library</h2>
        <p className="text-sm text-gray-600 mb-4">
          Create a library of U-values for different construction types. You can then quickly apply these to elements in your rooms.
        </p>
        <button
          onClick={onAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 transition"
        >
          <PlusIcon />
          Add U-Value
        </button>
      </div>

      {project.uValueLibrary && project.uValueLibrary.length > 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-2 text-xs font-semibold text-gray-600 px-2 mb-2">
            <div>Category</div>
            <div>Construction Name</div>
            <div>U-Value (W/m²·K)</div>
            <div>Notes</div>
            <div></div>
          </div>
          {project.uValueLibrary.map(uVal => (
            <div key={uVal.id} className="grid grid-cols-5 gap-2 items-center bg-gray-50 p-3 rounded">
              <select
                value={uVal.element_category}
                onChange={(e) => onUpdate(uVal.id, 'elementCategory', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
              >
                {ELEMENT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <input
                type="text"
                value={uVal.name}
                onChange={(e) => onUpdate(uVal.id, 'name', e.target.value)}
                placeholder="e.g., Cavity wall with insulation"
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                step="0.01"
                value={uVal.u_value}
                onChange={(e) => onUpdate(uVal.id, 'uValue', parseFloat(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={uVal.notes}
                onChange={(e) => onUpdate(uVal.id, 'notes', e.target.value)}
                placeholder="Optional notes"
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => onDelete(uVal.id)}
                className="text-red-600 hover:text-red-700 justify-self-center transition"
              >
                <TrashIcon />
              </button>
            </div>
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