// client/src/components/rooms/RoomEditor.jsx
import { TrashIcon } from '../common/Icons';
import ElementEditor from './ElementEditor';
import EmitterEditor from './EmitterEditor';
import VentilationEditor from './VentilationEditor';
import {
  calculateTransmissionLoss,
  calculateVentilationLoss,
} from '../../utils/calculations';
import { calculateRoomVentilationEN12831 } from '../../utils/en12831Calculations';

// ---------------------------------------------------------------------------
// Thermal bridging options from CIBSE DHDG 2026 Table 2-9
// ---------------------------------------------------------------------------
const THERMAL_BRIDGING_OPTIONS = [
  {
    value: 0.02,
    label: '0.02 W/m²·K — High insulation, thermal bridging minimised (above current standards)',
  },
  {
    value: 0.05,
    label: '0.05 W/m²·K — Current standards, recognised thermal bridging practices',
  },
  {
    value: 0.10,
    label: '0.10 W/m²·K — All other buildings (default)',
  },
  {
    value: 0.15,
    label: '0.15 W/m²·K — Exterior wall insulation broken by solid ceilings (e.g. RC frame)',
  },
];

export default function RoomEditor({
  room,
  project,
  onUpdate,
  onDelete,
  onAddElement,
  onUpdateElement,
  onUpdateElementBatch,
  onDeleteElement,
  onAddEmitter,
  onUpdateEmitter,
  onDeleteEmitter,
  onAddRadiatorSpec,
}) {
  const isEN12831 = (project?.ventilationMethod ?? 'en12831_cibse2026') === 'en12831_cibse2026';
  const refTemp   = project?.referenceTemp ?? 10.6;

  // ── Design figures (at Te,design) ─────────────────────────────────────────
  const transmissionLoss = calculateTransmissionLoss(room, project.externalTemp);

  const en12831Result = isEN12831 && project
    ? calculateRoomVentilationEN12831(room, project)
    : null;

  const ventilationLossEmitter = isEN12831 && en12831Result
    ? en12831Result.ventEmitter
    : calculateVentilationLoss(room, project.externalTemp, project.airDensity, project.specificHeat, project);

  const totalLossEmitter   = transmissionLoss + ventilationLossEmitter;
  const totalLossGenerator = isEN12831 && en12831Result
    ? transmissionLoss + en12831Result.ventGeneratorDesign
    : totalLossEmitter;

  // ── Typical figures (at Te,ref) ───────────────────────────────────────────
  // Both fabric and ventilation recalculated at the reference temperature
  // per CIBSE DHDG 2026 Worksheet A2 parallel calculation columns.
  const fabricTypical = calculateTransmissionLoss(room, refTemp);
  const ventTypical   = isEN12831 && en12831Result
    ? en12831Result.ventGeneratorTypical   // already at Ti - Te,ref
    : 0;
  const totalTypical  = fabricTypical + ventTypical;

  return (
    <div>
      {/* Room name and delete */}
      <div className="flex justify-between items-end mb-4">
        <div className="flex-1 mr-4">
          <label className="block text-sm font-semibold mb-1">Room Name</label>
          <input
            type="text"
            value={room.name}
            onChange={e => onUpdate(room.id, 'name', e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Room Name"
          />
        </div>
        <button
          onClick={() => onDelete(room.id)}
          className="text-red-600 hover:text-red-700 transition flex items-center gap-1 mb-0.5"
        >
          <TrashIcon />
          <span className="text-sm">Delete Room</span>
        </button>
      </div>

      {/* Room Dimensions + Thermal Bridging */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-semibold mb-1">Internal Temp (°C)</label>
          <input
            type="number"
            value={room.internalTemp}
            onChange={e => onUpdate(room.id, 'internalTemp', parseFloat(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Length (m)</label>
          <input
            type="number"
            step="0.1"
            value={room.roomLength}
            onChange={e => onUpdate(room.id, 'roomLength', parseFloat(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Width (m)</label>
          <input
            type="number"
            step="0.1"
            value={room.roomWidth}
            onChange={e => onUpdate(room.id, 'roomWidth', parseFloat(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Height (m)</label>
          <input
            type="number"
            step="0.1"
            value={room.roomHeight}
            onChange={e => onUpdate(room.id, 'roomHeight', parseFloat(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Volume (m³)</label>
          <input
            type="number"
            step="0.01"
            value={room.volume.toFixed(2)}
            onChange={e => onUpdate(room.id, 'volume', parseFloat(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
          />
          {room.roomLength > 0 && room.roomWidth > 0 && room.roomHeight > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              Calculated: {(room.roomLength * room.roomWidth * room.roomHeight).toFixed(2)} m³
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Floor Area (m²)</label>
          <input
            type="number"
            step="0.01"
            value={room.floorArea.toFixed(2)}
            onChange={e => onUpdate(room.id, 'floorArea', parseFloat(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
          />
          {room.roomLength > 0 && room.roomWidth > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              Calculated: {(room.roomLength * room.roomWidth).toFixed(2)} m²
            </div>
          )}
        </div>

        {/* Thermal bridging — spans full width so it has room for the label */}
        <div className="col-span-3">
          <label className="block text-sm font-semibold mb-1">
            Thermal Bridging Addition
            <span className="ml-1 text-xs font-normal text-gray-500">
              (CIBSE DHDG 2026 Table 2-9 — added to all element U-values in this room)
            </span>
          </label>
          <select
            value={room.thermalBridgingAddition ?? 0.10}
            onChange={e => onUpdate(room.id, 'thermalBridgingAddition', parseFloat(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          >
            {THERMAL_BRIDGING_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="text-xs text-gray-500 mt-1">
            For mixed construction (e.g. modern extension on older building), set the appropriate
            value for each room's construction type.
          </div>
        </div>
      </div>

      {/* Building Elements */}
      <ElementEditor
        room={room}
        project={project}
        onAdd={() => onAddElement(room.id)}
        onUpdate={onUpdateElement}
        onUpdateBatch={onUpdateElementBatch}
        onDelete={onDeleteElement}
      />

      {/* Emitters */}
      <EmitterEditor
        room={room}
        radiatorSpecs={project.radiatorSpecs}
        onAdd={() => onAddEmitter(room.id)}
        onUpdate={onUpdateEmitter}
        onDelete={onDeleteEmitter}
        onAddRadiatorSpec={onAddRadiatorSpec}
      />

      {/* Ventilation */}
      <VentilationEditor
        room={room}
        project={project}
        onUpdate={(field, value) => onUpdate(room.id, field, value)}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Heat Loss Summary                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">

        {/* Row 1 — Design figures (emitter sizing) */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-blue-50 p-2 rounded">
            <div className="text-gray-500 text-xs">Fabric — design</div>
            <div className="text-lg font-bold text-blue-600">{transmissionLoss.toFixed(0)} W</div>
          </div>
          <div className="bg-green-50 p-2 rounded">
            <div className="text-gray-500 text-xs">
              Ventilation — emitter sizing
            </div>
            <div className="text-lg font-bold text-green-600">{ventilationLossEmitter.toFixed(0)} W</div>
          </div>
          <div className="bg-purple-50 p-2 rounded">
            <div className="text-gray-500 text-xs">Total — emitter sizing</div>
            <div className="text-lg font-bold text-purple-600">{totalLossEmitter.toFixed(0)} W</div>
          </div>
        </div>

        {/* Generator sizing component */}
        {isEN12831 && en12831Result && (
          <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              Generator sizing component
              <span className="text-gray-400 ml-1">
                (vent {en12831Result.ventGeneratorDesign.toFixed(0)} W + fabric {transmissionLoss.toFixed(0)} W)
              </span>
            </span>
            <span className="font-semibold text-gray-800 text-sm">{totalLossGenerator.toFixed(0)} W</span>
          </div>
        )}

        {/* Row 2 — Typical figures (at Te,ref) */}
        {isEN12831 && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-blue-50 border border-blue-100 p-2 rounded">
              <div className="text-gray-500 text-xs">Fabric — typical (Te,ref {refTemp}°C)</div>
              <div className="text-base font-bold text-blue-400">{fabricTypical.toFixed(0)} W</div>
            </div>
            <div className="bg-green-50 border border-green-100 p-2 rounded">
              <div className="text-gray-500 text-xs">Ventilation — typical</div>
              <div className="text-base font-bold text-green-400">{ventTypical.toFixed(0)} W</div>
            </div>
            <div className="bg-purple-50 border border-purple-100 p-2 rounded">
              <div className="text-gray-500 text-xs">Total — typical load</div>
              <div className="text-base font-bold text-purple-400">{totalTypical.toFixed(0)} W</div>
            </div>
          </div>
        )}

        {/* Warnings */}
        {isEN12831 && en12831Result?.belowMinimumVentilation && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
            ⚠ Room leakage rate is below the EN 12831-1 minimum — check ventilation adequacy.
          </div>
        )}
        {isEN12831 && en12831Result?.contVentWarning === 'mev_unbalanced' && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
            ⚠ Unbalanced continuous extract — ventilation heat loss excludes the continuous
            ventilation contribution. A full EN 12831-1 calculation is required for this property.
          </div>
        )}

      </div>
    </div>
  );
}
