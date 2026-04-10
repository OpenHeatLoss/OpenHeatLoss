// client/src/components/rooms/ElementEditor.jsx
//
// Building element table for CIBSE DHDG 2026 reduced method.
//
// Changes from previous version:
//   - Description column removed (kept in DB, not shown in CIBSE mode)
//   - Temp Factor column removed from display (defaults to 1.0 in CIBSE mode;
//     retained in DB and calculations for full EN 12831 projects)
//   - U-value cell is now read-only in the table; value is entered when adding
//     the element or via quick-apply from the library. The effective U-value
//     (entered + thermal bridging addition) is displayed with a breakdown.
//   - "Delta T" renamed to "Design ΔT" — remains editable for party walls,
//     basement slabs, elements to unheated spaces etc.
//   - "Reference ΔT" column added — read-only, shows Ti - Te,ref

import { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon } from '../common/Icons';
import { ELEMENT_TYPES, SUBTRACTABLE_ELEMENT_TYPES, PARENT_ELEMENT_TYPES } from '../../utils/constants';
import FloorUValueInlineCalculator from './FloorUValueInlineCalculator';

// Local-state number input — prevents the server round-trip in updateRoom from
// resetting the field while the user is still typing.
function DeltaTInput({ value, defaultValue, onChange, onCommit }) {
  const [local, setLocal] = useState(value !== null && value !== undefined ? String(value) : '');

  // Sync when value prop changes externally — e.g. Ground Floor auto-sets customDeltaT
  // without remounting the component (same element.id = same React instance).
  useEffect(() => {
    setLocal(value !== null && value !== undefined ? String(value) : '');
  }, [value]);

  const handleChange = (e) => setLocal(e.target.value);

  const handleBlur = () => {
    if (local === '') {
      onChange(null);  // revert to room default
      onCommit(null);
    } else {
      const parsed = parseFloat(local);
      const safe   = isNaN(parsed) ? defaultValue : parsed;
      setLocal(String(safe));
      onChange(safe);
      onCommit(safe);
    }
  };

  return (
    <div className="relative">
      <input
        type="number"
        step="0.1"
        value={local}
        placeholder={defaultValue.toFixed(1)}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
        title="Leave empty to use room default (Ti - Te,design)"
      />
      {(value === null || value === undefined) ? (
          <div className="text-xs text-blue-400 mt-0.5">✎ default</div>
        ) : (
          <div className="text-xs text-blue-400 mt-0.5">✎ custom</div>
        )}
    </div>
  );
}

export default function ElementEditor({ room, project, onAdd, onUpdate, onUpdateBatch, onDelete }) {
  const [openCalcElementId, setOpenCalcElementId] = useState(null);

  const thermalBridging = room.thermalBridgingAddition ?? 0.10;
  const refTemp         = project.referenceTemp ?? 10.6;

  return (
    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">

      {/* Header bar */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Building Elements</h3>
        <button
          onClick={onAdd}
          className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1 transition"
        >
          <PlusIcon className="w-4 h-4" />
          Add Element
        </button>
      </div>

      <div className="p-4">

      {room.elements && room.elements.length > 0 && (() => {
        const hasFloor = room.elements.some(el => el.elementType === 'Ground Floor');
        return (
          <div className="mb-2 grid grid-cols-10 gap-2 text-xs font-semibold text-gray-600 px-2">
            <div>Element Type</div>
            <div>{hasFloor ? 'Length / Width (m)' : 'Length (m)'}</div>
            <div>{hasFloor ? 'Height / Width (m)' : 'Height (m)'}</div>
            <div>Area (m²)</div>
            <div>U-value (W/m²·K)</div>
            <div>Design ΔT (°C)</div>
            <div>Ref ΔT (°C)</div>
            <div>Subtract From</div>
            <div title="Include this element's area in the room's exposed envelope (used for ventilation heat loss)">
              Env.
            </div>
            <div></div>
          </div>
        );
      })()}

      {room.elements && room.elements.map(element => {
        const designDeltaT  = room.internalTemp - (project.externalTemp ?? -3);
        const refDeltaT     = room.internalTemp - refTemp;
        const calculatedArea = element.length > 0 && element.height > 0
          ? element.length * element.height : 0;

        // Effective ΔT for display (what's actually used in the calculation)
        const effectiveDesignDT = (element.customDeltaT !== null && element.customDeltaT !== undefined)
          ? element.customDeltaT : designDeltaT;

        // Reference ΔT: customDeltaT represents a fixed assumed boundary temperature
        // (e.g. unheated space at 5°C, heated adjoining property at 15°C), independent
        // of outdoor conditions. CIBSE DHDG 2026 Worksheet A2 uses the same ΔT for
        // both design and typical columns in this case — no scaling applied.
        // BS EN 12831-1:2017 / CIBSE 2026 party wall example: Ti=21, T_adj=5 → ΔT=16 at both columns.
        const effectiveRefDT = (element.customDeltaT !== null && element.customDeltaT !== undefined)
          ? element.customDeltaT
          : refDeltaT;

        const effectiveUValue = (element.uValue ?? 0) + thermalBridging;

        const subtractableElements = room.elements.filter(el =>
          el.id !== element.id &&
          PARENT_ELEMENT_TYPES.some(type => el.elementType.includes(type))
        );
        const isSubtractable = SUBTRACTABLE_ELEMENT_TYPES.includes(element.elementType);

        const matchingUValues = project.uValueLibrary?.filter(
          uVal => uVal.element_category === element.elementType
        ) || [];

        return (
          <div key={element.id} className="grid grid-cols-10 gap-2 mb-2 items-start bg-gray-50 p-2 rounded border border-gray-200">

            {/* Element type */}
            <select
              value={element.elementType}
              onChange={e => onUpdate(room.id, element.id, 'elementType', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
            >
              {ELEMENT_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            {/* Length */}
            <input
              type="number"
              step="0.01"
              value={element.length}
              onChange={e => onUpdate(room.id, element.id, 'length', parseFloat(e.target.value))}
              placeholder="0.00"
              title={element.elementType === 'Ground Floor (Slab)' || element.elementType === 'Ground Floor (Suspended)' ? 'Length (m)' : 'Length (m)'}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
            />

            {/* Height / width */}
            <input
              type="number"
              step="0.01"
              value={element.height}
              onChange={e => onUpdate(room.id, element.id, 'height', parseFloat(e.target.value))}
              placeholder="0.00"
              title={element.elementType === 'Ground Floor (Slab)' || element.elementType === 'Ground Floor (Suspended)' ? 'Width (m)' : 'Height (m)'}
              className={`border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 ${
                element.elementType === 'Ground Floor (Slab)' || element.elementType === 'Ground Floor (Suspended)'
                  ? 'border-orange-300 bg-orange-50'
                  : 'border-gray-300'
              }`}
            />

            {/* Area */}
            <div className="relative">
              <input
                type="number"
                step="0.01"
                value={element.area.toFixed(2)}
                onChange={e => onUpdate(room.id, element.id, 'area', parseFloat(e.target.value))}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
              />
              {calculatedArea > 0 && Math.abs(element.area - calculatedArea) > 0.01 && (
                <div className="text-xs text-blue-600 mt-0.5">
                  Calc: {calculatedArea.toFixed(2)}
                </div>
              )}
            </div>

            {/* U-value — read-only display with thermal bridging breakdown */}
            <div className="relative">
              {/* Effective U-value display */}
              <div className="w-full border border-gray-200 bg-white rounded px-2 py-1 text-sm font-semibold text-gray-800">
                {effectiveUValue.toFixed(3)}
              </div>
              {/* Breakdown */}
              <div className="text-xs text-gray-400 mt-0.5 leading-tight">
                {(element.uValue ?? 0).toFixed(3)} + {thermalBridging.toFixed(2)}
              </div>
              {/* Quick-apply from library */}
              {matchingUValues.length > 0 && (
                <select
                  onChange={e => {
                    if (e.target.value) {
                      onUpdate(room.id, element.id, 'uValue', parseFloat(e.target.value));
                    }
                  }}
                  value=""
                  className="text-xs border border-gray-300 rounded px-1 py-0.5 mt-0.5 w-full focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Apply from library…</option>
                  {matchingUValues.map(uVal => (
                    <option key={uVal.id} value={uVal.u_value}>
                      {uVal.name}: {uVal.u_value}
                    </option>
                  ))}
                </select>
              )}
              {/* Floor U-value calculator button */}
              {element.elementType === 'Ground Floor (Slab)' || element.elementType === 'Ground Floor (Suspended)' && (
                <button
                  onClick={() => setOpenCalcElementId(
                    openCalcElementId === element.id ? null : element.id
                  )}
                  className={`mt-0.5 w-full text-xs px-1 py-0.5 rounded border transition ${
                    openCalcElementId === element.id
                      ? 'bg-orange-100 border-orange-400 text-orange-700'
                      : 'bg-orange-50 border-orange-300 text-orange-600 hover:bg-orange-100'
                  }`}
                >
                  {openCalcElementId === element.id ? '▲ Close calc' : '🧮 Calculate…'}
                </button>
              )}
            </div>

            {/* Design ΔT — editable, local state to prevent keystroke reset */}
            <DeltaTInput
              value={element.customDeltaT}
              defaultValue={designDeltaT}
              onChange={val => {
                // Update local state immediately (handled inside DeltaTInput)
              }}
              onCommit={val => onUpdate(room.id, element.id, 'customDeltaT', val)}
            />

            {/* Reference ΔT — read-only */}
            <div className="border border-gray-200 bg-gray-100 rounded px-2 py-1 text-sm text-gray-500 text-center select-none">
              {effectiveRefDT.toFixed(1)}
              {(element.customDeltaT !== null && element.customDeltaT !== undefined) && (
                <div className="text-xs text-gray-400 mt-0.5">custom</div>
              )}
            </div>

            {/* Subtract from */}
            <div>
              {isSubtractable && subtractableElements.length > 0 ? (
                <select
                  value={element.subtractFromElementId || ''}
                  onChange={e => onUpdate(room.id, element.id, 'subtractFromElementId',
                    e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full text-xs border border-gray-300 rounded px-1 py-1 focus:ring-2 focus:ring-blue-500"
                  title="Subtract this element's area from..."
                >
                  <option value="">No subtraction</option>
                  {subtractableElements.map(subEl => (
                    <option key={subEl.id} value={subEl.id}>
                      From: {subEl.elementType}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-gray-400 italic">
                  {isSubtractable ? 'No walls' : '—'}
                </div>
              )}
            </div>

            {/* Envelope checkbox */}
            <div className="flex items-center justify-center" title="Include in exposed envelope area (ventilation heat loss)">
              <input
                type="checkbox"
                checked={!!(element.includeInEnvelope ?? 0)}
                onChange={e => onUpdate(room.id, element.id, 'includeInEnvelope', e.target.checked ? 1 : 0)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* Delete */}
            <button
              onClick={() => onDelete(element.id)}
              className="text-red-600 hover:text-red-700 justify-self-center transition"
            >
              <TrashIcon className="w-4 h-4" />
            </button>

            {/* Floor U-value inline calculator — spans full row */}
            {openCalcElementId === element.id && (
              <div className="col-span-10">
                <FloorUValueInlineCalculator
                  room={room}
                  onApply={(uVal, floorLength, floorWidth) => {
                    onUpdateBatch(room.id, element.id, {
                      uValue: uVal,
                      length: floorLength,
                      height: floorWidth,
                      area:   parseFloat((floorLength * floorWidth).toFixed(2)),
                    });
                    setOpenCalcElementId(null);
                  }}
                  onClose={() => setOpenCalcElementId(null)}
                />
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
