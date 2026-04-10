// client/src/components/pipesizing/CircuitEditor.jsx
import { useState } from 'react';
import { calculateFlowRate } from '../../utils/pipeMaterialData';
import { calculateRoomHeatLoss } from '../../utils/heatLossCalculations';
import PipeSectionEditor from './PipeSectionEditor';

export default function CircuitEditor({ circuit, rooms, project, onSave, onCancel }) {
  const [editedCircuit, setEditedCircuit] = useState(circuit);
  const [editingSection, setEditingSection] = useState(null);
  const [editingSectionIndex, setEditingSectionIndex] = useState(null);
  const [showSectionEditor, setShowSectionEditor] = useState(false);
  const [useWholeProperty, setUseWholeProperty] = useState(circuit.useWholeProperty || false);

  const handleChange = (field, value) => {
    setEditedCircuit(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRoomToggle = (roomId) => {
    const connectedRooms = editedCircuit.connectedRooms || [];
    const newRooms = connectedRooms.includes(roomId)
      ? connectedRooms.filter(id => id !== roomId)
      : [...connectedRooms, roomId];
    
    // Calculate total heat load from connected rooms using proper heat loss calculation
    const totalHeatLoad = newRooms.reduce((sum, id) => {
      const room = rooms.find(r => r.id === id);
      if (!room) return sum;
      return sum + calculateRoomHeatLoss(room, project);
    }, 0);
    
    // Calculate flow rate based on heat load
    const flowRate = calculateFlowRate(totalHeatLoad, editedCircuit.designDeltaT || 10);
    
    setEditedCircuit(prev => ({
      ...prev,
      connectedRooms: newRooms,
      heatLoad: totalHeatLoad,
      flowRate: flowRate,
      useWholeProperty: false
    }));
    setUseWholeProperty(false);
  };

  const handleWholePropertyToggle = (checked, project) => {
    setUseWholeProperty(checked);
    
    if (checked) {
      // Use heat pump rated output as the load
      const heatLoad = project.heatPumpRatedOutput || 0;
      const flowRate = calculateFlowRate(heatLoad, editedCircuit.designDeltaT || 10);
      
      setEditedCircuit(prev => ({
        ...prev,
        connectedRooms: [],
        heatLoad: heatLoad,
        flowRate: flowRate,
        useWholeProperty: true
      }));
    } else {
      // Reset to no rooms selected
      setEditedCircuit(prev => ({
        ...prev,
        connectedRooms: [],
        heatLoad: 0,
        flowRate: 0,
        useWholeProperty: false
      }));
    }
  };

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

  const handleSaveSection = (section) => {
    let updatedSections;
    
    if (editingSectionIndex !== null) {
      // Update existing section
      updatedSections = [...(editedCircuit.sections || [])];
      updatedSections[editingSectionIndex] = section;
    } else {
      // Add new section
      updatedSections = [...(editedCircuit.sections || []), section];
    }

    // Calculate total pressure drop
    const totalPressureDrop = updatedSections.reduce((sum, s) => sum + (s.pressureDrop || 0), 0);

    setEditedCircuit(prev => ({
      ...prev,
      sections: updatedSections,
      totalPressureDrop: totalPressureDrop
    }));

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
      const updatedSections = editedCircuit.sections.filter((_, i) => i !== index);
      const totalPressureDrop = updatedSections.reduce((sum, s) => sum + (s.pressureDrop || 0), 0);
      
      setEditedCircuit(prev => ({
        ...prev,
        sections: updatedSections,
        totalPressureDrop: totalPressureDrop
      }));
    }
  };

  const handleSave = () => {
    onSave(editedCircuit);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">
          {circuit.id ? 'Edit Circuit' : 'New Circuit'}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Save Circuit
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <div className="bg-white border-2 border-gray-300 rounded-lg p-4">
        <h4 className="font-semibold text-lg mb-4">Circuit Information</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Circuit Name</label>
            <input
              type="text"
              value={editedCircuit.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="e.g. Ground Floor Radiators"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Circuit Type</label>
            <select
              value={editedCircuit.circuitType || 'room'}
              onChange={(e) => handleChange('circuitType', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="heat_source">Heat Source to Diverter</option>
              <option value="room">Room Circuit</option>
              <option value="ufh">UFH Manifold</option>
              <option value="custom">Custom Circuit</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Design ΔT (°C)</label>
            <input
              type="number"
              value={editedCircuit.designDeltaT || 10}
              onChange={(e) => handleChange('designDeltaT', parseFloat(e.target.value) || 10)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Room Selection */}
      <div className="bg-white border-2 border-gray-300 rounded-lg p-4">
        <h4 className="font-semibold text-lg mb-4">Heat Load Selection</h4>
        
        {/* Whole Property Option */}
        {project.heatPumpRatedOutput > 0 && (
          <div className="mb-4 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-400 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useWholeProperty}
                onChange={(e) => handleWholePropertyToggle(e.target.checked, project)}
                className="w-5 h-5 mt-1"
              />
              <div className="flex-1">
                <div className="font-bold text-purple-900">Use Whole Property Load (Heat Pump Output)</div>
                <div className="text-sm text-purple-800 mt-1">
                  For main header pipe from heat pump to distribution point. Uses heat pump rated output 
                  ({project.heatPumpRatedOutput} kW) including space heating and DHW.
                </div>
                {useWholeProperty && (
                  <div className="mt-2 bg-purple-100 rounded p-2 text-sm text-purple-900">
                    <strong>Active:</strong> Circuit will be sized for full heat pump output. 
                    Individual room selection is disabled.
                  </div>
                )}
              </div>
            </label>
          </div>
        )}

        {!useWholeProperty ? (
          rooms && rooms.length > 0 ? (
            <>
              <div className="text-sm text-gray-600 mb-3">
                Select individual rooms for this circuit (e.g., ground floor zone, first floor zone)
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
              {rooms.map(room => {
                const roomHeatLoss = calculateRoomHeatLoss(room, project);
                
                return (
                  <label
                    key={room.id}
                    className="flex items-center gap-2 p-3 border rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={(editedCircuit.connectedRooms || []).includes(room.id)}
                      onChange={() => handleRoomToggle(room.id)}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-semibold">{room.name}</div>
                      <div className="text-sm text-gray-600">
                        {roomHeatLoss > 0 ? `${roomHeatLoss.toFixed(2)} kW` : 'No heat loss calculated'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="bg-blue-50 border border-blue-300 rounded p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-sm text-gray-600">Rooms Selected</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {(editedCircuit.connectedRooms || []).length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Total Heat Load</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {editedCircuit.heatLoad ? editedCircuit.heatLoad.toFixed(2) : '0.00'} kW
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Flow Rate Required</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {editedCircuit.flowRate ? editedCircuit.flowRate.toFixed(3) : '0.000'} l/s
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
          <div className="bg-purple-50 border border-purple-300 rounded p-4 text-center">
            <p className="text-purple-800 font-semibold">
              ✓ Using whole property load: {project.heatPumpRatedOutput} kW
            </p>
            <p className="text-sm text-purple-700 mt-1">
              Uncheck "Use Whole Property Load" above to select individual rooms
            </p>
          </div>
        )}
      </div>

      {/* Pipe Sections */}
      <div className="bg-white border-2 border-gray-300 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-semibold text-lg">Pipe Sections</h4>
          {!showSectionEditor && (
            <button
              onClick={handleAddSection}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              + Add Pipe Section
            </button>
          )}
        </div>

        {/* Section Editor */}
        {showSectionEditor && (
          <PipeSectionEditor
            section={editingSection}
            flowRate={editedCircuit.flowRate || 0}
            onSave={handleSaveSection}
            onCancel={handleCancelSection}
          />
        )}

        {/* Sections List */}
        {!showSectionEditor && (
          <>
            {editedCircuit.sections && editedCircuit.sections.length > 0 ? (
              <div className="space-y-3">
                {editedCircuit.sections.map((section, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 bg-gray-50"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h5 className="font-semibold text-gray-800">
                          {section.name || `Section ${index + 1}`}
                        </h5>
                        <div className="text-sm text-gray-600 mt-1">
                          {section.material} • {section.diameter} • {section.length}m
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditSection(section, index)}
                          className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteSection(index)}
                          className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">Velocity</div>
                        <div className={`font-semibold ${
                          section.isVelocityOK ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {section.velocity ? section.velocity.toFixed(2) : '0.00'} m/s
                          {!section.isVelocityOK && ' ⚠'}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-600">Straight Pipe ΔP</div>
                        <div className="font-semibold text-gray-800">
                          {section.straightPipePressureDrop ? section.straightPipePressureDrop.toFixed(2) : '0.00'} kPa
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-600">Fittings ΔP</div>
                        <div className="font-semibold text-gray-800">
                          {section.fittingsPressureDrop ? section.fittingsPressureDrop.toFixed(2) : '0.00'} kPa
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-600">Total ΔP</div>
                        <div className="font-bold text-blue-700">
                          {section.pressureDrop ? section.pressureDrop.toFixed(2) : '0.00'} kPa
                        </div>
                      </div>
                    </div>

                    {!section.isVelocityOK && (
                      <div className="mt-3 bg-red-50 border border-red-300 rounded p-2 text-sm text-red-800">
                        <strong>⚠ Warning:</strong> Velocity exceeds maximum ({section.maxVelocity} m/s). 
                        Consider using a larger pipe diameter.
                      </div>
                    )}
                  </div>
                ))}

                {/* Total Pressure Drop Summary */}
                <div className="bg-blue-100 border-2 border-blue-500 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">Total Circuit Pressure Drop:</span>
                    <span className="text-3xl font-bold text-blue-700">
                      {editedCircuit.totalPressureDrop ? editedCircuit.totalPressureDrop.toFixed(2) : '0.00'} kPa
                    </span>
                  </div>
                  <div className="text-sm text-blue-800 mt-2">
                    ({(editedCircuit.totalPressureDrop * 0.102).toFixed(2)} m head)
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No pipe sections added yet.</p>
                <p className="text-sm mt-1">Click "Add Pipe Section" to start designing the circuit.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Save/Cancel Buttons */}
      {!showSectionEditor && (
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="bg-gray-500 text-white px-6 py-3 rounded hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 font-semibold"
          >
            Save Circuit
          </button>
        </div>
      )}
    </div>
  );
}
