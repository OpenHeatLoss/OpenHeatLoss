// client/src/components/calculations/Summary.jsx
import { useState, useEffect } from 'react';
import {
  calculateRoomHeatLoss,
  calculateFabricLoss,
  calculateVentilationLoss,
  calculateTotalHeatLoss,
  calculateHeatLossPerM2,
} from '../../utils/heatLossCalculations';
import {
  calculateRoomVentilationEN12831,
  calculateBuildingVentilationEN12831,
} from '../../utils/en12831Calculations';
import { calculateTransmissionLoss } from '../../utils/calculations';
import { api } from '../../utils/api';
import {
  fitEta,
  calculateSpaceHeatingScop,
  calculateDHWScop,
  calculateWholeSystemScop,
  EMITTER_EXPONENTS,
} from '../../utils/scopCalculations';

export default function Summary({ project, onUpdateProject, onUpdateBatch }) {
  const [editingHeatPump, setEditingHeatPump] = useState(false);
  const [heatPumpData, setHeatPumpData] = useState({
    manufacturer:    project.heatPumpManufacturer    || '',
    model:           project.heatPumpModel           || '',
    ratedOutput:     project.heatPumpRatedOutput     || 0,
    minModulation:   project.heatPumpMinModulation   || 0,
  });

  // EN 14511 test points — managed separately (auto-saved, not part of the HP spec save)
  const [testPoints, setTestPoints] = useState(
    project.en14511TestPoints && project.en14511TestPoints.length > 0
      ? project.en14511TestPoints
      : [
          { tAir: -5, tFlow: 55, cop: '' },
          { tAir:  7, tFlow: 35, cop: '' },
          { tAir:  7, tFlow: 55, cop: '' },
        ]
  );
  const [defrostPct, setDefrostPct] = useState(project.defrostPct ?? 5);
  const [emitterType, setEmitterType] = useState(
    project.mcsEmitterType === 'ufh' ? 'ufh' : 'radiator'
  );
  const [balancePoint, setBalancePoint] = useState(12.5);

  useEffect(() => {
    setHeatPumpData({
      manufacturer:    project.heatPumpManufacturer    || '',
      model:           project.heatPumpModel           || '',
      ratedOutput:     project.heatPumpRatedOutput     || 0,
      minModulation:   project.heatPumpMinModulation   || 0,
    });
  }, [project.heatPumpManufacturer, project.heatPumpModel, project.heatPumpRatedOutput, project.heatPumpMinModulation]);

  const [savingHeatPump, setSavingHeatPump] = useState(false);

  const handleSaveHeatPump = async () => {
    const updates = {
      heatPumpManufacturer:  heatPumpData.manufacturer,
      heatPumpModel:         heatPumpData.model,
      heatPumpRatedOutput:   heatPumpData.ratedOutput,
      heatPumpMinModulation: heatPumpData.minModulation,
    };

    // Update local state immediately so the UI reflects the change
    if (onUpdateBatch) {
      onUpdateBatch(updates);
    } else {
      onUpdateProject('heatPumpManufacturer',  heatPumpData.manufacturer);
      onUpdateProject('heatPumpModel',         heatPumpData.model);
      onUpdateProject('heatPumpRatedOutput',   heatPumpData.ratedOutput);
      onUpdateProject('heatPumpMinModulation', heatPumpData.minModulation);
    }

    // Persist to the database immediately — don't wait for the main Save button
    setSavingHeatPump(true);
    try {
      await api.updateDesignParams(project.id, {
        ...project,
        ...updates,
      });
    } catch (err) {
      console.error('Failed to save heat pump spec:', err);
    }
    setSavingHeatPump(false);
    setEditingHeatPump(false);
  };

  const handleCancelHeatPump = () => {
    setHeatPumpData({
      manufacturer:   project.heatPumpManufacturer   || '',
      model:          project.heatPumpModel          || '',
      ratedOutput:    project.heatPumpRatedOutput    || 0,
      minModulation:  project.heatPumpMinModulation  || 0,
    });
    setEditingHeatPump(false);
  };

  // Auto-save SCOP inputs whenever test points or defrost change
  const handleSaveSCOPInputs = async (newTestPoints, newDefrostPct) => {
    const validPoints = newTestPoints.filter(p => p.cop !== '' && p.cop > 0);
    try {
      await api.updateDesignParams(project.id, {
        ...project,
        en14511TestPoints: validPoints,
        defrostPct: newDefrostPct,
      });
      if (onUpdateBatch) {
        onUpdateBatch({ en14511TestPoints: validPoints, defrostPct: newDefrostPct });
      }
    } catch (err) {
      console.error('Failed to save SCOP inputs:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Calculations
  // ---------------------------------------------------------------------------
  const rooms = project.rooms || [];
  const isEN12831 = (project.ventilationMethod ?? 'en12831_cibse2026') === 'en12831_cibse2026';

  // Building totals — fabric (same regardless of ventilation method)
  const totalFabricLossW = rooms.reduce((sum, room) =>
    sum + calculateTransmissionLoss(room, project.externalTemp ?? -3), 0);
  const totalFabricLoss = totalFabricLossW / 1000; // kW

  // EN 12831 building ventilation — three figures
  const buildingVent = isEN12831 && rooms.length > 0
    ? calculateBuildingVentilationEN12831(rooms, project)
    : null;

  // Emitter sizing total — what each emitter must be designed for
  // (fabric + ventilation with orientation factor)
  const totalVentEmitterW  = buildingVent ? buildingVent.buildingVentEmitter : 0;
  const totalHeatLossEmitter = totalFabricLoss + (totalVentEmitterW / 1000); // kW

  // Generator sizing total — what the heat pump is sized against
  // (fabric + ventilation without orientation factor — correctly lower)
  const totalVentGeneratorW   = buildingVent ? buildingVent.buildingVentGeneratorDesign : 0;
  const totalGeneratorLoad    = totalFabricLoss + (totalVentGeneratorW / 1000); // kW

  // Typical load — for modulation / oversizing check (CIBSE DHDG 2026 section 5.7.2)
  // Both fabric AND ventilation must be recalculated at Te,ref (the reference/typical
  // outdoor temperature), not at the design external temperature.
  // Using design fabric loss here would significantly overstate the typical load.
  const totalVentTypicalW = buildingVent ? buildingVent.buildingVentGeneratorTypical : 0;
  const refTemp = project.referenceTemp ?? 10.6;
  const totalFabricTypicalW = rooms.reduce((sum, room) =>
    sum + calculateTransmissionLoss(room, refTemp), 0);
  const totalTypicalLoad = (totalFabricTypicalW + totalVentTypicalW) / 1000; // kW

  // Legacy path — used when not EN 12831, and for PDF export
  const totalHeatLossLegacy    = calculateTotalHeatLoss(rooms, project);
  const totalVentilationLegacy = rooms.reduce((sum, room) =>
    sum + calculateVentilationLoss(room, project), 0);

  // What the UI shows as the primary "building heat load"
  const totalHeatLoss      = isEN12831 ? totalHeatLossEmitter    : totalHeatLossLegacy;
  const totalVentLoss      = isEN12831 ? totalVentEmitterW / 1000 : totalVentilationLegacy;

  // Heat pump sizing — compare against generator load, not emitter load
  const sizingBase         = isEN12831 ? totalGeneratorLoad : totalHeatLoss;
  const heatPumpSizingMargin = sizingBase > 0
    ? ((project.heatPumpRatedOutput || 0) / sizingBase) : 0;

  // Property stats
  const totalFloorArea = rooms.reduce((sum, r) => sum + (r.floorArea || 0), 0);
  const totalVolume    = rooms.reduce((sum, r) => sum + (r.volume    || 0), 0);

  // W/K coefficient — use generator load as the design basis
  const avgInternalTemp = rooms.length > 0
    ? rooms.reduce((s, r) => s + (r.internalTemp || 20), 0) / rooms.length : 20;
  const deltaT = avgInternalTemp - (project.externalTemp ?? -3);
  const heatLossCoefficient = deltaT > 0 ? ((sizingBase * 1000) / deltaT) : 0;

  // Outdoor temperature at which the heat pump reaches minimum modulation.
  // Derived by inverting the building heat demand line:
  //   Q(Te) = HLC × (Ti_avg − Te)  =>  Te = Ti_avg − (Q_min / HLC)
  // When Te_minMod > Te,ref the heat pump will reach minimum modulation above
  // the mean annual temperature — short-cycling risk is higher.
  const minModKw = project.heatPumpMinModulation || 0;
  const minModulationTemp = (heatLossCoefficient > 0 && minModKw > 0)
    ? avgInternalTemp - ((minModKw * 1000) / heatLossCoefficient)
    : null;

  // Warnings from EN 12831 calc
  const ventWarnings = buildingVent?.warnings || [];

  // ── SCOP Estimator calculations ───────────────────────────────────────────
  const validTestPoints = testPoints.filter(p => p.cop !== '' && parseFloat(p.cop) > 0)
    .map(p => ({ tAir: parseFloat(p.tAir), tFlow: parseFloat(p.tFlow), cop: parseFloat(p.cop) }));
  const { eta, points: etaPoints } = validTestPoints.length >= 2
    ? fitEta(validTestPoints)
    : { eta: 0, points: [] };
  const emitterN = EMITTER_EXPONENTS[emitterType]?.n ?? 1.3;
  const shScop = eta > 0 && heatLossCoefficient > 0
    ? calculateSpaceHeatingScop({
        eta,
        heatLossCoefficient,
        avgInternalTemp,
        externalTemp: project.externalTemp ?? -3,
        designFlowTemp: project.designFlowTemp || 50,
        designReturnTemp: project.designReturnTemp || 40,
        emitterN,
        defrostPct,
        balancePoint,
      })
    : null;
  const dhwScop = eta > 0 && (project.mcsOccupants || 0) > 0
    ? calculateDHWScop({
        eta,
        occupants:      project.mcsOccupants  || 0,
        cylinderLitres: project.mcsCylinderVolume || 200,
        storeTemp:      55,
      })
    : null;
  const wholeScop = calculateWholeSystemScop(shScop, dhwScop);

  const [exporting, setExporting] = useState(false);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const externalTemp = project.externalTemp || -3;

      const roomData = rooms.map(room => {
        const fabricW = calculateTransmissionLoss(room, externalTemp);

        if (isEN12831) {
          const ventCalc     = calculateRoomVentilationEN12831(room, project);
          const emitterTotal   = fabricW + ventCalc.ventEmitter;
          const generatorTotal = fabricW + ventCalc.ventGeneratorDesign;
          const wPerM2 = room.floorArea > 0 ? generatorTotal / room.floorArea : 0;
          return {
            name:          room.name,
            internalTemp:  room.internalTemp,
            floorArea:     room.floorArea || 0,
            volume:        room.volume    || 0,
            fabricLoss:    fabricW,
            ventEmitter:   ventCalc.ventEmitter,
            emitterTotal,
            generatorTotal,
            wPerM2,
          };
        } else {
          const roomHeatLoss = calculateRoomHeatLoss(room, project);
          const ventLoss     = calculateVentilationLoss(room, project);
          return {
            name:            room.name,
            internalTemp:    room.internalTemp,
            floorArea:       room.floorArea || 0,
            volume:          room.volume    || 0,
            fabricLoss:      fabricW,
            ventilationLoss: ventLoss  * 1000,
            totalHeatLoss:   roomHeatLoss * 1000,
            wPerM2: room.floorArea > 0 ? (roomHeatLoss / room.floorArea) * 1000 : 0,
          };
        }
      });

      const pdfData = {
        isEN12831,
        projectName:       project.name              || 'Untitled Project',
        location:          project.location          || '',
        designer:          project.designer          || '',
        customerTitle:     project.customerTitle     || '',
        customerFirstName: project.customerFirstName || '',
        customerSurname:   project.customerSurname   || '',
        customerAddress:   project.customerAddress   || '',
        customerPostcode:  project.customerPostcode  || '',
        customerTelephone: project.customerTelephone || '',
        externalTemp,
        referenceTemp:     project.referenceTemp ?? 10.6,
        // EN 12831 figures
        totalGeneratorLoad,
        totalHeatLossEmitter,
        totalVentGeneratorW,
        totalVentEmitterW,
        totalTypicalLoad,
        minModKw,
        minModulationTemp,
        // Shared / legacy
        totalHeatLoss,
        totalFabricLoss,
        totalVentilationLoss: totalVentLoss,
        totalFloorArea,
        totalVolume,
        heatLossPerM2: totalFloorArea > 0 ? (sizingBase / totalFloorArea) * 1000 : 0,
        heatLossCoefficient,
        numberOfRooms: rooms.length,
        heatPump: {
          manufacturer:  project.heatPumpManufacturer  || '',
          model:         project.heatPumpModel         || '',
          ratedOutput:   project.heatPumpRatedOutput   || 0,
          minModulation: project.heatPumpMinModulation || 0,
          flowTemp:      project.designFlowTemp        || 50,
          returnTemp:    project.designReturnTemp      || 40,
          sizingMargin:  heatPumpSizingMargin,
        },
        ventWarnings,
        rooms: roomData,
      };

      const response = await fetch('/api/generate-pdf/heat-loss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pdfData),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `Heat_Loss_Report_${project.name || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to generate PDF. Please try again.');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
    setExporting(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Heat Loss Summary</h2>
        <button
          onClick={handleExportPDF}
          disabled={exporting || rooms.length === 0}
          className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition flex items-center gap-2"
        >
          {exporting ? '⏳ Generating...' : '📄 Export PDF Report'}
        </button>
      </div>

      {/* Heat Pump Specification */}
      <div className="bg-white border-2 border-blue-500 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-blue-900">Heat Pump Specification</h3>
          {!editingHeatPump && (
            <button
              onClick={() => setEditingHeatPump(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              {project.heatPumpManufacturer ? 'Edit' : 'Add Heat Pump'}
            </button>
          )}
        </div>

        {editingHeatPump ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Manufacturer</label>
                <input type="text" value={heatPumpData.manufacturer}
                  onChange={e => setHeatPumpData({ ...heatPumpData, manufacturer: e.target.value })}
                  placeholder="e.g. Mitsubishi, Vaillant, Daikin"
                  className="w-full border border-gray-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Model</label>
                <input type="text" value={heatPumpData.model}
                  onChange={e => setHeatPumpData({ ...heatPumpData, model: e.target.value })}
                  placeholder="e.g. Ecodan 8.5kW"
                  className="w-full border border-gray-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Rated Output (kW)</label>
                <input type="number" step="0.1" value={heatPumpData.ratedOutput}
                  onChange={e => setHeatPumpData({ ...heatPumpData, ratedOutput: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-gray-300 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Minimum Modulation (kW)</label>
                <input type="number" step="0.1" min="0" value={heatPumpData.minModulation}
                  onChange={e => setHeatPumpData({ ...heatPumpData, minModulation: parseFloat(e.target.value) || 0 })}
                  placeholder="e.g. 1.5"
                  className="w-full border border-gray-300 rounded px-3 py-2" />
                <p className="text-xs text-gray-500 mt-1">From manufacturer's datasheet at design conditions</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={handleCancelHeatPump}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">Cancel</button>
              <button onClick={handleSaveHeatPump} disabled={savingHeatPump}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                {savingHeatPump ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {project.heatPumpManufacturer ? (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-sm text-gray-600 mb-1">Manufacturer</div>
                  <div className="font-bold text-gray-800">{project.heatPumpManufacturer}</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-sm text-gray-600 mb-1">Model</div>
                  <div className="font-bold text-gray-800">{project.heatPumpModel || 'N/A'}</div>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <div className="text-sm text-gray-600 mb-1">Rated Output</div>
                  <div className="font-bold text-blue-700 text-xl">{project.heatPumpRatedOutput || 0} kW</div>
                </div>
                {project.heatPumpMinModulation > 0 && (
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-sm text-gray-600 mb-1">Min. Modulation</div>
                    <div className="font-bold text-gray-700">{project.heatPumpMinModulation} kW</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No heat pump specified. Click "Add Heat Pump" to enter details.
              </div>
            )}
          </>
        )}
      </div>

      {/* System Load Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold mb-4">System Heat Load Summary</h3>

        {/* Primary figure — generator sizing */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          <div className="bg-blue-50 rounded p-4 border-2 border-blue-500">
            <div className="text-sm text-gray-600 mb-1">
              {isEN12831
                ? 'Heat Generator Sizing Load (fabric + ventilation, no orientation factor)'
                : 'Total Space Heating Load'}
            </div>
            <div className="text-4xl font-bold text-blue-700">
              {isEN12831 ? totalGeneratorLoad.toFixed(2) : totalHeatLoss.toFixed(2)} kW
            </div>
            {isEN12831 && (
              <div className="text-xs text-gray-600 mt-2">
                Use this figure to select the heat pump — emitter sizing load is higher
                ({totalHeatLossEmitter.toFixed(2)} kW) due to wind orientation factor
              </div>
            )}
          </div>
        </div>

        {/* Heat Pump Sizing Check */}
        {project.heatPumpRatedOutput > 0 && (
          <div className={`rounded-lg p-4 border-2 mb-6 ${
            heatPumpSizingMargin >= 1.0 && heatPumpSizingMargin <= 1.2
              ? 'bg-green-50 border-green-500'
              : heatPumpSizingMargin < 1.0
                ? 'bg-red-50 border-red-500'
                : 'bg-yellow-50 border-yellow-500'
          }`}>
            <div className="flex justify-between items-center">
              <div>
                <div className="font-bold text-lg mb-1">Heat Pump Sizing Check</div>
                <div className="text-sm">
                  Heat pump output: {project.heatPumpRatedOutput} kW vs{' '}
                  {isEN12831 ? 'generator sizing load' : 'building heat load'}:{' '}
                  {sizingBase.toFixed(2)} kW
                </div>
                {isEN12831 && (
                  <div className="text-xs text-gray-500 mt-1">
                    Sized against generator load (not emitter load) per CIBSE DHDG 2026
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Sizing Margin</div>
                <div className={`text-3xl font-bold ${
                  heatPumpSizingMargin >= 1.0 && heatPumpSizingMargin <= 1.2 ? 'text-green-700' :
                  heatPumpSizingMargin < 1.0 ? 'text-red-700' : 'text-yellow-700'
                }`}>
                  {(heatPumpSizingMargin * 100).toFixed(0)}%
                </div>
              </div>
            </div>
            {heatPumpSizingMargin < 1.0 && (
              <div className="mt-2 text-sm text-red-800">
                ⚠ <strong>Warning:</strong> Heat pump is undersized for the generator sizing load.
              </div>
            )}
            {heatPumpSizingMargin > 1.2 && (
              <div className="mt-2 text-sm text-yellow-800">
                ⚠ <strong>Note:</strong> Heat pump is oversized by more than 20%. Check modulation range.
              </div>
            )}
            {heatPumpSizingMargin >= 1.0 && heatPumpSizingMargin <= 1.2 && (
              <div className="mt-2 text-sm text-green-800">
                ✓ <strong>Good:</strong> Heat pump sizing is appropriate (0–20% margin).
              </div>
            )}

            {/* Modulation check */}
            {isEN12831 && totalTypicalLoad > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
                <span className="font-semibold">Typical load at Te,ref ({project.referenceTemp ?? 10.6}°C):</span>
                {' '}{totalTypicalLoad.toFixed(2)} kW — verify heat pump can modulate to this level
                without short-cycling (CIBSE DHDG 2026 section 5.7.2).
                {minModulationTemp !== null && (
                  <span className="block mt-1">
                    At the specified minimum modulation of {minModKw} kW, minimum modulation will be reached
                    at approximately{' '}
                    <span className={`font-semibold ${minModulationTemp < (project.referenceTemp ?? 10.6) ? 'text-amber-700' : 'text-gray-800'}`}>
                      {minModulationTemp.toFixed(1)}°C
                    </span>
                    {' '}outdoor temperature
                    {minModulationTemp < (project.referenceTemp ?? 10.6) && (
                      <span className="text-amber-700"> — below Te,ref, heat pump will short-cycle through much of the heating season.</span>
                    )}
                    {minModulationTemp >= (project.referenceTemp ?? 10.6) && (
                      <span className="text-green-700"> — at or above Te,ref, modulation range is adequate across the heating season.</span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-2 gap-6">

        {/* Space Heating Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4">Space Heating Breakdown</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center pb-2 border-b">
              <span className="text-gray-700">Fabric heat loss:</span>
              <span className="font-bold">{totalFabricLoss.toFixed(2)} kW</span>
            </div>

            {isEN12831 ? (
              <>
                <div className="flex justify-between items-center pb-1">
                  <span className="text-gray-600 text-sm">Ventilation — emitter sizing:</span>
                  <span className="font-semibold text-sm">{(totalVentEmitterW / 1000).toFixed(2)} kW</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-gray-600 text-sm">Ventilation — generator sizing:</span>
                  <span className="font-semibold text-sm">{(totalVentGeneratorW / 1000).toFixed(2)} kW</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b">
                  <span className="font-semibold text-gray-900">Total — emitter sizing:</span>
                  <span className="font-bold text-gray-700">{totalHeatLossEmitter.toFixed(2)} kW</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="font-bold text-gray-900">Total — generator sizing:</span>
                  <span className="font-bold text-blue-700 text-xl">{totalGeneratorLoad.toFixed(2)} kW</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t">
                  <span className="text-gray-500 text-xs">Typical load (Te,ref {project.referenceTemp ?? 10.6}°C):</span>
                  <span className="text-gray-500 text-xs font-semibold">{totalTypicalLoad.toFixed(2)} kW</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-gray-700">Ventilation heat loss:</span>
                  <span className="font-bold">{totalVentLoss.toFixed(2)} kW</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t-2 border-gray-400">
                  <span className="font-bold text-gray-900">Total space heating:</span>
                  <span className="font-bold text-blue-700 text-xl">{totalHeatLoss.toFixed(2)} kW</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Property Stats */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4">Property Statistics</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-2 border-b">
              <span className="text-gray-700">Total floor area:</span>
              <span className="font-bold">{totalFloorArea.toFixed(1)} m²</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b">
              <span className="text-gray-700">Total volume:</span>
              <span className="font-bold">{totalVolume.toFixed(1)} m³</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b">
              <span className="text-gray-700">Heat loss per m²:</span>
              <span className="font-bold">
                {totalFloorArea > 0 ? (sizingBase / totalFloorArea * 1000).toFixed(1) : '0'} W/m²
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b">
              <span className="text-gray-700">Heat loss coefficient (W/K):</span>
              <span className="font-bold">{heatLossCoefficient.toFixed(1)} W/K</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Number of rooms:</span>
              <span className="font-bold">{rooms.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Room-by-Room Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">Room-by-Room Summary</h3>

        {rooms.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-2 px-3">Room</th>
                  <th className="text-right py-2 px-3">Temp (°C)</th>
                  <th className="text-right py-2 px-3">Area (m²)</th>
                  <th className="text-right py-2 px-3">Fabric (W)</th>
                  {isEN12831 ? (
                    <>
                      <th className="text-right py-2 px-3">Vent emitter (W)</th>
                      <th className="text-right py-2 px-3">Total emitter (W)</th>
                      <th className="text-right py-2 px-3">Generator (W)</th>
                    </>
                  ) : (
                    <>
                      <th className="text-right py-2 px-3">Vent (W)</th>
                      <th className="text-right py-2 px-3">Total (W)</th>
                    </>
                  )}
                  <th className="text-right py-2 px-3">W/m²</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map(room => {
                  const fabricW = calculateTransmissionLoss(room, project.externalTemp ?? -3);

                  if (isEN12831) {
                    const ventCalc     = calculateRoomVentilationEN12831(room, project);
                    const emitterTotalW    = fabricW + ventCalc.ventEmitter;
                    const generatorTotalW  = fabricW + ventCalc.ventGeneratorDesign;
                    const wPerM2 = room.floorArea > 0 ? generatorTotalW / room.floorArea : 0;
                    return (
                      <tr key={room.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-2 px-3 font-semibold">{room.name}</td>
                        <td className="py-2 px-3 text-right">{room.internalTemp}</td>
                        <td className="py-2 px-3 text-right">{room.floorArea?.toFixed(1) || '0.0'}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{fabricW.toFixed(0)}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{ventCalc.ventEmitter.toFixed(0)}</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-700">{emitterTotalW.toFixed(0)}</td>
                        <td className="py-2 px-3 text-right font-bold text-blue-700">{generatorTotalW.toFixed(0)}</td>
                        <td className="py-2 px-3 text-right text-gray-500">{wPerM2.toFixed(0)}</td>
                      </tr>
                    );
                  } else {
                    const roomHeatLoss = calculateRoomHeatLoss(room, project);
                    const ventLossKW   = calculateVentilationLoss(room, project);
                    const wPerM2 = calculateHeatLossPerM2(roomHeatLoss, room.floorArea);
                    return (
                      <tr key={room.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-2 px-3 font-semibold">{room.name}</td>
                        <td className="py-2 px-3 text-right">{room.internalTemp}</td>
                        <td className="py-2 px-3 text-right">{room.floorArea?.toFixed(1) || '0.0'}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{(fabricW).toFixed(0)}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{(ventLossKW * 1000).toFixed(0)}</td>
                        <td className="py-2 px-3 text-right font-bold text-blue-700">{(roomHeatLoss * 1000).toFixed(0)}</td>
                        <td className="py-2 px-3 text-right text-gray-500">{wPerM2.toFixed(0)}</td>
                      </tr>
                    );
                  }
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-400 font-bold bg-gray-50">
                  <td className="py-2 px-3">TOTAL</td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-3 text-right">{totalFloorArea.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right">{totalFabricLossW.toFixed(0)}</td>
                  {isEN12831 ? (
                    <>
                      <td className="py-2 px-3 text-right">{totalVentEmitterW.toFixed(0)}</td>
                      <td className="py-2 px-3 text-right">{(totalHeatLossEmitter * 1000).toFixed(0)}</td>
                      <td className="py-2 px-3 text-right text-blue-700 text-base">
                        {(totalGeneratorLoad * 1000).toFixed(0)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-3 text-right">{(totalVentLoss * 1000).toFixed(0)}</td>
                      <td className="py-2 px-3 text-right text-blue-700 text-base">
                        {(totalHeatLoss * 1000).toFixed(0)}
                      </td>
                    </>
                  )}
                  <td className="py-2 px-3 text-right">
                    {totalFloorArea > 0 ? (sizingBase / totalFloorArea * 1000).toFixed(0) : '0'}
                  </td>
                </tr>
              </tfoot>
            </table>

            {isEN12831 && (
              <p className="text-xs text-gray-500 mt-2">
                W/m² and heat pump sizing based on generator load.
                Emitter total includes orientation factor ×2 on ventilation leakage per CIBSE DHDG 2026 section 2.5.4.4.
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No rooms added yet. Add rooms in the "Rooms" tab to see the summary.
          </div>
        )}
      </div>

      {/* ── SCOP Estimator ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold mb-1">Performance Estimator (SCOP)</h3>
        <p className="text-xs text-gray-500 mb-4">
          Enter EN 14511 test points from the heat pump datasheet. A-5/W55, A7/W35 and A7/W55
          are the standard conditions — all three are always published. The Carnot efficiency η
          is fitted from these points and used to estimate SCOP across UK temperature bins
          with building-specific weather compensation.
        </p>

        {/* Test point inputs */}
        <div className="mb-4">
          <div className="grid grid-cols-4 gap-2 mb-1 px-1">
            <span className="text-xs font-semibold text-gray-600">Outdoor air (°C)</span>
            <span className="text-xs font-semibold text-gray-600">Flow temp (°C)</span>
            <span className="text-xs font-semibold text-gray-600">COP (datasheet)</span>
            <span></span>
          </div>
          {testPoints.map((pt, i) => (
            <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-center">
              <input type="number" step="1" value={pt.tAir}
                onChange={e => {
                  const updated = testPoints.map((p, j) => j === i ? { ...p, tAir: parseFloat(e.target.value) || 0 } : p);
                  setTestPoints(updated);
                }}
                onBlur={() => handleSaveSCOPInputs(testPoints, defrostPct)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <input type="number" step="1" value={pt.tFlow}
                onChange={e => {
                  const updated = testPoints.map((p, j) => j === i ? { ...p, tFlow: parseFloat(e.target.value) || 0 } : p);
                  setTestPoints(updated);
                }}
                onBlur={() => handleSaveSCOPInputs(testPoints, defrostPct)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <input type="number" step="0.01" min="1" max="10"
                value={pt.cop} placeholder="e.g. 3.11"
                onChange={e => {
                  const updated = testPoints.map((p, j) => j === i ? { ...p, cop: e.target.value } : p);
                  setTestPoints(updated);
                }}
                onBlur={() => handleSaveSCOPInputs(testPoints, defrostPct)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <button
                onClick={() => {
                  const updated = testPoints.filter((_, j) => j !== i);
                  setTestPoints(updated);
                  handleSaveSCOPInputs(updated, defrostPct);
                }}
                className="text-red-500 hover:text-red-700 text-xs">Remove</button>
            </div>
          ))}
          <button
            onClick={() => setTestPoints([...testPoints, { tAir: 2, tFlow: 35, cop: '' }])}
            className="text-blue-600 hover:text-blue-800 text-xs mt-1">
            + Add test point
          </button>
        </div>

        {/* Fitted η */}
        {eta > 0 && (
          <div className="bg-blue-50 rounded p-3 mb-4 text-xs text-blue-800 flex flex-wrap gap-4 items-center">
            <span><span className="font-semibold">Fitted Carnot efficiency η:</span> {(eta * 100).toFixed(1)}%</span>
            {etaPoints.map((p, i) => (
              <span key={i} className="text-blue-600">
                A{p.tAir}/W{p.tFlow}: COP {p.cop} → η {(p.eta * 100).toFixed(1)}%
              </span>
            ))}
            {(eta < 0.38 || eta > 0.65) && (
              <span className="text-amber-600 font-semibold">⚠ Outside typical range (40–65%) — check data entry</span>
            )}
          </div>
        )}

        {/* Emitter type + defrost + balance point */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Emitter type</label>
            <select value={emitterType} onChange={e => setEmitterType(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
              {Object.entries(EMITTER_EXPONENTS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Determines weather compensation curve shape</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Defrost penalty (%)</label>
            <input type="number" step="0.5" min="0" max="15" value={defrostPct}
              onChange={e => setDefrostPct(parseFloat(e.target.value) || 0)}
              onBlur={() => handleSaveSCOPInputs(testPoints, defrostPct)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Nominal %; scaled by outdoor temp. Typical 3–7%.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Balance point (°C)</label>
            <input type="number" step="0.5" min="5" max="15" value={balancePoint}
              onChange={e => setBalancePoint(parseFloat(e.target.value) || 12.5)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">
              Outdoor temp below which heating runs. Default 12.5°C accounts for
              internal &amp; solar gains offsetting demand at mild temperatures.
            </p>
          </div>
        </div>

        {/* Results */}
        {shScop ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">Space Heating SCOP</div>
                <div className="text-4xl font-bold text-green-700">{shScop.scop}</div>
                <div className="text-xs text-gray-400 mt-1">incl. defrost</div>
                <div className="text-xs text-green-600 mt-0.5">Without defrost: {shScop.scopNoDefrost}</div>
              </div>
              <div className={`border-2 rounded-lg p-4 text-center ${dhwScop ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-200'}`}>
                <div className="text-xs text-gray-500 mb-1">DHW SCOP</div>
                {dhwScop ? (
                  <>
                    <div className="text-4xl font-bold text-blue-700">{dhwScop.dhwScop}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {project.mcsOccupants} occupants · {project.mcsCylinderVolume || 200}L cylinder
                    </div>
                    <div className="text-xs text-blue-600 mt-0.5">
                      Pasteurisation COP: {dhwScop.copPast}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 mt-4">
                    Enter occupants &amp; cylinder volume in MCS031 to enable
                  </div>
                )}
              </div>
              <div className={`border-2 rounded-lg p-4 text-center ${wholeScop ? 'bg-purple-50 border-purple-400' : 'bg-gray-50 border-gray-200'}`}>
                <div className="text-xs text-gray-500 mb-1">Whole-System SCOP</div>
                {wholeScop ? (
                  <>
                    <div className="text-4xl font-bold text-purple-700">{wholeScop.wholeSystemScop}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {wholeScop.totalHeatKwh.toLocaleString()} kWh heat
                    </div>
                    <div className="text-xs text-gray-400">
                      {wholeScop.totalElecKwh.toLocaleString()} kWh electricity
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 mt-4">Requires DHW data</div>
                )}
              </div>
            </div>

            {/* Annual energy breakdown */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm font-semibold text-gray-700 mb-2">Annual energy estimate</div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-600">
                <div className="flex justify-between border-b border-gray-200 pb-1">
                  <span>Space heating demand</span>
                  <span className="font-semibold">{shScop.totalHeatKwh.toLocaleString()} kWh</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-1">
                  <span>Space heating electricity</span>
                  <span className="font-semibold">{shScop.totalElecKwh.toLocaleString()} kWh</span>
                </div>
                {dhwScop && (
                  <>
                    <div className="flex justify-between border-b border-gray-200 pb-1">
                      <span>DHW heat demand</span>
                      <span className="font-semibold">{dhwScop.totalDHWHeatKwh.toLocaleString()} kWh</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 pb-1">
                      <span>DHW electricity</span>
                      <span className="font-semibold">{dhwScop.totalElecKwh.toLocaleString()} kWh</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-400 italic">
              Carnot efficiency model fitted from EN 14511 test data. Flow temperature derived
              from building W/K via LMTD exponent method — specific to this building and emitter sizing.
              UK bin hours per EN 14825 extended climate. This is an engineering estimate,
              not a replacement for MCS compliance calculation.
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-6 text-center text-sm text-gray-500">
            {validTestPoints.length < 2
              ? 'Enter at least 2 EN 14511 test points with COP values to calculate SCOP.'
              : 'Heat loss coefficient not yet calculated — complete room elements first.'}
          </div>
        )}
      </div>

      {/* EN 12831 ventilation notices — shown at bottom as these are expected on most retrofits */}
      {isEN12831 && ventWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">Ventilation notices</p>
          <p className="text-xs text-amber-700">
            The following rooms show infiltration rates below the BS EN 12831-1 Table B.7 minimum (0.5 ACH).
            The minimum rate is used for heat loss purposes in these rooms. This does not indicate a Building
            Regulations ventilation compliance issue. Ventilation adequacy should be considered separately.
          </p>
          {ventWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 border-t border-amber-200 pt-1">
              <span className="font-semibold">{w.roomName}:</span>{' '}
              {w.belowMinimum && 'Calculated leakage rate below EN 12831-1 Table B.7 minimum — minimum rate used for heat loss. '}
              {w.contVentWarning === 'mev_unbalanced' && 'Unbalanced continuous extract (MEV) — outside CIBSE 2026 reduced method scope. A full EN 12831-1 calculation is required.'}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
