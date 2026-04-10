// client/src/components/pipesizing/PipeSizing.jsx
import { useState, useEffect } from 'react';
import PipeSectionEditor from './PipeSectionEditor';
import { PIPE_MATERIALS } from '../../utils/pipeMaterialData';
import { calculateSystemVolume } from '../../utils/calculateSystemVolume';

export default function PipeSizing({ project, onUpdate }) {
  const [sections, setSections] = useState(() => {
    if (!project.pipeSections) return [];
    if (Array.isArray(project.pipeSections)) return project.pipeSections;
    // Handle case where it might be a JSON string
    if (typeof project.pipeSections === 'string') {
      try {
        const parsed = JSON.parse(project.pipeSections);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  
  // Sync sections when project.pipeSections changes (e.g., when loading a different project)
  useEffect(() => {
    let newSections = [];
    
    if (project.pipeSections) {
      if (Array.isArray(project.pipeSections)) {
        newSections = project.pipeSections;
      } else if (typeof project.pipeSections === 'string') {
        try {
          const parsed = JSON.parse(project.pipeSections);
          newSections = Array.isArray(parsed) ? parsed : [];
        } catch {
          newSections = [];
        }
      }
    }
    
    setSections(newSections);
  }, [project.pipeSections]);
  
  const [editingSection, setEditingSection] = useState(null);
  const [editingSectionIndex, setEditingSectionIndex] = useState(null);
  const [showSectionEditor, setShowSectionEditor] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [showVolumeBreakdown, setShowVolumeBreakdown] = useState(false);

  const handleAddSection = () => {
    setEditingSection(null);
    setEditingSectionIndex(null);
    setShowSectionEditor(true);
  };

  const handleEditSection = (section, index) => {
    setEditingSection(section);
    setEditingSectionIndex(index);
    setShowSectionEditor(true);
  };

  const handleSaveSection = (updatedSection) => {
    let updatedSections;
    
    if (editingSectionIndex !== null) {
      // Update existing section
      updatedSections = [...sections];
      updatedSections[editingSectionIndex] = updatedSection;
    } else {
      // Add new section
      updatedSections = [...sections, updatedSection];
    }
    
    setSections(updatedSections);
    onUpdate('pipeSections', updatedSections);
    setShowSectionEditor(false);
    setEditingSection(null);
    setEditingSectionIndex(null);
  };

  const handleCancelSection = () => {
    setShowSectionEditor(false);
    setEditingSection(null);
    setEditingSectionIndex(null);
  };

  const handleDeleteSection = (index) => {
    if (confirm('Are you sure you want to delete this pipe section?')) {
      const updatedSections = sections.filter((_, i) => i !== index);
      setSections(updatedSections);
      onUpdate('pipeSections', updatedSections);
    }
  };

  // Toggle index circuit inclusion for a section
  const toggleIndexCircuitInclusion = (index) => {
    const updatedSections = [...sections];
    updatedSections[index] = {
      ...updatedSections[index],
      includeInIndexCircuit: !updatedSections[index].includeInIndexCircuit
    };
    setSections(updatedSections);
    onUpdate('pipeSections', updatedSections);
  };

  // Export pipe sizing report as PDF
  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    
    try {
      // Calculate system flow rate
      const systemFlowRate = project.heatPumpRatedOutput 
        ? Math.round((project.heatPumpRatedOutput / (4.18 * ((project.designFlowTemp || 50) - (project.designReturnTemp || 40)))) * 1000) / 1000
        : 0;
      
      // Calculate system volume for PDF
      const sysVol = calculateSystemVolume(project);

      // Calculate per-radiator flow rates for PDF
      const pdfFlow = project.designFlowTemp  || 50;
      const pdfRet  = project.designReturnTemp || 40;
      const pdfDT   = pdfFlow - pdfRet;
      const radiatorFlowRates = [];
      for (const room of (project.rooms || [])) {
        const mwat = ((pdfFlow + pdfRet) / 2) - (room.internalTemp || 21);
        for (const item of (room.radiatorSchedule || [])) {
          if (item.emitter_status === 'existing_replace') continue;
          const spec = (project.radiatorSpecs || []).find(s => s.id === item.radiator_spec_id);
          if (!spec) continue;
          const ef = item.enclosure_factor ?? 1.0;
          const ff = item.finish_factor    ?? 1.0;
          const qty = item.quantity || 1;
          const effDt50PerUnit = spec.output_dt50 * ef * ff;
          const outputPerUnit  = mwat > 0 ? effDt50PerUnit * Math.pow(mwat / 50, 1.3) : 0;
          const flowLs         = pdfDT > 0 ? (outputPerUnit / 1000) / (4.18 * pdfDT) : 0;
          radiatorFlowRates.push({
            room:         room.name,
            spec:         `${spec.manufacturer} ${spec.model} ${spec.height}×${spec.length}mm`,
            qty,
            outputW:      Math.round(outputPerUnit),
            outputTotalW: Math.round(outputPerUnit * qty),
            flowLs,
            flowLh:       flowLs * 3600,
          });
        }
      }

      // Prepare data for PDF
      const pdfData = {
        projectName: project.name || 'Untitled Project',
        location: project.location || '',
        designer: project.designer || '',
        customerName: project.customerFirstName && project.customerSurname 
          ? `${project.customerTitle || ''} ${project.customerFirstName} ${project.customerSurname}`.trim()
          : '',
        heatPumpOutput: project.heatPumpRatedOutput || 0,
        designFlowTemp: project.designFlowTemp || 50,
        designReturnTemp: project.designReturnTemp || 40,
        systemFlowRate: systemFlowRate,
        sections: sections,
        indexCircuit: indexCircuit,
        systemVolume: sysVol,
        radiatorFlowRates,
      };
      
      // Call API to generate PDF
      const response = await fetch('/api/generate-pdf/pipe-sizing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pdfData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pipe_Sizing_${project.name || 'Report'}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Index circuit is the designer-selected set of sections that form the longest/
  // highest-resistance flow path. Summed directly from user checkboxes.
  const indexCircuitSections = sections.filter(s => s.includeInIndexCircuit);
  const indexCircuit = indexCircuitSections.length > 0 ? {
    sections: indexCircuitSections,
    totalPressureDrop: indexCircuitSections.reduce((sum, s) => sum + (s.pressureDrop || 0), 0),
    totalLength: indexCircuitSections.reduce((sum, s) => sum + (s.length || 0), 0)
  } : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">Pipe Sizing</h2>
        <p className="text-gray-600">
          Design pipe sections, calculate pressure drops, and identify the index circuit for pump sizing.
        </p>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-6">

          {/* Left — workflow guidance */}
          <div>
            <h3 className="font-semibold text-blue-900 mb-2">How to Use</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Add pipe sections from heat pump to different parts of the system</li>
              <li>• For main headers: Select "Use full heat pump output"</li>
              <li>• For branches: Select specific rooms/radiators being fed</li>
              <li>• System automatically calculates pressure drops and identifies the index circuit</li>
              <li>• The index circuit is the longest flow path with highest pressure drop</li>
            </ul>
          </div>

          {/* Right — material selection guide */}
          <div>
            <h3 className="font-semibold text-blue-900 mb-2">Material Selection Guide</h3>
            <div className="space-y-1.5">
              {Object.entries(PIPE_MATERIALS).map(([key, mat]) => (
                <div key={key} className="flex items-baseline justify-between text-sm">
                  <span className="text-blue-800 font-medium">{mat.name}</span>
                  <span className="text-blue-700 ml-3 whitespace-nowrap">
                    max {mat.maxVelocity} m/s
                  </span>
                </div>
              ))}
              <p className="text-xs text-blue-600 mt-2 pt-2 border-t border-blue-200">
                Velocity limits: copper and polybutylene at 1.5 m/s (noise threshold);
                MLCP at 1.2 m/s; PEX at 1.0 m/s (erosion limit).
                Warnings are shown when a section exceeds the limit for its chosen material.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* When editing an existing section, show only the editor (full swap for focus) */}
      {showSectionEditor && editingSectionIndex !== null ? (
        <PipeSectionEditor
          section={editingSection}
          project={project}
          rooms={project.rooms || []}
          onSave={handleSaveSection}
          onCancel={handleCancelSection}
        />
      ) : (
        <>
          {/* Add Section Button and Export PDF Button */}
          <div className="flex gap-4">
            <button
              onClick={handleAddSection}
              disabled={showSectionEditor}
              className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Pipe Section
            </button>
            
            {sections.length > 0 && !showSectionEditor && (
              <button
                onClick={handleExportPDF}
                disabled={isExportingPDF}
                className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 font-semibold transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isExportingPDF ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating PDF...
                  </>
                ) : (
                  <>
                    📄 Export Installation Report
                  </>
                )}
              </button>
            )}
          </div>

          {/* Sections List */}
          {sections.length > 0 ? (
            <div className="space-y-4">
              {sections.map((section, index) => {
                // Derive velocity status live from current PIPE_MATERIALS so that
                // changes to maxVelocity limits (e.g. PB 1.0→1.5) are reflected
                // immediately without requiring a re-save of each section.
                let materialKey = section.material;
                if (materialKey === 'mlcp_riifo' || materialKey === 'mlcp_maincor') materialKey = 'mlcp';
                const currentMaxVelocity = PIPE_MATERIALS[materialKey]?.maxVelocity ?? section.maxVelocity;
                const currentIsVelocityOK = section.velocity !== undefined
                  ? section.velocity <= currentMaxVelocity
                  : section.isVelocityOK;
                return (
                <div
                  key={index}
                  className="border-2 rounded-lg p-5 bg-white border-gray-300"
                >
                  {/* Section Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">
                        {section.name || `Section ${index + 1}`}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {section.useWholeProperty 
                          ? `Main header - Full system load (${project.heatPumpRatedOutput || 0} kW)`
                          : `Branch - ${section.connectedRooms?.length || 0} rooms (${section.heatLoad?.toFixed(2) || 0} kW)`
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Index circuit checkbox */}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm text-gray-600 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={!!section.includeInIndexCircuit}
                          onChange={() => toggleIndexCircuitInclusion(index)}
                          className="w-3.5 h-3.5 accent-yellow-500"
                        />
                        Index circuit
                      </label>
                      <button
                        onClick={() => handleEditSection(section, index)}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteSection(index)}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Section Details */}
                  <div className="grid grid-cols-6 gap-4 bg-gray-50 rounded p-4">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Material</div>
                      <div className="font-semibold text-gray-800">{section.material}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Diameter</div>
                      <div className="font-semibold text-gray-800">{section.diameter}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Length</div>
                      <div className="font-semibold text-gray-800">{section.length} m</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Flow Rate</div>
                      <div className="font-semibold text-blue-700">{section.flowRate?.toFixed(3) || 0} l/s</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Velocity</div>
                      <div className={`font-semibold ${
                        currentIsVelocityOK ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {section.velocity?.toFixed(2) || 0} m/s
                        {!currentIsVelocityOK && ' ⚠'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Pressure Drop</div>
                      <div className="font-bold text-orange-700">{section.pressureDrop?.toFixed(2) || 0} kPa</div>
                    </div>
                  </div>

                  {/* Velocity Warning */}
                  {currentIsVelocityOK === false && (
                    <div className="mt-3 bg-red-50 border border-red-300 rounded p-2 text-sm text-red-800">
                      <strong>⚠ Warning:</strong> Velocity ({section.velocity?.toFixed(2)} m/s) exceeds maximum ({currentMaxVelocity} m/s). 
                      Consider using a larger pipe diameter.
                    </div>
                  )}

                  {/* Connected Rooms */}
                  {section.connectedRooms && section.connectedRooms.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-gray-600 mb-1">Feeds:</div>
                      <div className="flex flex-wrap gap-2">
                        {section.connectedRooms.map((roomId) => {
                          const room = (project.rooms || []).find(r => r.id === roomId);
                          return room ? (
                            <span key={roomId} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {room.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
              <p className="text-gray-500 text-lg">No pipe sections created yet</p>
              <p className="text-gray-400 text-sm mt-2">Click "Add Pipe Section" to get started</p>
            </div>
          )}

          {/* New section editor — sits between sections list and index circuit */}
          {showSectionEditor && editingSectionIndex === null && (
            <PipeSectionEditor
              section={null}
              project={project}
              rooms={project.rooms || []}
              onSave={handleSaveSection}
              onCancel={handleCancelSection}
            />
          )}

          {/* Index Circuit Summary */}
          {indexCircuit ? (
            <div className="border-2 border-yellow-500 rounded-lg p-6 bg-gradient-to-r from-yellow-50 to-orange-50">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                Index Circuit & Pump Requirements
              </h3>

              <div className="grid grid-cols-2 gap-6">
                {/* System Requirements */}
                <div>
                  <h4 className="font-semibold text-gray-700 mb-3">System Requirements:</h4>
                  <div className="space-y-3">
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="text-sm text-gray-600 mb-1">Index Circuit Path</div>
                      <div className="space-y-1 mt-1">
                        {indexCircuit.sections.map((s, i) => (
                          <div key={i} className="text-sm font-medium text-gray-800">
                            {s.name || `Section ${sections.indexOf(s) + 1}`}
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        {indexCircuit.sections.length} section{indexCircuit.sections.length !== 1 ? 's' : ''} · Total length: {indexCircuit.totalLength.toFixed(1)} m
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="text-sm text-gray-600 mb-1">Required Pump Head</div>
                      <div className="text-2xl font-bold text-orange-600">
                        {indexCircuit.totalPressureDrop.toFixed(2)} kPa
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        ({(indexCircuit.totalPressureDrop * 0.102).toFixed(2)} m head)
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="text-sm text-gray-600 mb-1">System Flow Rate</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {project.heatPumpRatedOutput 
                          ? ((project.heatPumpRatedOutput || 0) / (4.18 * ((project.designFlowTemp || 50) - (project.designReturnTemp || 40)))).toFixed(3)
                          : '0.000'
                        } l/s
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Based on {project.heatPumpRatedOutput || 0} kW heat pump
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pump Guidance */}
                <div>
                  <h4 className="font-semibold text-gray-700 mb-3">Pump Selection Guidance:</h4>
                  <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                    <ul className="text-sm text-blue-800 space-y-2">
                      <li>• Required head: <strong>{indexCircuit.totalPressureDrop.toFixed(2)} kPa</strong> ({(indexCircuit.totalPressureDrop * 0.102).toFixed(2)} m)</li>
                      <li>• Add 10-20% safety margin for fouling/expansion</li>
                      <li>• Consider variable speed pump for efficiency</li>
                      <li>• Check if heat pump's internal pump is sufficient</li>
                      <li>• Verify pump curve at operating point</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : sections.length > 0 ? (
            <div className="bg-gray-50 border-2 border-dashed border-yellow-200 rounded-lg p-6 text-center text-sm text-gray-500">
              Tick <strong>Index circuit</strong> on one or more sections above to calculate pump requirements.
            </div>
          ) : null}

          {/* ── System Volume ──────────────────────────────────────────── */}
          {(() => {
            const vol = calculateSystemVolume(project);
            const hasAnyVolume = vol.totalLitres > 0 ||
              (project.heatPumpInternalVolume ?? 0) > 0 ||
              (project.bufferVesselVolume ?? 0) > 0;
            return (
              <div className="bg-white border-2 border-blue-300 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-blue-900">System Volume</h3>
                  {vol.totalLitres > 0 && (
                    <button
                      onClick={() => setShowVolumeBreakdown(v => !v)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      {showVolumeBreakdown ? 'Hide breakdown' : 'Show breakdown'}
                    </button>
                  )}
                </div>

                {/* User inputs — heat pump and buffer */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Heat pump internal volume (L)
                    </label>
                    <input
                      type="number" step="0.1" min="0"
                      value={project.heatPumpInternalVolume ?? 0}
                      onChange={e => onUpdate('heatPumpInternalVolume', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">From heat pump datasheet</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Buffer vessel volume (L)
                    </label>
                    <input
                      type="number" step="1" min="0"
                      value={project.bufferVesselVolume ?? 0}
                      onChange={e => onUpdate('bufferVesselVolume', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">0 if no buffer vessel</p>
                  </div>
                </div>

                {/* Summary tiles */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Radiators</div>
                    <div className="text-xl font-bold text-blue-700">{vol.radiatorLitres.toFixed(1)} L</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Pipework</div>
                    <div className="text-xl font-bold text-purple-700">{vol.pipeworkLitres.toFixed(1)} L</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">UFH</div>
                    <div className="text-xl font-bold text-green-700">{vol.ufhLitres.toFixed(1)} L</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">HP + Buffer</div>
                    <div className="text-xl font-bold text-gray-700">
                      {(vol.heatPumpLitres + vol.bufferLitres).toFixed(1)} L
                    </div>
                  </div>
                </div>

                {/* Total */}
                <div className="bg-blue-600 text-white rounded-lg p-4 flex items-center justify-between">
                  <span className="font-bold text-lg">Total System Volume</span>
                  <span className="text-3xl font-bold">{vol.totalLitres.toFixed(1)} L</span>
                </div>

                {/* Modulation volume check — 20 L/kW */}
                {vol.requiredMinVolumeLitres > 0 && (
                  <div className={`rounded-lg p-4 border-2 ${
                    vol.effectiveVolumeLitres >= vol.requiredMinVolumeLitres
                      ? 'bg-green-50 border-green-500'
                      : 'bg-red-50 border-red-500'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm text-gray-800">
                        Minimum modulation volume check
                      </span>
                      <span className={`text-sm font-bold ${
                        vol.effectiveVolumeLitres >= vol.requiredMinVolumeLitres
                          ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {vol.effectiveVolumeLitres >= vol.requiredMinVolumeLitres ? '✓ Pass' : '✗ Fail'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Effective open volume</div>
                        <div className="font-bold text-gray-800">{vol.effectiveVolumeLitres.toFixed(1)} L</div>
                        <div className="text-xs text-gray-400">Pipes + HP + buffer + open emitters</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-0.5">Required minimum (20 L/kW)</div>
                        <div className="font-bold text-gray-800">{vol.requiredMinVolumeLitres.toFixed(1)} L</div>
                        <div className="text-xs text-gray-400">
                          {project.heatPumpMinModulation ?? 0} kW min modulation × 20
                        </div>
                      </div>
                    </div>
                    {vol.effectiveVolumeLitres < vol.requiredMinVolumeLitres && (
                      <p className="text-xs text-red-700 mt-2 border-t border-red-200 pt-2">
                        Shortfall of {(vol.requiredMinVolumeLitres - vol.effectiveVolumeLitres).toFixed(1)} L.
                        Consider adding a buffer vessel, marking more emitters as no-TRV,
                        or confirming that UFH zones do not have actuators.
                      </p>
                    )}
                    {vol.requiredMinVolumeLitres === 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Enter minimum modulation (kW) in the Heat Pump Specification to enable this check.
                      </p>
                    )}
                  </div>
                )}
                {vol.requiredMinVolumeLitres === 0 && vol.totalLitres > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-500">
                    <span className="font-semibold">Modulation volume check: </span>
                    Enter the heat pump minimum modulation (kW) in the Heat Pump Specification
                    on the Summary tab to enable the 20 L/kW check.
                  </div>
                )}

                {/* Expansion vessel guidance */}
                {vol.totalLitres > 0 && (
                  <div className="mt-1 bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                    <span className="font-semibold">Expansion vessel guidance: </span>
                    Minimum pre-charge vessel size ≈{' '}
                    <strong>{vol.expansionGuidanceLitres.toFixed(1)} L</strong>
                    {' '}(10% of system volume). Actual sizing depends on fill pressure,
                    maximum working pressure, and inhibitor/glycol concentration —
                    confirm at commissioning.
                  </div>
                )}

                {/* Detailed breakdown */}
                {showVolumeBreakdown && vol.totalLitres > 0 && (
                  <div className="mt-4 space-y-3">
                    {[
                      { title: 'Radiators',              items: vol.radiatorBreakdown },
                      { title: 'Pipework (flow + return)', items: vol.pipeworkBreakdown },
                      { title: 'UFH',                    items: vol.ufhBreakdown },
                    ].filter(g => g.items.length > 0).map(({ title, items }) => (
                      <div key={title}>
                        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                          {title}
                        </div>
                        <div className="space-y-1">
                          {items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                              <span className="flex items-center gap-1.5">
                                {item.name}
                                {'noTrv' in item && (
                                  <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                                    item.noTrv ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                                  }`}>
                                    {item.noTrv ? 'Open' : 'TRV'}
                                  </span>
                                )}
                                {'hasActuator' in item && (
                                  <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                                    !item.hasActuator ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                                  }`}>
                                    {item.hasActuator ? 'Actuated' : 'Open'}
                                  </span>
                                )}
                              </span>
                              <span className="font-semibold ml-4 whitespace-nowrap">{item.litres.toFixed(2)} L</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {(vol.heatPumpLitres > 0 || vol.bufferLitres > 0) && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                          Equipment
                        </div>
                        <div className="space-y-1">
                          {vol.heatPumpLitres > 0 && (
                            <div className="flex justify-between text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                              <span>Heat pump internal volume</span>
                              <span className="font-semibold">{vol.heatPumpLitres.toFixed(2)} L</span>
                            </div>
                          )}
                          {vol.bufferLitres > 0 && (
                            <div className="flex justify-between text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                              <span>Buffer vessel</span>
                              <span className="font-semibold">{vol.bufferLitres.toFixed(2)} L</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!hasAnyVolume && (
                  <p className="text-sm text-gray-500 italic mt-2">
                    Add pipe sections and ensure radiator specs include water content
                    to calculate system volume.
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── Radiator Flow Rates ────────────────────────────────────── */}
          {(() => {
            const flow = project.designFlowTemp  || 50;
            const ret  = project.designReturnTemp || 40;
            const dT   = flow - ret;

            // Replicate RadiatorSizing output calculation inline
            // outputAtDesign = effDt50 × (MWAT/50)^1.3
            // MWAT = ((flow + ret) / 2) - roomTemp
            const rows = [];
            for (const room of (project.rooms || [])) {
              const mwat = ((flow + ret) / 2) - (room.internalTemp || 21);
              for (const item of (room.radiatorSchedule || [])) {
                if (item.emitter_status === 'existing_replace') continue;
                const spec = (project.radiatorSpecs || []).find(s => s.id === item.radiator_spec_id);
                if (!spec) continue;
                const ef = item.enclosure_factor ?? 1.0;
                const ff = item.finish_factor    ?? 1.0;
                const qty = item.quantity || 1;
                const effDt50PerUnit = spec.output_dt50 * ef * ff;
                const outputPerUnit  = mwat > 0 ? effDt50PerUnit * Math.pow(mwat / 50, 1.3) : 0;
                const flowLs  = dT > 0 ? (outputPerUnit / 1000) / (4.18 * dT) : 0;
                rows.push({
                  room:         room.name,
                  spec:         `${spec.manufacturer} ${spec.model} ${spec.height}×${spec.length}mm`,
                  qty,
                  outputW:      Math.round(outputPerUnit),
                  outputTotalW: Math.round(outputPerUnit * qty),
                  flowLs,
                  flowLh:       flowLs * 3600,
                  status:       item.emitter_status || 'new',
                });
              }
            }

            if (rows.length === 0) return null;

            return (
              <div className="bg-white border-2 border-purple-300 rounded-lg p-5">
                <h3 className="text-lg font-bold text-purple-900 mb-1">Radiator Flow Rates</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Design flow rates at {flow}°C / {ret}°C ({dT}K ΔT).
                  Use these with your valve manufacturer's charts to determine
                  PITRV or flow regulating valve pre-settings.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-purple-700 text-white">
                        <th className="text-left px-3 py-2">Room</th>
                        <th className="text-left px-3 py-2">Radiator</th>
                        <th className="text-center px-3 py-2">Qty</th>
                        <th className="text-right px-3 py-2">Output/unit (W)</th>
                        <th className="text-right px-3 py-2">Flow/unit (l/h)</th>
                        <th className="text-right px-3 py-2">Room total (W)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-purple-50'}>
                          <td className="px-3 py-2 font-medium text-gray-800">{r.room}</td>
                          <td className="px-3 py-2 text-gray-600">{r.spec}</td>
                          <td className="px-3 py-2 text-center text-gray-600">{r.qty}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{r.outputW}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-purple-700">{r.flowLh.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-800">{r.outputTotalW}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-purple-300 bg-purple-50 font-bold">
                        <td className="px-3 py-2" colSpan={3}>TOTAL</td>
                        <td className="px-3 py-2 text-right text-gray-500 text-xs font-normal">per unit</td>
                        <td className="px-3 py-2 text-right text-gray-500 text-xs font-normal">per unit</td>
                        <td className="px-3 py-2 text-right text-gray-800">
                          {rows.reduce((s, r) => s + r.outputTotalW, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <p className="text-xs text-gray-400 mt-3">
                  Replaced radiators excluded. Flow rates are at design conditions —
                  actual commissioning flow may differ if weather compensation or
                  setback is active. For UFH, commission on ΔT rather than flow rate.
                </p>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
