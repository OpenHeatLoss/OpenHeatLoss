// client/src/components/rooms/RoomEditor.jsx
import { useState, useEffect } from 'react';
import { TrashIcon, PlusIcon } from '../common/Icons';
import ElementEditor from './ElementEditor';
import EmitterEditor from './EmitterEditor';
import VentilationEditor from './VentilationEditor';
import {
  calculateTransmissionLoss,
  calculateVentilationLoss,
  calculateSegmentVolume,
  calculateSegmentCeilingArea,
  calculateSegmentsVolume,
  calculateSegmentsFloorArea,
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

// ---------------------------------------------------------------------------
// CEILING TYPE OPTIONS
// ---------------------------------------------------------------------------
const CEILING_TYPES = [
  { value: 'flat',       label: 'Flat' },
  { value: 'mono_pitch', label: 'Mono-pitch (single slope)' },
  { value: 'dual_pitch', label: 'Dual-pitch / vaulted' },
];

// ---------------------------------------------------------------------------
// SEGMENT EDITOR
// Inline table of room segments with add/edit/delete.
// Each segment has: label, L×W, ceiling type, low height, (high height).
// Totals and ceiling area reference figures are shown below.
// ---------------------------------------------------------------------------
function SegmentEditor({ room, onAdd, onUpdate, onDelete }) {
  const segments = room.segments || [];

  // Local state mirrors segment fields so inputs respond instantly.
  // Keyed by segment id — re-sync when segments array identity changes.
  const [localSegs, setLocalSegs] = useState({});

  useEffect(() => {
    const init = {};
    for (const s of segments) {
      init[s.id] = {
        label:      s.label      || '',
        length:     s.length     ?? 0,
        width:      s.width      ?? 0,
        ceilingType: s.ceilingType || 'flat',
        heightLow:  s.heightLow  ?? 0,
        heightHigh: s.heightHigh ?? '',
      };
    }
    setLocalSegs(init);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  const localOf = (seg) => localSegs[seg.id] || {
    label: seg.label || '', length: seg.length ?? 0, width: seg.width ?? 0,
    ceilingType: seg.ceilingType || 'flat', heightLow: seg.heightLow ?? 0, heightHigh: seg.heightHigh ?? '',
  };

  const setField = (segId, field, value) => {
    setLocalSegs(prev => ({ ...prev, [segId]: { ...prev[segId], [field]: value } }));
  };

  const commitSeg = (seg) => {
    const loc = localOf(seg);
    onUpdate(room.id, seg.id, {
      label:        loc.label,
      length:       parseFloat(loc.length)     || 0,
      width:        parseFloat(loc.width)      || 0,
      ceilingType:  loc.ceilingType,
      heightLow:    parseFloat(loc.heightLow)  || 0,
      heightHigh:   loc.heightHigh !== '' && loc.heightHigh !== null
                      ? parseFloat(loc.heightHigh) || null
                      : null,
      displayOrder: seg.displayOrder,
    });
  };

  // Derive totals from current server-side segment values (not local state,
  // which may be mid-edit). Matches what the room record will hold after save.
  const totalFloorArea = calculateSegmentsFloorArea(segments);
  const totalVolume    = calculateSegmentsVolume(segments);

  const numInput = 'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500';
  const textInput = 'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500';

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Room Geometry</h3>
        <button
          onClick={() => onAdd(room.id)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50 transition"
        >
          <PlusIcon className="w-3 h-3" />
          Add segment
        </button>
      </div>

      {segments.length === 0 ? (
        <div className="text-sm text-gray-500 italic py-2">
          No segments — click "Add segment" to define the room geometry.
        </div>
      ) : (
        <div className="space-y-2">
          {segments.map((seg, idx) => {
            const loc = localOf(seg);
            const isPitched = loc.ceilingType === 'mono_pitch' || loc.ceilingType === 'dual_pitch';
            // Ceiling area reference — uses local state so the figure updates as the engineer types
            const previewSeg = {
              length:      parseFloat(loc.length)    || 0,
              width:       parseFloat(loc.width)     || 0,
              ceilingType: loc.ceilingType,
              heightLow:   parseFloat(loc.heightLow) || 0,
              heightHigh:  loc.heightHigh !== '' && loc.heightHigh !== null
                             ? parseFloat(loc.heightHigh) || null
                             : null,
            };
            const ceilArea  = calculateSegmentCeilingArea(previewSeg);
            const segVolume = calculateSegmentVolume(previewSeg);
            const floorArea = (previewSeg.length > 0 && previewSeg.width > 0)
              ? previewSeg.length * previewSeg.width : 0;

            return (
              <div key={seg.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                {/* Row 1: label + ceiling type + delete */}
                <div className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-5">
                    <label className="block text-xs text-gray-500 mb-0.5">Label</label>
                    <input
                      type="text"
                      value={loc.label}
                      placeholder={idx === 0 ? 'Main area' : `Area ${idx + 1}`}
                      onChange={e => setField(seg.id, 'label', e.target.value)}
                      onBlur={() => commitSeg(seg)}
                      className={textInput}
                    />
                  </div>
                  <div className="col-span-6">
                    <label className="block text-xs text-gray-500 mb-0.5">Ceiling type</label>
                    <select
                      value={loc.ceilingType}
                      onChange={e => {
                        setField(seg.id, 'ceilingType', e.target.value);
                        // Clear heightHigh when switching to flat
                        if (e.target.value === 'flat') setField(seg.id, 'heightHigh', '');
                        // Commit immediately on change
                        setTimeout(() => commitSeg({ ...seg, ceilingType: e.target.value }), 0);
                      }}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      {CEILING_TYPES.map(ct => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => onDelete(room.id, seg.id)}
                      disabled={segments.length === 1}
                      title={segments.length === 1 ? 'A room must have at least one segment' : 'Remove segment'}
                      className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition mt-4"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Row 2: dimensions */}
                <div className="grid grid-cols-4 gap-2 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Length (m)</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={loc.length}
                      onChange={e => setField(seg.id, 'length', e.target.value)}
                      onBlur={() => commitSeg(seg)}
                      className={numInput}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Width (m)</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={loc.width}
                      onChange={e => setField(seg.id, 'width', e.target.value)}
                      onBlur={() => commitSeg(seg)}
                      className={numInput}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">
                      {loc.ceilingType === 'flat' ? 'Height (m)' :
                       loc.ceilingType === 'mono_pitch' ? 'Low eaves (m)' : 'Eaves height (m)'}
                    </label>
                    <input
                      type="number" step="0.05" min="0"
                      value={loc.heightLow}
                      onChange={e => setField(seg.id, 'heightLow', e.target.value)}
                      onBlur={() => commitSeg(seg)}
                      className={numInput}
                    />
                  </div>
                  {isPitched && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">
                        {loc.ceilingType === 'mono_pitch' ? 'High eaves (m)' : 'Ridge height (m)'}
                      </label>
                      <input
                        type="number" step="0.05" min="0"
                        value={loc.heightHigh}
                        onChange={e => setField(seg.id, 'heightHigh', e.target.value)}
                        onBlur={() => commitSeg(seg)}
                        className={numInput}
                      />
                    </div>
                  )}
                </div>

                {/* Reference figures — shown once segment has dimensions */}
                {floorArea > 0 && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>Floor area: <span className="font-medium text-gray-700">{floorArea.toFixed(2)} m²</span></span>
                    <span>Volume: <span className="font-medium text-gray-700">{segVolume.toFixed(2)} m³</span></span>
                    {isPitched && ceilArea > 0 && (
                      <span className="text-amber-700 font-medium">
                        Sloped ceiling area: {ceilArea.toFixed(2)} m² — use this for your ceiling element
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Room totals */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div className="bg-gray-100 rounded px-3 py-2 text-sm">
              <span className="text-gray-500 text-xs block">Total floor area</span>
              <span className="font-semibold">{totalFloorArea.toFixed(2)} m²</span>
            </div>
            <div className="bg-gray-100 rounded px-3 py-2 text-sm">
              <span className="text-gray-500 text-xs block">Total volume</span>
              <span className="font-semibold">{totalVolume.toFixed(2)} m³</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoomEditor({
  room,
  project,
  onUpdate,
  onDelete,
  onAddElement,
  onUpdateElement,
  onUpdateElementBatch,
  onDeleteElement,
  onAddUValue,
  onAddEmitter,
  onUpdateEmitter,
  onDeleteEmitter,
  onAddRadiatorSpec,
  onAddSegment,
  onUpdateSegment,
  onDeleteSegment,
}) {
  // ── Local state for typed inputs ──────────────────────────────────────────
  // Mirrors the room prop so inputs respond instantly without waiting for the
  // server round-trip. onUpdate is called on blur, not on every keystroke.
  // useEffect syncs local state when switching to a different room (room.id
  // changes), but NOT on every prop update — that would overwrite typing.
  const [local, setLocal] = useState({
    name:         room.name,
    internalTemp: room.internalTemp,
  });

  // Re-sync when switching to a different room
  useEffect(() => {
    setLocal({
      name:         room.name,
      internalTemp: room.internalTemp,
    });
  }, [room.id]);

  const handleChange = (field, value) => {
    setLocal(prev => ({ ...prev, [field]: value }));
  };

  const handleNumberBlur = (field) => {
    const raw    = local[field];
    const parsed = parseFloat(raw);
    const safe   = isNaN(parsed) ? 0 : parsed;
    setLocal(prev => ({ ...prev, [field]: safe }));
    onUpdate(room.id, field, safe);
  };

  const handleNameBlur = () => {
    const name = local.name.trim() || 'New Room';
    setLocal(prev => ({ ...prev, name }));
    onUpdate(room.id, 'name', name);
  };

  // ── Calculations use the server-authoritative room prop, not local state ──
  // Local state is purely for display while typing. Calculations only update
  // after a blur commits the value and loadProject reloads the room.
  const isEN12831 = (project?.ventilationMethod ?? 'en12831_cibse2026') === 'en12831_cibse2026';
  const refTemp   = project?.referenceTemp ?? 10.6;

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

  const fabricTypical = calculateTransmissionLoss(room, refTemp);
  const ventTypical   = isEN12831 && en12831Result
    ? en12831Result.ventGeneratorTypical
    : 0;
  const totalTypical  = fabricTypical + ventTypical;

  const inputClass = 'w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500';

  return (
    <div>
      {/* Room name and delete */}
      <div className="flex justify-between items-end mb-4">
        <div className="flex-1 mr-4">
          <label className="block text-sm font-semibold mb-1">Room Name</label>
          <input
            type="text"
            value={local.name}
            onChange={e => handleChange('name', e.target.value)}
            onBlur={handleNameBlur}
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

      {/* Internal Temperature */}
      <div className="mb-4 w-48">
        <label className="block text-sm font-semibold mb-1">Internal Temp (°C)</label>
        <input
          type="number"
          value={local.internalTemp}
          onChange={e => handleChange('internalTemp', e.target.value)}
          onBlur={() => handleNumberBlur('internalTemp')}
          className={inputClass}
        />
      </div>

      {/* Room Geometry — segments */}
      <SegmentEditor
        room={room}
        onAdd={onAddSegment}
        onUpdate={onUpdateSegment}
        onDelete={onDeleteSegment}
      />

      {/* Thermal Bridging */}
      <div className="mb-4">
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

      {/* Building Elements */}
      <ElementEditor
        room={room}
        project={project}
        onAdd={() => onAddElement(room.id)}
        onUpdate={onUpdateElement}
        onUpdateBatch={onUpdateElementBatch}
        onDelete={onDeleteElement}
        onAddUValue={onAddUValue}
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
            <div className="text-gray-500 text-xs">Ventilation — emitter sizing</div>
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
            ⚠ Calculated infiltration is below the EN 12831-1 minimum (0.5 ACH). The minimum
            is used for heat loss. Check that the exposed envelope area is set correctly in the
            ventilation section — in a typical retrofit, envelope leakage alone usually meets
            this threshold. Not a Building Regulations compliance issue.
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
