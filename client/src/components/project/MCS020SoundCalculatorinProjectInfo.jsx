// client/src/components/project/MCS020SoundCalculator.jsx
import { useState } from 'react';

export default function MCS020SoundCalculator({ project, onUpdate }) {
  const [showResults, setShowResults] = useState(false);
  
  // Initialize from saved data or create default position
  const [assessmentPositions, setAssessmentPositions] = useState(() => {
    if (project.mcsSoundAssessments && Array.isArray(project.mcsSoundAssessments)) {
      return project.mcsSoundAssessments;
    }
    return [
      {
        id: 1,
        date: new Date().toISOString().split('T')[0],
        description: '',
        soundPowerLevel: project.mcsHeatPumpSoundPower || 0,
        directivity: 'Q2',
        distance: 0,
        barrierType: 'none',
        lineOfSight: 'full',
        result: 0,
        passes: false
      }
    ];
  });

  // Directivity values
  const directivityValues = {
    'Q2': 2,  // 1 reflecting surface
    'Q4': 4,  // 2 reflecting surfaces
    'Q8': 8   // 3 reflecting surfaces
  };

  // Barrier attenuation matrix (in dB)
  const barrierAttenuation = {
    'type1': { 'no_view': -10, 'partial': -5, 'full': 0 },
    'type2': { 'no_view': -5, 'partial': -2.5, 'full': 0 },
    'none': { 'no_view': 0, 'partial': 0, 'full': 0 }
  };

  // Calculate sound pressure level at assessment position
  const calculateSoundPressure = (position) => {
    const Lw = parseFloat(position.soundPowerLevel) || 0;
    const Q = directivityValues[position.directivity] || 2;
    const r = parseFloat(position.distance) || 1;
    const Ab = barrierAttenuation[position.barrierType]?.[position.lineOfSight] || 0;

    if (r === 0 || Lw === 0) return 0;

    // Formula: Lp = Lw + 10*log10(Q / (4*π*r²)) - Ab
    const Lp = Lw + 10 * Math.log10(Q / (4 * Math.PI * Math.pow(r, 2))) - Ab;
    
    return Math.round(Lp * 10) / 10; // Round to 1 decimal place
  };

  const handleCalculate = () => {
    const updated = assessmentPositions.map(pos => {
      const result = calculateSoundPressure(pos);
      return {
        ...pos,
        result,
        passes: result <= 37.0
      };
    });
    setAssessmentPositions(updated);
    setShowResults(true);
    
    // Save to project
    onUpdate('mcsSoundAssessments', updated);
  };

  const handleExportPDF = async () => {
    try {
      // Prepare data for PDF
      const pdfData = {
        projectName: project.name || 'Untitled Project',
        location: project.location || '',
        designer: project.designer || '',
        customerTitle: project.customerTitle || '',
        customerFirstName: project.customerFirstName || '',
        customerSurname: project.customerSurname || '',
        customerAddress: project.customerAddress || '',
        customerPostcode: project.customerPostcode || '',
        soundPowerLevel: project.mcsHeatPumpSoundPower || 0,
        assessments: assessmentPositions,
        overallResult: allPositionsPass ? 'COMPLIES' : 'DOES NOT COMPLY'
      };

      // Call API to generate PDF
      const response = await fetch('/api/generate-pdf/sound', {
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
        a.download = `MCS_Sound_Assessment_${project.name || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`;
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

  const generatePDFContent = () => {
    // This generates the content structure for PDF export
    const content = {
      title: 'MCS 020 a) Sound Calculation Assessment',
      project: {
        name: project.name || 'Untitled Project',
        location: project.location || '',
        customer: `${project.customerTitle || ''} ${project.customerFirstName || ''} ${project.customerSurname || ''}`.trim(),
        address: project.customerAddress || '',
        postcode: project.customerPostcode || ''
      },
      heatPumpData: {
        soundPowerLevel: project.mcsHeatPumpSoundPower || 0
      },
      assessments: assessmentPositions,
      overallResult: allPositionsPass ? 'COMPLIES' : 'DOES NOT COMPLY',
      date: new Date().toLocaleDateString('en-GB')
    };
    
    return content;
  };

  const addAssessmentPosition = () => {
    setAssessmentPositions([
      ...assessmentPositions,
      {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        description: '',
        soundPowerLevel: project.mcsHeatPumpSoundPower || 0,
        directivity: 'Q2',
        distance: 0,
        barrierType: 'none',
        lineOfSight: 'full',
        result: 0,
        passes: false
      }
    ]);
  };

  const removeAssessmentPosition = (id) => {
    if (assessmentPositions.length > 1) {
      setAssessmentPositions(assessmentPositions.filter(pos => pos.id !== id));
    }
  };

  const updatePosition = (id, field, value) => {
    setAssessmentPositions(assessmentPositions.map(pos => 
      pos.id === id ? { ...pos, [field]: value } : pos
    ));
  };

  const allPositionsPass = assessmentPositions.every(pos => pos.passes);

  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">MCS 020 a) - Sound Calculation for Permitted Development</h3>
        <p className="text-sm text-blue-800">
          This calculation confirms whether the permitted development noise limit of <strong>37.0 dB LAeq,5mins</strong> would 
          be met at assessment positions (1m from doors/windows of neighbouring habitable rooms).
        </p>
      </div>

      {/* Heat Pump Sound Power Level */}
      <div>
        <h3 className="font-semibold text-lg mb-3">Heat Pump Sound Data</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">
              A-weighted Sound Power Level (dB(A))
            </label>
            <input
              type="number"
              step="0.1"
              value={project.mcsHeatPumpSoundPower || ''}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0;
                onUpdate('mcsHeatPumpSoundPower', value);
                // Update all assessment positions with new sound power
                setAssessmentPositions(assessmentPositions.map(pos => ({
                  ...pos,
                  soundPowerLevel: value
                })));
              }}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              From manufacturer's data (product fiche or MCS database). NOT low noise mode.
            </div>
          </div>
        </div>
      </div>

      {/* Assessment Positions */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-lg">Assessment Positions</h3>
          <button
            onClick={addAssessmentPosition}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm"
          >
            + Add Position
          </button>
        </div>

        <div className="space-y-4">
          {assessmentPositions.map((position, index) => (
            <div key={position.id} className="border-2 border-gray-300 rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-800">Assessment Position {index + 1}</h4>
                {assessmentPositions.length > 1 && (
                  <button
                    onClick={() => removeAssessmentPosition(position.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Date */}
                <div>
                  <label className="block text-sm font-semibold mb-1">Date of Assessment</label>
                  <input
                    type="date"
                    value={position.date}
                    onChange={(e) => updatePosition(position.id, 'date', e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold mb-1">Description</label>
                  <input
                    type="text"
                    value={position.description}
                    onChange={(e) => updatePosition(position.id, 'description', e.target.value)}
                    placeholder="e.g. 16 Willis Close, First floor, bedroom window"
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Directivity */}
                <div>
                  <label className="block text-sm font-semibold mb-1">Directivity (Reflecting Surfaces)</label>
                  <select
                    value={position.directivity}
                    onChange={(e) => updatePosition(position.id, 'directivity', e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Q2">Q2 - 1 reflecting surface (ground OR single wall)</option>
                    <option value="Q4">Q4 - 2 reflecting surfaces (ground + wall)</option>
                    <option value="Q8">Q8 - 3 reflecting surfaces (ground + 2 walls)</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">
                    Reflecting surface = any surface within 1m of heat pump
                  </div>
                </div>

                {/* Distance */}
                <div>
                  <label className="block text-sm font-semibold mb-1">Distance to Assessment Position (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={position.distance || ''}
                    onChange={(e) => updatePosition(position.id, 'distance', parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Straight line from center of heat pump to assessment position
                  </div>
                </div>

                {/* Barrier Type */}
                <div>
                  <label className="block text-sm font-semibold mb-1">Barrier Type</label>
                  <select
                    value={position.barrierType}
                    onChange={(e) => updatePosition(position.id, 'barrierType', e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="none">No Barrier</option>
                    <option value="type1">Type 1 - Solid brick/masonry wall or ≥18mm fence</option>
                    <option value="type2">Type 2 - Solid fence &lt;18mm thick</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">
                    Barrier must extend 1m+ horizontally from heat pump edges
                  </div>
                </div>

                {/* Line of Sight */}
                <div>
                  <label className="block text-sm font-semibold mb-1">Line of Sight</label>
                  <select
                    value={position.lineOfSight}
                    onChange={(e) => updatePosition(position.id, 'lineOfSight', e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="full">Full View - Assessment position visible from heat pump</option>
                    <option value="partial">Partial View - Visible within 0.25m movement</option>
                    <option value="no_view">No View - Completely obscured by barrier</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">
                    View from top edge of heat pump to assessment position
                  </div>
                </div>
              </div>

              {/* Show result if calculated */}
              {showResults && (
                <div className={`mt-4 p-3 rounded border-2 ${position.passes ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-semibold">Calculated Sound Pressure Level:</span>
                      <span className="text-2xl font-bold ml-2">{position.result.toFixed(1)} dB(A)</span>
                    </div>
                    <div className={`text-lg font-bold ${position.passes ? 'text-green-700' : 'text-red-700'}`}>
                      {position.passes ? '✓ PASS' : '✗ FAIL'}
                    </div>
                  </div>
                  <div className="text-sm mt-1 text-gray-600">
                    Permitted development limit: 37.0 dB(A)
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Calculate Button */}
      <div className="flex gap-3">
        <button
          onClick={handleCalculate}
          disabled={!project.mcsHeatPumpSoundPower || assessmentPositions.some(pos => !pos.distance)}
          className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition"
        >
          Calculate Sound Levels
        </button>
        
        {showResults && (
          <button
            onClick={handleExportPDF}
            className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 font-semibold transition"
          >
            Export Assessment to PDF
          </button>
        )}
      </div>

      {/* Overall Results */}
      {showResults && (
        <>
          <div className="bg-green-50 border border-green-500 rounded-lg p-3 text-center">
            <span className="text-green-800 font-semibold">✓ Assessment saved to project</span>
          </div>
          
          <div className={`border-2 rounded-lg p-6 ${allPositionsPass ? 'bg-green-50 border-green-600' : 'bg-red-50 border-red-600'}`}>
          <h3 className="text-xl font-bold mb-4 text-center">
            Overall Assessment Result
          </h3>
          
          <div className="text-center mb-4">
            <div className={`text-3xl font-bold ${allPositionsPass ? 'text-green-700' : 'text-red-700'}`}>
              {allPositionsPass ? '✓ COMPLIES WITH PERMITTED DEVELOPMENT' : '✗ DOES NOT COMPLY'}
            </div>
          </div>

          {allPositionsPass ? (
            <div className="text-center text-green-800">
              <p className="font-semibold">
                All assessment positions are at or below the 37.0 dB(A) limit.
              </p>
              <p className="text-sm mt-2">
                This heat pump installation may be considered permitted development (subject to compliance with 
                other permitted development limitations and conditions).
              </p>
            </div>
          ) : (
            <div className="text-center text-red-800">
              <p className="font-semibold">
                One or more assessment positions exceed the 37.0 dB(A) limit.
              </p>
              <p className="text-sm mt-2">
                This installation does not comply with permitted development noise limits. Consider:
              </p>
              <ul className="text-sm mt-2 text-left max-w-2xl mx-auto list-disc list-inside">
                <li>Relocating the heat pump further from neighbouring properties</li>
                <li>Installing acoustic barriers between the heat pump and assessment positions</li>
                <li>Selecting a quieter heat pump model with lower sound power level</li>
                <li>Applying for planning permission instead of relying on permitted development</li>
              </ul>
            </div>
          )}

          {/* Summary Table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-gray-400 p-2 text-left">Position</th>
                  <th className="border border-gray-400 p-2 text-left">Description</th>
                  <th className="border border-gray-400 p-2 text-center">Distance (m)</th>
                  <th className="border border-gray-400 p-2 text-center">Result dB(A)</th>
                  <th className="border border-gray-400 p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {assessmentPositions.map((pos, idx) => (
                  <tr key={pos.id} className={pos.passes ? 'bg-white' : 'bg-red-100'}>
                    <td className="border border-gray-400 p-2">{idx + 1}</td>
                    <td className="border border-gray-400 p-2">{pos.description || 'Not specified'}</td>
                    <td className="border border-gray-400 p-2 text-center">{pos.distance}</td>
                    <td className="border border-gray-400 p-2 text-center font-bold">{pos.result.toFixed(1)}</td>
                    <td className="border border-gray-400 p-2 text-center">
                      <span className={`font-semibold ${pos.passes ? 'text-green-700' : 'text-red-700'}`}>
                        {pos.passes ? '✓ PASS' : '✗ FAIL'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* Information Box */}
      <div className="border-2 border-gray-300 rounded-lg p-4 bg-gray-50">
        <h4 className="font-semibold mb-2">Important Notes:</h4>
        <ul className="text-sm space-y-1 list-disc list-inside text-gray-700">
          <li>Assessment positions are 1m from the center of doors/windows to habitable rooms of neighbouring properties</li>
          <li>Habitable rooms include bedrooms and living rooms, but NOT bathrooms, toilets, corridors, or utility rooms</li>
          <li>Multiple assessment positions should be checked including ground floor, first floor, etc.</li>
          <li>A reflecting surface is any surface within 1m of the heat pump extending 1m+ beyond the heat pump edge</li>
          <li>Heat pumps with more than 3 reflecting surfaces (e.g. in lightwells) will NOT meet MCS 020 a)</li>
          <li>Do NOT use "low noise mode" sound power levels for this calculation</li>
          <li>Retain completed calculations for your records and provide a copy to the customer</li>
        </ul>
      </div>
    </div>
  );
}
