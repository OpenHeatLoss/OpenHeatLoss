// client/src/components/project/MCSPerformanceEstimator.jsx
import { useState } from 'react';
import { getMCSDataFromPostcode } from '../../utils/mcsData';
import { getSPFAndStars, renderStars, getFlowTempRanges } from '../../utils/mcsSPFLookup';
import { getWarningNotes } from '../../utils/mcsWarningNotes';

export default function MCSPerformanceEstimator({ project, onUpdate }) {
  const [showGraph, setShowGraph] = useState(false);

  // Snapshot stored on project — persists across sessions
  const snapshot = project.mcsCalculationSnapshot || null;

  // Detect whether current inputs differ from the saved snapshot
  const inputFingerprint = JSON.stringify({
    epcSpaceHeatingDemand: project.epcSpaceHeatingDemand,
    epcHotWaterDemand: project.epcHotWaterDemand,
    epcTotalFloorArea: project.epcTotalFloorArea,
    mcsHeatPumpType: project.mcsHeatPumpType,
    mcsEmitterType: project.mcsEmitterType,
    mcsUFHType: project.mcsUFHType,
    mcsSystemProvides: project.mcsSystemProvides,
    designFlowTemp: project.designFlowTemp,
    mcsCylinderVolume: project.mcsCylinderVolume,
    mcsPasteurizationFreq: project.mcsPasteurizationFreq,
    customerPostcode: project.customerPostcode,
  });
  const inputsChangedSinceSnapshot = snapshot && snapshot.inputFingerprint !== inputFingerprint;

  // Extract postcode data
  const mcsData = getMCSDataFromPostcode(project.customerPostcode);
  const degreeDays = mcsData?.degreeDays || 2033;
  const outdoorLowTemp = mcsData?.lowTemp || -3;

  // MCS Calculations (Section 2 of MCS 031)
  const spaceHeatingDemand = project.epcSpaceHeatingDemand || 0;
  const hotWaterDemand = project.epcHotWaterDemand || 0;
  const totalFloorArea = project.epcTotalFloorArea || 0;

  // Calculate specific heat loss (W/K)
  const specificHeatLoss = spaceHeatingDemand > 0 && degreeDays > 0
    ? (1000 * spaceHeatingDemand) / (24 * degreeDays)
    : 0;

  // Calculate total heat loss (W)
  const designInternalTemp = 21;
  const totalHeatLoss = specificHeatLoss * (designInternalTemp - outdoorLowTemp);

  // Calculate W/m²
  const wattsPerM2 = totalFloorArea > 0 ? totalHeatLoss / totalFloorArea : 0;

  // Indicative heat pump capacity (kW)
  const heatPumpCapacity = totalHeatLoss / 1000;

  // Get SPF and stars using accurate lookup
  const flowTemp = project.designFlowTemp || 50;
  const heatPumpType = project.mcsHeatPumpType || 'ASHP';
  const { spf, stars, heatLossBand, flowTempBand } = getSPFAndStars(specificHeatLoss, flowTemp, heatPumpType);

  // Get warning notes
  const emitterType = project.mcsEmitterType || 'existing_radiators';
  const ufhType = project.mcsUFHType || 'screed';
  const warningNotes = getWarningNotes(specificHeatLoss, flowTemp, emitterType, ufhType);

  // Annual electricity consumption calculations
  const annualElecSpace = spaceHeatingDemand / spf;
  const annualElecWater = hotWaterDemand / 1.7; // From SAP 2012 Table 4a

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
      const { spf: rangeSPF } = getSPFAndStars(specificHeatLoss, range.value, heatPumpType);
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
    };
    onUpdate('mcsCalculationSnapshot', newSnapshot);
  };

  const handleExportPDF = async () => {
    if (!snapshot) return;
    try {
      // Use frozen snapshot values for audit integrity
      const s = snapshot;
      const calcDate = new Date(s.calculatedAt).toLocaleDateString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      const pdfData = {
        projectName: project.name || 'Untitled Project',
        location: project.location || '',
        designer: project.designer || '',
        customerTitle: project.customerTitle || '',
        customerFirstName: project.customerFirstName || '',
        customerSurname: project.customerSurname || '',
        customerAddress: project.customerAddress || '',
        customerPostcode: project.customerPostcode || '',
        customerTelephone: project.customerTelephone || '',
        customerEmail: project.customerEmail || '',
        calculatedAt: calcDate,
        spaceHeatingDemand: s.spaceHeatingDemand,
        hotWaterDemand: s.hotWaterDemand,
        totalFloorArea: s.totalFloorArea,
        wattsPerM2: s.wattsPerM2,
        heatPumpCapacity: s.heatPumpCapacity,
        heatPumpType: s.heatPumpType,
        systemProvides: s.systemProvides === 'space_and_hw' ? 'Space heat and hot water' :
                       s.systemProvides === 'space_only' ? 'Space heating only' : 'Hybrid',
        emitterType: s.emitterType === 'existing_radiators' ? 'Existing radiators' :
                     s.emitterType === 'upgraded_radiators' ? 'Mostly upgraded radiators' :
                     s.emitterType === 'mostly_ufh' ? 'Mostly underfloor' : '50% radiators, 50% UFH',
        flowTempBand: s.flowTempBand,
        spf: s.spf,
        lowEstimate: s.lowEstimate,
        highEstimate: s.highEstimate,
        stars: s.stars,
        warningNotes: s.warningNotes
      };

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
      {/* EPC Data Input */}
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
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              Total floor area from EPC (not footprint)
            </div>
          </div>
        </div>
      </div>

      {/* System Configuration */}
      <div>
        <h3 className="font-semibold text-lg mb-3">Proposed System Configuration</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Heat Pump Type</label>
            <select
              value={project.mcsHeatPumpType || 'ASHP'}
              onChange={(e) => onUpdate('mcsHeatPumpType', e.target.value)}
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
              onChange={(e) => onUpdate('mcsEmitterType', e.target.value)}
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
                onChange={(e) => onUpdate('mcsUFHType', e.target.value)}
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
              value={project.mcsSystemProvides || 'space_and_hw'}
              onChange={(e) => onUpdate('mcsSystemProvides', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="space_and_hw">Space heat and hot water</option>
              <option value="space_only">Space heating only</option>
              <option value="hybrid">Hybrid (Combining heat pump and boiler)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              Design Flow Temperature (°C)
            </label>
            <input
              type="number"
              value={project.designFlowTemp || 50}
              onChange={(e) => onUpdate('designFlowTemp', parseFloat(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              Default 60°C if using existing radiators
            </div>
          </div>
        </div>
      </div>

      {/* Hot Water Cylinder Configuration */}
      <div>
        <h3 className="font-semibold text-lg mb-3">Hot Water Cylinder</h3>
        
        {/* Cylinder Size Calculator */}
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-4">
          <h4 className="font-semibold mb-3 text-blue-900">Cylinder Size Calculator</h4>
          <p className="text-sm text-blue-800 mb-3">
            Formula: Volume = 45 × N, where N = the greater of (bedrooms + 1) or (number of occupants)
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Number of Bedrooms</label>
              <input
                type="number"
                min="0"
                value={project.mcsBedrooms || ''}
                onChange={(e) => onUpdate('mcsBedrooms', parseInt(e.target.value) || 0)}
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
                className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="bg-green-50 border border-green-300 rounded px-3 py-2">
              <label className="block text-sm font-semibold mb-1 text-green-800">Calculated Hot Water Demand</label>
              <div className="text-2xl font-bold text-green-700">
                {(() => {
                  const bedrooms = project.mcsBedrooms || 0;
                  const occupants = project.mcsOccupants || 0;
                  const n = Math.max(bedrooms + 1, occupants);
                  return (45 * n).toFixed(0);
                })()}L
              </div>
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
              onChange={(e) => onUpdate('mcsPasteurizationFreq', parseInt(e.target.value))}
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
      {inputsChangedSinceSnapshot && (
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded p-4 flex items-center gap-3">
          <span className="text-amber-700 text-xl">⚠</span>
          <div>
            <p className="font-semibold text-amber-800">Inputs have changed since the last calculation</p>
            <p className="text-sm text-amber-700">The saved results below may no longer reflect the current inputs. Click Recalculate to update.</p>
          </div>
        </div>
      )}

      {/* Calculate / Recalculate Button */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleCalculate}
          disabled={!spaceHeatingDemand || !totalFloorArea}
          className={`text-white px-6 py-3 rounded font-semibold transition disabled:bg-gray-400 disabled:cursor-not-allowed ${
            inputsChangedSinceSnapshot
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {snapshot
            ? inputsChangedSinceSnapshot ? '⟳ Recalculate & Save' : '⟳ Recalculate & Save'
            : 'Calculate & Save Performance Estimate'}
        </button>

        {snapshot && (
          <>
            <button
              onClick={() => setShowGraph(!showGraph)}
              className="bg-purple-600 text-white px-6 py-3 rounded hover:bg-purple-700 font-semibold transition"
            >
              {showGraph ? 'Hide' : 'Show'} Performance Graph
            </button>
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
      {snapshot && showGraph && (
        <div className="border-2 border-purple-600 rounded-lg p-6 bg-white">
          <h3 className="text-xl font-bold mb-4 text-center">System Performance vs Flow Temperature</h3>
          <PerformanceGraph data={getGraphData()} currentFlowTemp={snapshot.flowTempBand} />
        </div>
      )}

      {/* Results Section */}
      {snapshot && (
        <div className={`border-2 rounded-lg p-6 bg-white ${inputsChangedSinceSnapshot ? 'border-amber-400 opacity-75' : 'border-blue-600'}`}>
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
                <span className="font-semibold">{project.customerPostcode || 'Not set'}</span>
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
                    Indicative only - may change after full heat loss calculation
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
                   snapshot.systemProvides === 'space_only' ? 'Space heating only' : 'Hybrid'}
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
              <div className="p-3 bg-green-50 rounded border border-green-300">
                <span className="block text-gray-700 mb-1">Seasonal Performance Factor</span>
                <span className="font-bold text-2xl text-green-700">{snapshot.spf.toFixed(1)}</span>
              </div>
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
              performance and a description of the likely design. Details may change after the heat loss survey and design.
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
