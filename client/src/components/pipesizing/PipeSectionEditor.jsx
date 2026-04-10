// client/src/components/pipesizing/PipeSectionEditor.jsx
import { useState } from 'react';
import { PIPE_MATERIALS, calculatePressureDrop, getPipeSize, suggestPipeSize, calculateFlowRate } from '../../utils/pipeMaterialData';
import { FITTINGS_DATABASE, calculateFittingsPressureDrop, calculateFittingsAllowance, getAllFittingTypes } from '../../utils/fittingsDatabase';
import { calculateRoomTotal } from '../../utils/calculations';

export default function PipeSectionEditor({ section, project, rooms, onSave, onCancel }) {
  const [editedSection, setEditedSection] = useState(section || {
    name: '',
    useWholeProperty: false,
    connectedRooms: [],
    heatLoad: 0,
    flowRate: 0,
    material: 'copper_tableX',
    diameter: '22mm',
    length: 0,
    waterTemperature: 50,
    fittingsMethod: 'percentage',
    fittingPercentage: 20,
    fittings: [],
    velocity: 0,
    pressureDrop: 0,
    straightPipePressureDrop: 0,
    fittingsPressureDrop: 0
  });

  // Get design delta T from project
  const designDeltaT = (project.designFlowTemp || 50) - (project.designReturnTemp || 40);

  // Available pipe sizes for selected material
  const availableSizes = PIPE_MATERIALS[editedSection.material]?.sizes || [];

  const handleChange = (field, value) => {
    setEditedSection(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleWholePropertyToggle = (checked) => {
    if (checked) {
      // Use heat pump output
      const heatLoad = project.heatPumpRatedOutput || 0;
      const flowRate = calculateFlowRate(heatLoad, designDeltaT);
      
      setEditedSection(prev => ({
        ...prev,
        useWholeProperty: true,
        connectedRooms: [],
        heatLoad: heatLoad,
        flowRate: flowRate
      }));
    } else {
      // Reset to room selection
      setEditedSection(prev => ({
        ...prev,
        useWholeProperty: false,
        connectedRooms: [],
        heatLoad: 0,
        flowRate: 0
      }));
    }
  };

  const handleRoomToggle = (roomId) => {
    const connectedRooms = editedSection.connectedRooms || [];
    const newRooms = connectedRooms.includes(roomId)
      ? connectedRooms.filter(id => id !== roomId)
      : [...connectedRooms, roomId];
    
    // Calculate total heat load from connected rooms
    // calculateRoomTotal returns Watts — convert to kW for flow rate calculation
    const totalHeatLoad = newRooms.reduce((sum, id) => {
      const room = rooms.find(r => r.id === id);
      if (!room) return sum;
      return sum + (calculateRoomTotal(room, project) / 1000);
    }, 0);
    
    // Calculate flow rate based on heat load
    const flowRate = calculateFlowRate(totalHeatLoad, designDeltaT);
    
    setEditedSection(prev => ({
      ...prev,
      connectedRooms: newRooms,
      heatLoad: totalHeatLoad,
      flowRate: flowRate,
      useWholeProperty: false
    }));
  };

  const handleMaterialChange = (material) => {
    const suggestion = suggestPipeSize(editedSection.flowRate, material);
    setEditedSection(prev => ({
      ...prev,
      material: material,
      diameter: suggestion.size
    }));
  };

  const handleAddFitting = () => {
    const newFitting = {
      type: 'elbow_90',
      quantity: 1
    };
    setEditedSection(prev => ({
      ...prev,
      fittings: [...(prev.fittings || []), newFitting]
    }));
  };

  const handleUpdateFitting = (index, field, value) => {
    const updatedFittings = [...editedSection.fittings];
    updatedFittings[index] = {
      ...updatedFittings[index],
      [field]: field === 'quantity' ? parseInt(value) || 0 : value
    };
    setEditedSection(prev => ({
      ...prev,
      fittings: updatedFittings
    }));
  };

  const handleDeleteFitting = (index) => {
    setEditedSection(prev => ({
      ...prev,
      fittings: prev.fittings.filter((_, i) => i !== index)
    }));
  };

  const calculateAndSave = () => {
    // Validate
    if (!editedSection.length || editedSection.length <= 0) {
      alert('Please enter a pipe length');
      return;
    }
    
    if (!editedSection.useWholeProperty && (!editedSection.connectedRooms || editedSection.connectedRooms.length === 0)) {
      alert('Please select either "Use full heat pump output" or choose rooms to feed');
      return;
    }

    // Get pipe size details
    const pipeSize = getPipeSize(editedSection.diameter, editedSection.material);
    if (!pipeSize) {
      alert('Invalid pipe size selected');
      return;
    }

    // Calculate straight pipe pressure drop
    const straightResult = calculatePressureDrop(
      editedSection.flowRate,
      pipeSize.internalDiameter,
      editedSection.length,
      editedSection.material,
      editedSection.waterTemperature || 50 // Use selected temperature
    );

    let fittingsPressureDrop = 0;

    if (editedSection.fittingsMethod === 'percentage') {
      fittingsPressureDrop = calculateFittingsAllowance(
        straightResult.pressureDrop,
        editedSection.fittingPercentage
      );
    } else {
      fittingsPressureDrop = calculateFittingsPressureDrop(
        straightResult.velocity,
        editedSection.fittings || []
      );
    }

    const totalPressureDrop = straightResult.pressureDrop + fittingsPressureDrop;

    onSave({
      ...editedSection,
      velocity: straightResult.velocity,
      straightPipePressureDrop: straightResult.pressureDrop,
      fittingsPressureDrop: fittingsPressureDrop,
      pressureDrop: totalPressureDrop,
      isVelocityOK: straightResult.isVelocityOK,
      maxVelocity: straightResult.maxVelocity
    });
  };

  const suggestion = suggestPipeSize(editedSection.flowRate, editedSection.material);

  return (
    <div className="border-2 border-blue-500 rounded-lg p-6 bg-blue-50 space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-xl text-gray-800">
          {section ? 'Edit Pipe Section' : 'Add Pipe Section'}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={calculateAndSave}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-semibold"
          >
            Save Section
          </button>
        </div>
      </div>

      {/* Section Name */}
      <div className="bg-white rounded-lg p-4">
        <label className="block text-sm font-semibold mb-2">Section Name</label>
        <input
          type="text"
          value={editedSection.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g. Main header from heat pump, Branch to ground floor"
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>

      {/* Load Selection */}
      <div className="bg-white rounded-lg p-4">
        <h4 className="font-semibold text-lg mb-4">Heat Load Selection</h4>
        
        {/* Whole Property Option */}
        {project.heatPumpRatedOutput > 0 && (
          <div className="mb-4 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-400 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editedSection.useWholeProperty}
                onChange={(e) => handleWholePropertyToggle(e.target.checked)}
                className="w-5 h-5 mt-1"
              />
              <div className="flex-1">
                <div className="font-bold text-purple-900">Use Full Heat Pump Output</div>
                <div className="text-sm text-purple-800 mt-1">
                  For main header pipe. Uses heat pump rated output ({project.heatPumpRatedOutput} kW).
                </div>
                {editedSection.useWholeProperty && (
                  <div className="mt-2 bg-purple-100 rounded p-2 text-sm text-purple-900">
                    <strong>Active:</strong> Section sized for {project.heatPumpRatedOutput} kW ({editedSection.flowRate?.toFixed(3)} l/s)
                  </div>
                )}
              </div>
            </label>
          </div>
        )}

        {/* Room Selection */}
        {!editedSection.useWholeProperty ? (
          rooms && rooms.length > 0 ? (
            <>
              <div className="text-sm text-gray-600 mb-3">
                Select rooms/radiators fed by this pipe section:
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4 max-h-64 overflow-y-auto">
                {rooms.map(room => {
                  // calculateRoomTotal returns W — display in kW
                  const roomHeatLoss = calculateRoomTotal(room, project) / 1000;
                  
                  return (
                    <label
                      key={room.id}
                      className="flex items-center gap-2 p-3 border rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={(editedSection.connectedRooms || []).includes(room.id)}
                        onChange={() => handleRoomToggle(room.id)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="font-semibold">{room.name}</div>
                        <div className="text-sm text-gray-600">
                          {roomHeatLoss > 0 ? `${roomHeatLoss.toFixed(2)} kW` : 'No heat loss'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="bg-blue-50 border border-blue-300 rounded p-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-600">Rooms Selected</div>
                    <div className="text-2xl font-bold text-blue-700">
                      {(editedSection.connectedRooms || []).length}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Total Heat Load</div>
                    <div className="text-2xl font-bold text-blue-700">
                      {editedSection.heatLoad ? editedSection.heatLoad.toFixed(2) : '0.00'} kW
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Design ΔT</div>
                    <div className="text-2xl font-bold text-purple-700">
                      {designDeltaT.toFixed(1)}°C
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {project.designFlowTemp || 50}°C → {project.designReturnTemp || 40}°C
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Flow Rate Required</div>
                    <div className="text-2xl font-bold text-blue-700">
                      {editedSection.flowRate ? editedSection.flowRate.toFixed(3) : '0.000'} l/s
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No rooms available. Create rooms in the "Rooms" tab first.</p>
            </div>
          )
        ) : (
          <div className="bg-purple-50 border border-purple-300 rounded p-4">
            <p className="text-purple-800 font-semibold text-center mb-3">
              ✓ Using full heat pump output: {project.heatPumpRatedOutput} kW
            </p>
            <div className="grid grid-cols-3 gap-4 text-center mb-2">
              <div>
                <div className="text-sm text-gray-600">Design ΔT</div>
                <div className="text-xl font-bold text-purple-700">
                  {designDeltaT.toFixed(1)}°C
                </div>
                <div className="text-xs text-gray-600">
                  {project.designFlowTemp || 50}°C → {project.designReturnTemp || 40}°C
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Flow Rate Required</div>
                <div className="text-xl font-bold text-purple-700">
                  {editedSection.flowRate ? editedSection.flowRate.toFixed(3) : '0.000'} l/s
                </div>
                <div className="text-xs text-gray-600">
                  {editedSection.flowRate ? (editedSection.flowRate * 3600).toFixed(0) : '0'} l/h
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Heat Load</div>
                <div className="text-xl font-bold text-purple-700">
                  {editedSection.heatLoad ? editedSection.heatLoad.toFixed(2) : '0.00'} kW
                </div>
              </div>
            </div>
            <p className="text-sm text-purple-700 text-center">
              Uncheck "Use Full Heat Pump Output" above to select individual rooms
            </p>
          </div>
        )}
      </div>

      {/* Pipe Specification */}
      <div className="bg-white rounded-lg p-4">
        <h4 className="font-semibold text-lg mb-4">Pipe Specification</h4>
        
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Pipe Material</label>
            <select
              value={editedSection.material}
              onChange={(e) => handleMaterialChange(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              {Object.keys(PIPE_MATERIALS).map(key => (
                <option key={key} value={key}>
                  {PIPE_MATERIALS[key].name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Diameter</label>
            <select
              value={editedSection.diameter}
              onChange={(e) => handleChange('diameter', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              {availableSizes.map(size => (
                <option key={size.nominalSize} value={size.nominalSize}>
                  {size.nominalSize}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Length (m)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={editedSection.length || ''}
              onChange={(e) => handleChange('length', parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Water Temp (°C)</label>
            <select
              value={editedSection.waterTemperature || 50}
              onChange={(e) => handleChange('waterTemperature', parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="10">10°C</option>
              <option value="20">20°C</option>
              <option value="35">35°C (Low temp)</option>
              <option value="40">40°C</option>
              <option value="50">50°C (Standard)</option>
              <option value="60">60°C</option>
              <option value="70">70°C (High temp)</option>
              <option value="80">80°C</option>
            </select>
          </div>
        </div>

        {/* Pipe Size Suggestion */}
        {editedSection.flowRate > 0 && (
          <div className={`rounded p-3 text-sm ${
            suggestion.isAcceptable ? 'bg-green-50 border border-green-300' : 'bg-red-50 border border-red-300'
          }`}>
            <div className="font-semibold mb-1">
              {suggestion.isAcceptable ? '✓ Suggested Size' : '⚠ Warning'}
            </div>
            <div className={suggestion.isAcceptable ? 'text-green-800' : 'text-red-800'}>
              For flow rate of {editedSection.flowRate.toFixed(3)} l/s, suggested minimum size: <strong>{suggestion.size}</strong>
              {!suggestion.isAcceptable && (
                <div className="mt-1">⚠ {suggestion.warning}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fittings */}
      <div className="bg-white rounded-lg p-4">
        <h4 className="font-semibold text-lg mb-4">Fittings & Pressure Loss Allowance</h4>
        
        <div className="flex gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="fittingsMethod"
              value="percentage"
              checked={editedSection.fittingsMethod === 'percentage'}
              onChange={(e) => handleChange('fittingsMethod', e.target.value)}
              className="w-4 h-4"
            />
            <span>Percentage Allowance (Simple)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="fittingsMethod"
              value="detailed"
              checked={editedSection.fittingsMethod === 'detailed'}
              onChange={(e) => handleChange('fittingsMethod', e.target.value)}
              className="w-4 h-4"
            />
            <span>Detailed Fittings List (Accurate)</span>
          </label>
        </div>

        {editedSection.fittingsMethod === 'percentage' ? (
          <div>
            <label className="block text-sm font-semibold mb-1">
              Fittings Allowance (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="5"
              value={editedSection.fittingPercentage || 20}
              onChange={(e) => handleChange('fittingPercentage', parseFloat(e.target.value) || 0)}
              className="w-32 border border-gray-300 rounded px-3 py-2"
            />
            <div className="text-xs text-gray-600 mt-1">
              Typical: 10-20% for simple runs, 20-30% for complex layouts
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold">Fittings List</label>
              <button
                onClick={handleAddFitting}
                className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm"
              >
                + Add Fitting
              </button>
            </div>

            {editedSection.fittings && editedSection.fittings.length > 0 ? (
              <div className="space-y-2">
                {editedSection.fittings.map((fitting, index) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                    <select
                      value={fitting.type}
                      onChange={(e) => handleUpdateFitting(index, 'type', e.target.value)}
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      {getAllFittingTypes().map(type => (
                        <option key={type.id} value={type.id}>
                          {type.name} (K={type.kValue})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={fitting.quantity}
                      onChange={(e) => handleUpdateFitting(index, 'quantity', e.target.value)}
                      className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                      placeholder="Qty"
                    />
                    <button
                      onClick={() => handleDeleteFitting(index)}
                      className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-2">
                No fittings added. Click "Add Fitting" to add.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
