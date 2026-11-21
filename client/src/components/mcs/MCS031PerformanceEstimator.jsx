// client/src/components/project/MCSPerformanceEstimator.jsx
import { useState } from 'react';
import { getMCSDataFromPostcode } from '../../utils/mcsData';
import { getSPFAndStars, renderStars, getFlowTempRanges } from '../../utils/mcsSPFLookup';
import { getWarningNotes, MCS031_NOTES_VERSION } from '../../utils/mcsWarningNotes';
import { dailyHotWaterDemand } from '../../utils/dhwCalculations';
import { buildMcsPerformancePayload } from '../../utils/buildMcsPerformancePayload';
import { mcsSnapshotStatus } from '../../utils/mcsSnapshotStatus';
import { getPostcodePrefix } from '../../utils/mcsData';
import { appendixADemand, isAppendixA, APPENDIX_A_REASONS, MCS031_DHW_DEFAULT, MCS031_DHW_DEFAULT_SOURCE } from '../../utils/mcsAppendixA';

// Smallest valid flow − return difference. Must match MIN_DT in
// RadiatorSizing.jsx and FLOW_RETURN_MIN_DT in server validation.js.
// TODO: move all three to one shared constant.
const MIN_DT = 1;

export default function MCSPerformanceEstimator({ project, onUpdate, onSave }) {
  const [showGraph, setShowGraph] = useState(false);

  // Design flow temperature is shared with Emitter Sizing, which stores
  // flow + return and treats ΔT as the input. This field edits flow only,
  // so it keeps the current ΔT and moves return with it — writing flow alone
  // is what produced the production rows with return above flow.
  // Local state so partial keystrokes are never pushed to the project.
  // (The tab unmounts on switch, so it re-initialises from the project.)
  const [flowInput, setFlowInput] = useState(
    project.designFlowTemp != null ? String(project.designFlowTemp) : ''
  );
  const [flowError, setFlowError] = useState('');
  const savedFlow   = Number(project.designFlowTemp);
  const savedReturn = Number(project.designReturnTemp);
  const currentDt   = savedFlow - savedReturn;
  const dtValid     = Number.isFinite(currentDt) && currentDt >= MIN_DT;

  const handleFlowBlur = async () => {
    const flow = parseFloat(flowInput);
    if (!Number.isFinite(flow)) {
      setFlowError('Enter a flow temperature.');
      return;
    }
    if (flow === savedFlow) { setFlowError(''); return; }
    if (!dtValid) {
      setFlowError(
        `The saved flow/return pair (${project.designFlowTemp}/${project.designReturnTemp}°C) is invalid. ` +
        'Correct it in Emitter Sizing first.'
      );
      return;
    }
    const ret = Math.round((flow - currentDt) * 10) / 10;
    onUpdate('designFlowTemp', flow);
    onUpdate('designReturnTemp', ret);
    let res;
    try {
      res = await onSave?.({ designFlowTemp: flow, designReturnTemp: ret });
    } catch {
      res = { error: 'network' };
    }
    if (res && typeof res === 'object' && 'error' in res) {
      setFlowError('Not saved: the server rejected this flow temperature. Check it in Emitter Sizing.');
    } else {
      setFlowError('');
    }
  };

  // Daily hot water demand — MIS 3005-D 5.6.2, shared with the SCOP estimator
  const dhwDemand = dailyHotWaterDemand({
    bedrooms:  project.mcsBedrooms,
    occupants: project.mcsOccupants,
  });

  // Snapshot stored on project — persists across sessions. Staleness is
  // worked out in mcsSnapshotStatus so the packs give the same answer.
  // (stale = inputs changed OR notes table outdated; the banner says which.)
  const {
    snapshot,
    fingerprint:   inputFingerprint,
    inputsChanged: inputsChangedSinceSnapshot,
    stale:         needsRecalc,
  } = mcsSnapshotStatus(project);

  // Extract postcode data
  const mcsData = getMCSDataFromPostcode(project.customerPostcode);
  const degreeDays = mcsData?.degreeDays || 2033;
  const outdoorLowTemp = mcsData?.lowTemp || -3;

  // Where the annual demand comes from: a valid EPC (MCS 031 2.1) or, where
  // none can be used, MCS 031 Appendix A from the room-by-room heat loss.
  const appendixA = isAppendixA(project);
  const aa = appendixA ? appendixADemand(project) : null;
  // 'hybrid' was removed from System Provides (Simon, 21 Nov). A project
  // still holding it must choose again before calculating.
  const legacyHybrid = project.mcsSystemProvides === 'hybrid';

  // MCS Calculations (Section 2 of MCS 031)
  const spaceHeatingDemand = appendixA ? aa.spaceHeatingKwh : (project.epcSpaceHeatingDemand || 0);
  const hotWaterDemand = appendixA ? aa.hotWaterKwh : (project.epcHotWaterDemand || 0);
  const totalFloorArea = appendixA ? aa.totalFloorArea : (project.epcTotalFloorArea || 0);

  // Calculate specific heat loss (W/K) — EPC route derives it from the EPC
  // demand; Appendix A takes it from the heat loss calculation.
  const specificHeatLoss = appendixA
    ? aa.specificHeatLossWK
    : spaceHeatingDemand > 0 && degreeDays > 0
      ? (1000 * spaceHeatingDemand) / (24 * degreeDays)
      : 0;

  // Calculate total heat loss (W)
  const designInternalTemp = 21;
  const totalHeatLoss = specificHeatLoss * (designInternalTemp - outdoorLowTemp);

  // Calculate W/m² — Appendix A: the heat loss calculation's own figure
  const wattsPerM2 = appendixA
    ? aa.wattsPerM2
    : totalFloorArea > 0 ? totalHeatLoss / totalFloorArea : 0;

  // Heat pump capacity (kW): indicative from the EPC, or the design load
  // from the full heat loss calculation on the Appendix A route
  const heatPumpCapacity = appendixA ? aa.heatPumpCapacityKw : totalHeatLoss / 1000;

  // Get SPF and stars using accurate lookup
  const flowTemp = project.designFlowTemp || 50;
  const heatPumpType = project.mcsHeatPumpType || 'ASHP';
  // Band is looked up from W/m2, as in the official calculator (Input E27->E28)
  const { spf, stars, heatLossBand, flowTempBand } = getSPFAndStars(wattsPerM2, flowTemp, heatPumpType);

  // Get warning notes
  const emitterType = project.mcsEmitterType || 'existing_radiators';
  const ufhType = project.mcsUFHType || 'screed';
  const warningNotes = getWarningNotes(wattsPerM2, flowTemp, emitterType, ufhType, heatPumpType);

  // Annual electricity consumption calculations. EPC route: SPF from the
  // MCS 031 table and 1.7 for hot water (SAP 2012 Table 4a). Appendix A:
  // the heat pump's listed SCoP and its water heating efficiency.
  const annualElecSpace = appendixA
    ? (aa.listedScop ? spaceHeatingDemand / aa.listedScop : 0)
    : spaceHeatingDemand / spf;
  const annualElecWater = appendixA
    ? (aa.providesHw && aa.dhwEfficiency ? hotWaterDemand / aa.dhwEfficiency : 0)
    : hotWaterDemand / 1.7;
  const canCalculate = !legacyHybrid && (appendixA ? aa.ok : (spaceHeatingDemand > 0 && totalFloorArea > 0));

  // Immersion heater for pasteurization
  const cylinderVolume = project.mcsCylinderVolume || 0;
  const pastFrequency = project.mcsPasteurizationFreq || 0;
  const annualElecImmersion = (pastFrequency * cylinderVolume * 10 * 4200) / 3600000;

  // Total annual electricity consumption
  const totalAnnualElec = annualElecSpace + annualElecWater + annualElecImmersion;
  const lowEstimate = totalAnnualElec * 0.9;
  const highEstimate = totalAnnualElec * 1.1;

  // Calculate graph data
  const getGraphData = () => {
    const ranges = getFlowTempRanges();
    return ranges.map(range => {
      const { spf: rangeSPF } = getSPFAndStars(wattsPerM2, range.value, heatPumpType);
      const elecSpace = spaceHeatingDemand / rangeSPF;
      const elecWater = hotWaterDemand / 1.7;
      const elecTotal = elecSpace + elecWater + annualElecImmersion;
      return {
        flowTemp: range.label,
        consumption: Math.round(elecTotal)
      };
    });
  };

  const handleCalculate = () => {
    const newSnapshot = {
      calculatedAt: new Date().toISOString(),
      inputFingerprint,
      spaceHeatingDemand,
      hotWaterDemand,
      totalFloorArea,
      wattsPerM2,
      heatPumpCapacity,
      heatPumpType,
      emitterType,
      systemProvides: project.mcsSystemProvides,
      flowTempBand,
      spf,
      stars,
      lowEstimate,
      highEstimate,
      warningNotes,
      specificHeatLoss,
      heatLossBand,
      notesVersion: MCS031_NOTES_VERSION,
      demandRoute: appendixA ? 'appendix_a' : 'epc',
      ...(appendixA ? {
        appendixA: {
          reason: aa.reason, reasonText: aa.reasonText, note: aa.note,
          degreeDays: aa.degreeDays, postcodePrefix: aa.postcodePrefix,
          dailyLitres: aa.dailyLitres, occupantsN: aa.occupantsN,
          listedScop: aa.listedScop, listedScopSource: aa.listedScopSource,
          dhwEfficiency: aa.providesHw ? aa.dhwEfficiency : null,
          dhwEfficiencySource: aa.providesHw ? aa.dhwEfficiencySource : '',
          methodStatement: aa.methodStatement,
        },
      } : {}),
    };
    onUpdate('mcsCalculationSnapshot', newSnapshot);
    onSave?.({ mcsCalculationSnapshot: newSnapshot });
  };

  const handleExportPDF = async () => {
    if (!snapshot) return;
    try {
      // Frozen snapshot values for audit integrity — shared builder, so the
      // customer pack and quote pack print the same document.
      const pdfData = buildMcsPerformancePayload(project);
      if (!pdfData) { alert('No saved MCS 031 calculation to export — calculate first.'); return; }

      // Call API to generate PDF
      const response = await fetch('/api/generate-pdf/performance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pdfData)
      });

      if (response.ok) {
        // Download the PDF
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MCS_Performance_Estimate_${project.name || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`;
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
  };

  return (
    <div className="space-y-6">
      {/* Source of the annual energy demand */}
      <div>
        <h3 className="font-semibold text-lg mb-3">Annual Energy Demand</h3>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio" name="mcsDemandRoute" className="mt-1"
              checked={!appendixA}
              onChange={() => { onUpdate('mcsDemandRoute', 'epc'); onSave?.({ mcsDemandRoute: 'epc' }); }}
            />
            <span><span className="font-semibold">From a valid EPC</span> (MCS 031 2.1) — not expired, and the
              heat demand won't change through an extension or refurbishment the heat pump will serve.</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio" name="mcsDemandRoute" className="mt-1"
              checked={appendixA}
              onChange={() => { onUpdate('mcsDemandRoute', 'appendix_a'); onSave?.({ mcsDemandRoute: 'appendix_a' }); }}
            />
            <span><span className="font-semibold">No valid EPC can be used</span> (MCS 031 Appendix A) — calculated
              from the room-by-room heat loss. If a valid EPC can be obtained, get one and lodge it instead.</span>
          </label>
        </div>
      </div>

      {appendixA && (
        <div className="bg-indigo-50 border border-indigo-300 rounded-lg p-4 space-y-4">
          {!aa.heatLoss.complete && (
            <div className="bg-red-50 border border-red-300 rounded px-3 py-2 text-sm text-red-800">
              <div className="font-semibold">Complete the room-by-room heat loss first.</div>
              <div className="mt-1">
                Without a valid EPC, this estimate is calculated from the heat loss: annual demand, floor area,
                W/m² and heat pump capacity all come from it.
              </div>
              <ul className="list-disc pl-5 mt-1">
                {aa.heatLoss.noRooms && <li>No rooms have been added yet.</li>}
                {aa.heatLoss.noArea.length > 0 && <li>No floor area: {aa.heatLoss.noArea.join(', ')}</li>}
                {aa.heatLoss.noElements.length > 0 && <li>No walls, windows, floors or roofs entered: {aa.heatLoss.noElements.join(', ')}</li>}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Why a valid EPC can't be used</label>
              <select
                value={project.mcsAppendixAReason || ''}
                onChange={(e) => { const v = e.target.value || null; onUpdate('mcsAppendixAReason', v); onSave?.({ mcsAppendixAReason: v }); }}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select…</option>
                {Object.entries(APPENDIX_A_REASONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Detail (printed on the estimate)</label>
              <input
                type="text"
                value={project.mcsAppendixANote || ''}
                onChange={(e) => onUpdate('mcsAppendixANote', e.target.value)}
                onBlur={(e) => onSave?.({ mcsAppendixANote: e.target.value.trim() || null })}
                placeholder="e.g. Two-storey rear extension in 2027 to be heated by the heat pump"
                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Heat pump SCoP for space heating (MCS website)</label>
              <div className="text-xs text-gray-600 mb-1">The listed SCoP at the design flow temperature ({project.designFlowTemp ?? '—'} °C), or the nearest listed flow temperature above it.</div>
              <input
                type="number" step="0.01" min="0"
                value={project.mcsListedScop || ''}
                onChange={(e) => onUpdate('mcsListedScop', parseFloat(e.target.value) || null)}
                onBlur={(e) => onSave?.({ mcsListedScop: parseFloat(e.target.value) || null })}
                placeholder="e.g. 3.85"
                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={project.mcsListedScopSource || ''}
                onChange={(e) => onUpdate('mcsListedScopSource', e.target.value)}
                onBlur={(e) => onSave?.({ mcsListedScopSource: e.target.value.trim() || null })}
                placeholder="Source — e.g. MCS product directory, model, flow temperature it applies to"
                className="w-full border border-gray-300 rounded px-3 py-2 mt-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {aa.providesHw && (
              <div>
                <label className="block text-sm font-semibold mb-1">Heat pump SCoP for hot water</label>
                <div className="text-xs text-gray-600 mb-1">
                  The MCS listing has no separate hot water figure. Enter the listed SCoP at the flow temperature
                  the heat pump uses to heat the cylinder — usually 55 °C. If you don't have it, use 1.7: the
                  figure MCS 031 itself uses for hot water (SAP 2012 Table 4a).
                </div>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" min="0"
                    value={project.mcsDhwEfficiency || ''}
                    onChange={(e) => onUpdate('mcsDhwEfficiency', parseFloat(e.target.value) || null)}
                    onBlur={(e) => onSave?.({ mcsDhwEfficiency: parseFloat(e.target.value) || null })}
                    placeholder="e.g. 2.9 (listed SCoP at 55 °C)"
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onUpdate('mcsDhwEfficiency', MCS031_DHW_DEFAULT);
                      onUpdate('mcsDhwEfficiencySource', MCS031_DHW_DEFAULT_SOURCE);
                      onSave?.({ mcsDhwEfficiency: MCS031_DHW_DEFAULT, mcsDhwEfficiencySource: MCS031_DHW_DEFAULT_SOURCE });
                    }}
                    className="whitespace-nowrap text-sm border border-indigo-400 text-indigo-700 rounded px-3 hover:bg-indigo-100"
                    title="Use the hot water figure MCS 031 uses on the EPC route"
                  >
                    Use 1.7
                  </button>
                </div>
                <input
                  type="text"
                  value={project.mcsDhwEfficiencySource || ''}
                  onChange={(e) => onUpdate('mcsDhwEfficiencySource', e.target.value)}
                  onBlur={(e) => onSave?.({ mcsDhwEfficiencySource: e.target.value.trim() || null })}
                  placeholder="Source — e.g. MCS product directory, model, SCoP at 55 °C"
                  className="w-full border border-gray-300 rounded px-3 py-2 mt-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-white border border-indigo-200 rounded px-3 py-2">
              <div className="text-xs text-gray-600">Space heating</div>
              <div className="font-bold text-indigo-900">{aa.degreeDays ? `${Math.round(aa.spaceHeatingKwh).toLocaleString('en-GB')} kWh/yr` : '—'}</div>
              <div className="text-xs text-gray-500">{aa.specificHeatLossWK.toFixed(1)} W/K × {aa.degreeDays ?? '—'} degree days</div>
            </div>
            <div className="bg-white border border-indigo-200 rounded px-3 py-2">
              <div className="text-xs text-gray-600">Hot water</div>
              <div className="font-bold text-indigo-900">{aa.providesHw ? (aa.dailyLitres ? `${Math.round(aa.hotWaterKwh).toLocaleString('en-GB')} kWh/yr` : '—') : 'Not supplied'}</div>
              <div className="text-xs text-gray-500">{aa.providesHw && aa.dailyLitres ? `${aa.dailyLitres} L/day, 10 → 50 °C` : ''}</div>
            </div>
            <div className="bg-white border border-indigo-200 rounded px-3 py-2">
              <div className="text-xs text-gray-600">From the heat loss</div>
              <div className="font-bold text-indigo-900">{aa.totalFloorArea.toFixed(0)} m² · {aa.wattsPerM2.toFixed(1)} W/m²</div>
              <div className="text-xs text-gray-500">Design load {aa.heatPumpCapacityKw.toFixed(1)} kW</div>
            </div>
          </div>
          {aa.missing.length > 0 && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2">
              Still needed before calculating: {aa.missing.join('; ')}.
            </div>
          )}
        </div>
      )}

      {/* EPC Data Input */}
      {!appendixA && (
      <div>
        <h3 className="font-semibold text-lg mb-3">Energy Performance Certificate (EPC) Data</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">
              Space Heating Demand (kWh/year)
            </label>
            <input
              type="number"
              value={project.epcSpaceHeatingDemand || ''}
              onChange={(e) => onUpdate('epcSpaceHeatingDemand', parseFloat(e.target.value) || 0)}
              onBlur={(e) => onSave?.({ epcSpaceHeatingDemand: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Hot Water Demand (kWh/year)
            </label>
            <input
              type="number"
              value={project.epcHotWaterDemand || ''}
              onChange={(e) => onUpdate('epcHotWaterDemand', parseFloat(e.target.value) || 0)}
              onBlur={(e) => onSave?.({ epcHotWaterDemand: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Total Floor Area (m²)
            </label>
            <input
              type="number"
              value={project.epcTotalFloorArea || ''}
              onChange={(e) => onUpdate('epcTotalFloorArea', parseFloat(e.target.value) || 0)}
              onBlur={(e) => onSave?.({ epcTotalFloorArea: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              Total floor area from EPC (not footprint)
            </div>
          </div>
        </div>
      </div>
      )}

      {/* System Configuration */}
      <div>
        <h3 className="font-semibold text-lg mb-3">Proposed System Configuration</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Heat Pump Type</label>
            <select
              value={project.mcsHeatPumpType || 'ASHP'}
              onChange={(e) => { onUpdate('mcsHeatPumpType', e.target.value); onSave?.({ mcsHeatPumpType: e.target.value }); }}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="ASHP">Air Source Heat Pump (ASHP)</option>
              <option value="GSHP">Ground Source Heat Pump (GSHP)</option>
              <option value="WSHP">Water Source Heat Pump (WSHP)</option>
              <option value="SAHP">Solar Assisted Heat Pump (SAHP)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Proposed Emitters</label>
            <select
              value={project.mcsEmitterType || 'existing_radiators'}
              onChange={(e) => { onUpdate('mcsEmitterType', e.target.value); onSave?.({ mcsEmitterType: e.target.value }); }}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="existing_radiators">Your existing radiators (none upgraded)</option>
              <option value="upgraded_radiators">Mostly (at least 50%) upgraded radiators</option>
              <option value="mostly_ufh">Mostly underfloor</option>
              <option value="50_50_mix">Approx. 50% radiators and 50% underfloor</option>
            </select>
          </div>

          {(emitterType === 'mostly_ufh' || emitterType === '50_50_mix') && (
            <div>
              <label className="block text-sm font-semibold mb-1">UFH Construction Type</label>
              <select
                value={project.mcsUFHType || 'screed'}
                onChange={(e) => { onUpdate('mcsUFHType', e.target.value); onSave?.({ mcsUFHType: e.target.value }); }}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="screed">Flooring on Screed</option>
                <option value="chipboard">Flooring on Chipboard on Aluminium</option>
                <option value="panel">Flooring on High Conductivity Panel on Aluminium</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold mb-1">System Provides</label>
            <select
              value={legacyHybrid ? '' : (project.mcsSystemProvides || 'space_and_hw')}
              onChange={(e) => { if (!e.target.value) return; onUpdate('mcsSystemProvides', e.target.value); onSave?.({ mcsSystemProvides: e.target.value }); }}
              className={`w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 ${legacyHybrid ? 'border-amber-500' : 'border-gray-300'}`}
            >
              {legacyHybrid && <option value="">Select…</option>}
              <option value="space_and_hw">Space heat and hot water</option>
              <option value="space_only">Space heating only</option>
            </select>
            {legacyHybrid && (
              <div className="text-xs text-amber-800 mt-1">
                This project was set to Hybrid, which is no longer an option: a hybrid system is outside
                the grant scheme and doesn't need an MCS 031 estimate. Choose what the heat pump provides.
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              Design Flow Temperature (°C)
            </label>
            <input
              type="number"
              value={flowInput}
              onChange={(e) => { setFlowInput(e.target.value); setFlowError(''); }}
              onBlur={handleFlowBlur}
              className={`w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 ${
                flowError ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {flowError ? (
              <div className="text-xs text-red-600 mt-1">{flowError}</div>
            ) : (
              <div className="text-xs text-gray-500 mt-1">
                Shared with Emitter Sizing.
                {dtValid && ` Return follows at ΔT ${currentDt.toFixed(1)} K (currently ${project.designReturnTemp}°C).`}
                {' '}MCS 031 2.3(j): use 60°C with existing radiators unless the room-by-room
                calculation justifies lower.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hot Water Cylinder Configuration */}
      <div>
        <h3 className="font-semibold text-lg mb-3">Hot Water Cylinder</h3>
        
        {/* Cylinder Size Calculator */}
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-4">
          <h4 className="font-semibold mb-3 text-blue-900">Daily Hot Water Demand (MIS 3005-D 5.6.2)</h4>
          <p className="text-sm text-blue-800 mb-3">
            V<sub>d,average</sub> = 45 × N, where N = the greater of (bedrooms + 1) or (number of known occupants).
            Select the cylinder from this demand and the heat pump capacity (5.6.3, MGD 007).
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Number of Bedrooms</label>
              <input
                type="number"
                min="0"
                value={project.mcsBedrooms || ''}
                onChange={(e) => onUpdate('mcsBedrooms', parseInt(e.target.value) || 0)}
              onBlur={(e) => onSave?.({ mcsBedrooms: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Number of Occupants</label>
              <input
                type="number"
                min="0"
                value={project.mcsOccupants || ''}
                onChange={(e) => onUpdate('mcsOccupants', parseInt(e.target.value) || 0)}
              onBlur={(e) => onSave?.({ mcsOccupants: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="bg-green-50 border border-green-300 rounded px-3 py-2">
              <label className="block text-sm font-semibold mb-1 text-green-800">Daily Hot Water Demand</label>
              <div className="text-2xl font-bold text-green-700">
                {dhwDemand ? `${dhwDemand.litres} L/day` : '—'}
              </div>
              {dhwDemand && (
                <div className="text-xs text-green-700">
                  N = {dhwDemand.n} (from {dhwDemand.basis === 'occupants' ? 'occupants' : 'bedrooms + 1'})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actual Cylinder Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Selected Cylinder Size (litres)</label>
            <input
              type="number"
              value={project.mcsCylinderVolume || ''}
              onChange={(e) => onUpdate('mcsCylinderVolume', parseFloat(e.target.value) || 0)}
              onBlur={(e) => onSave?.({ mcsCylinderVolume: parseFloat(e.target.value) || 0 })}
              placeholder="e.g. 210"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              Enter the actual cylinder size you'll be installing
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Pasteurization Strategy</label>
            <select
              value={project.mcsPasteurizationFreq || 0}
              onChange={(e) => { const v = parseInt(e.target.value); onUpdate('mcsPasteurizationFreq', v); onSave?.({ mcsPasteurizationFreq: v }); }}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>None (heat pump provides)</option>
              <option value={52}>Weekly (immersion)</option>
              <option value={365}>Daily (immersion)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inputs changed warning */}
      {needsRecalc && (
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded p-4 flex items-center gap-3">
          <span className="text-amber-700 text-xl">⚠</span>
          <div>
            {inputsChangedSinceSnapshot ? (
              <>
                <p className="font-semibold text-amber-800">Inputs have changed since the last calculation</p>
                <p className="text-sm text-amber-700">The saved results below may no longer reflect the current inputs. Click Recalculate to update.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-amber-800">Calculated with an earlier warning notes table</p>
                <p className="text-sm text-amber-700">
                  The warning notes now follow the official MCS 031 calculator ({MCS031_NOTES_VERSION}).
                  Recalculate to update them; re-issue the estimate if it has gone to the customer.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Calculate / Recalculate Button */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleCalculate}
          disabled={!canCalculate}
          className={`text-white px-6 py-3 rounded font-semibold transition disabled:bg-gray-400 disabled:cursor-not-allowed ${
            needsRecalc
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {snapshot
            ? '⟳ Recalculate & Save'
            : 'Calculate & Save Performance Estimate'}
        </button>

        {snapshot && (
          <>
            {snapshot.demandRoute !== 'appendix_a' && (
            <button
              onClick={() => setShowGraph(!showGraph)}
              className="bg-purple-600 text-white px-6 py-3 rounded hover:bg-purple-700 font-semibold transition"
            >
              {showGraph ? 'Hide' : 'Show'} Performance Graph
            </button>
            )}
            <button
              onClick={handleExportPDF}
              className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 font-semibold transition"
            >
              Export as PDF
            </button>
          </>
        )}
      </div>

      {/* Performance Graph */}
      {snapshot && showGraph && snapshot.demandRoute !== 'appendix_a' && (
        <div className="border-2 border-purple-600 rounded-lg p-6 bg-white">
          <h3 className="text-xl font-bold mb-4 text-center">System Performance vs Flow Temperature</h3>
          <PerformanceGraph data={getGraphData()} currentFlowTemp={snapshot.flowTempBand} />
        </div>
      )}

      {/* Results Section */}
      {snapshot && (
        <div className={`border-2 rounded-lg p-6 bg-white ${needsRecalc ? 'border-amber-400 opacity-75' : 'border-blue-600'}`}>
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-2xl font-bold text-blue-900">
              Heat Pump System Performance Estimate
            </h3>
            <div className="text-right text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
              <div className="font-semibold text-gray-700">Calculation date</div>
              <div>{new Date(snapshot.calculatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
              <div>{new Date(snapshot.calculatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>

          {/* Star Rating Display */}
          <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-lg p-4">
            <div className="text-center">
              <div className="text-sm font-semibold text-gray-700 mb-2">
                System Emitter Star Rating
              </div>
              <div className="text-4xl mb-2">
                {renderStars(snapshot.stars)}
              </div>
              <div className="text-xs text-gray-600">
                Based on the proposed design flow temperature of the system, ranging between 0 and 6 stars
              </div>
            </div>
          </div>

          {/* Energy Requirements */}
          <div className="mb-6">
            <h4 className="font-bold text-lg mb-3 text-gray-800">Your energy requirements</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Energy required for heating</span>
                <span className="font-semibold">{snapshot.spaceHeatingDemand.toFixed(0)} kWh</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Demand supplied by heat pump</span>
                <span className="font-semibold">{snapshot.spaceHeatingDemand.toFixed(0)} kWh</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Energy required for hot water</span>
                <span className="font-semibold">{snapshot.hotWaterDemand.toFixed(0)} kWh</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Demand supplied by heat pump</span>
                <span className="font-semibold">{snapshot.hotWaterDemand.toFixed(0)} kWh</span>
              </div>
            </div>
          </div>

          {/* Property Information */}
          <div className="mb-6">
            <h4 className="font-bold text-lg mb-3 text-gray-800">Your property</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Your postcode prefix</span>
                <span className="font-semibold">{getPostcodePrefix(project.customerPostcode) || 'Not set'}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Total property floorspace</span>
                <span className="font-semibold">{snapshot.totalFloorArea.toFixed(0)} m²</span>
              </div>
              <div className="col-span-2 flex justify-between p-2 bg-blue-50 rounded border border-blue-300">
                <div>
                  <span className="font-semibold">Average watts per square metre</span>
                  <div className="text-xs text-gray-600 mt-1">
                    0-30W/m² is very low heat loss and 120-150W/m² is very high heat loss
                  </div>
                </div>
                <span className="font-bold text-lg">{snapshot.wattsPerM2.toFixed(1)} W/m²</span>
              </div>
            </div>
          </div>

          {/* Proposed System */}
          <div className="mb-6">
            <h4 className="font-bold text-lg mb-3 text-gray-800">Proposed system</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <div>
                  <span>Heat pump capacity</span>
                  <div className="text-xs text-gray-600 mt-1">
                    {snapshot.demandRoute === 'appendix_a'
                      ? 'Design load from the full room-by-room heat loss calculation'
                      : 'Indicative only - may change after full heat loss calculation'}
                  </div>
                </div>
                <span className="font-semibold">{snapshot.heatPumpCapacity.toFixed(1)} kW</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Heat pump type</span>
                <span className="font-semibold">{snapshot.heatPumpType}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>System provides</span>
                <span className="font-semibold text-right text-xs">
                  {snapshot.systemProvides === 'space_and_hw' ? 'Space heat and hot water' :
                   snapshot.systemProvides === 'space_only' ? 'Space heating only' :
                   snapshot.systemProvides === 'hybrid' ? 'Hybrid — no longer an option, recalculate' : '—'}
                </span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Heating system</span>
                <span className="font-semibold text-right text-xs">
                  {snapshot.emitterType === 'existing_radiators' ? 'Existing radiators' :
                   snapshot.emitterType === 'upgraded_radiators' ? 'Mostly upgraded radiators' :
                   snapshot.emitterType === 'mostly_ufh' ? 'Mostly underfloor' : '50% radiators, 50% UFH'}
                </span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Proposed flow temperature</span>
                <span className="font-semibold">{snapshot.flowTempBand}</span>
              </div>
            </div>
          </div>

          {/* Performance */}
          <div className="mb-6">
            <h4 className="font-bold text-lg mb-3 text-gray-800">Performance</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {snapshot.demandRoute === 'appendix_a' ? (
                <div className="p-3 bg-green-50 rounded border border-green-300">
                  <span className="block text-gray-700 mb-1">Heat pump SCoP (MCS listed)</span>
                  <span className="font-bold text-2xl text-green-700">{snapshot.appendixA?.listedScop}</span>
                  {snapshot.appendixA?.dhwEfficiency && (
                    <span className="block text-xs text-gray-600 mt-1">Hot water SCoP {snapshot.appendixA.dhwEfficiency}</span>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-green-50 rounded border border-green-300">
                  <span className="block text-gray-700 mb-1">Seasonal Performance Factor</span>
                  <span className="font-bold text-2xl text-green-700">{snapshot.spf.toFixed(1)}</span>
                </div>
              )}
              <div className="col-span-2 p-3 bg-gray-50 rounded">
                <div className="mb-2 font-semibold">Estimate of energy consumption:</div>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs text-gray-600">Low estimate</div>
                    <div className="font-bold text-lg">{snapshot.lowEstimate.toFixed(0)} kWh</div>
                  </div>
                  <div className="text-gray-400">to</div>
                  <div>
                    <div className="text-xs text-gray-600">High estimate</div>
                    <div className="font-bold text-lg">{snapshot.highEstimate.toFixed(0)} kWh</div>
                  </div>
                </div>
                <div className="text-xs text-gray-600 mt-2">
                  You can convert these figures to approximate running costs
                </div>
              </div>
            </div>
          </div>

          {/* How the demand was estimated (Appendix A must be described and justified) */}
          {snapshot.demandRoute === 'appendix_a' && snapshot.appendixA?.methodStatement?.length > 0 && (
            <div className="mb-6">
              <h4 className="font-bold text-lg mb-3 text-gray-800">How your energy demand was estimated</h4>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                {snapshot.appendixA.methodStatement.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          )}

          {/* Warning Notes */}
          {snapshot.warningNotes && snapshot.warningNotes.length > 0 && (
            <div className="mb-6">
              <h4 className="font-bold text-lg mb-3 text-orange-700">Applicable warning notes:</h4>
              <div className="space-y-2">
                {snapshot.warningNotes.map(note => (
                  <div key={note.number} className="bg-orange-50 border-l-4 border-orange-400 p-3 text-sm">
                    <span className="font-semibold">Note {note.number}:</span> {note.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Important Note */}
          <div className="border-t-2 border-gray-300 pt-4">
            <p className="text-sm font-semibold text-gray-700">
              <strong>Important Note:</strong> This is not a detailed system design. It offers a reasonable estimate of likely
              performance and a description of the likely design.{' '}
              {snapshot.demandRoute === 'appendix_a'
                ? 'This estimate is based on a full heat loss survey and design.'
                : 'Details may change after the heat loss survey and design.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple performance graph component
function PerformanceGraph({ data, currentFlowTemp }) {
  if (!data || data.length === 0) return null;

  const maxConsumption = Math.max(...data.map(d => d.consumption));
  const minConsumption = Math.min(...data.map(d => d.consumption));
  const range = maxConsumption - minConsumption || 1;

  return (
    <div className="bg-gray-50 rounded p-6">
      <div className="text-center mb-6 font-semibold text-lg">
        Electricity Consumption of Proposed Installation
      </div>
      
      <div className="flex gap-4">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between text-xs text-gray-600 pr-2" style={{ minWidth: '60px' }}>
          <div className="text-right">{maxConsumption.toLocaleString()}</div>
          <div className="text-right">{Math.round((maxConsumption + minConsumption) / 2).toLocaleString()}</div>
          <div className="text-right">{minConsumption.toLocaleString()}</div>
        </div>
        
        {/* Graph area */}
        <div className="flex-1">
          <div className="relative border-l-2 border-b-2 border-gray-400" style={{ height: '300px' }}>
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* Connecting line */}
              <polyline
                points={data.map((point, index) => {
                  const x = (index / (data.length - 1)) * 100;
                  const y = 100 - (((point.consumption - minConsumption) / range) * 95);
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
              
              {/* Data points */}
              {data.map((point, index) => {
                const x = (index / (data.length - 1)) * 100;
                const y = 100 - (((point.consumption - minConsumption) / range) * 95);
                const isActive = point.flowTemp === currentFlowTemp;
                
                return (
                  <g key={index}>
                    <circle
                      cx={x}
                      cy={y}
                      r="1.5"
                      fill={isActive ? '#ef4444' : '#3b82f6'}
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Value label */}
                    <text
                      x={x}
                      y={y - 3}
                      textAnchor="middle"
                      fontSize="3"
                      fill={isActive ? '#ef4444' : '#1f2937'}
                      fontWeight={isActive ? 'bold' : 'normal'}
                    >
                      {point.consumption.toLocaleString()}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          
          {/* X-axis labels */}
          <div className="flex justify-between mt-2 text-xs">
            {data.map((point, index) => (
              <div 
                key={index} 
                className={`text-center ${point.flowTemp === currentFlowTemp ? 'font-bold text-red-600' : 'text-gray-600'}`}
                style={{ flex: 1 }}
              >
                {point.flowTemp}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="text-center mt-4 text-sm font-semibold text-gray-700">
        Heat Pump System Flow Temperature (°C)
      </div>
      <div className="text-center mt-1 text-xs text-gray-500">
        Y-axis: Electricity (kWh/year)
      </div>
    </div>
  );
}
