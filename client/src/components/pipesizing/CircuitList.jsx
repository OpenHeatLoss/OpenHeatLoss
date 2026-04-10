// client/src/components/pipesizing/CircuitList.jsx

export default function CircuitList({ circuits, rooms, onEdit, onDelete }) {
  
  const getRoomName = (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    return room ? room.name : 'Unknown Room';
  };

  const getCircuitTypeLabel = (type) => {
    const labels = {
      'heat_source': 'Heat Source to Diverter',
      'room': 'Room Circuit',
      'ufh': 'UFH Manifold',
      'custom': 'Custom Circuit'
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-4">
      {circuits.map((circuit) => (
        <div
          key={circuit.id}
          className={`border-2 rounded-lg p-5 ${
            circuit.isIndexCircuit 
              ? 'bg-yellow-50 border-yellow-500' 
              : 'bg-white border-gray-300'
          }`}
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-800">{circuit.name}</h3>
                {circuit.isIndexCircuit && (
                  <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded">
                    INDEX CIRCUIT
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">{getCircuitTypeLabel(circuit.circuitType)}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onEdit(circuit)}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(circuit.id)}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Circuit Stats */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 rounded p-3">
              <div className="text-xs text-gray-600 mb-1">Heat Load</div>
              <div className="text-xl font-bold text-gray-800">{circuit.heatLoad.toFixed(2)} kW</div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <div className="text-xs text-gray-600 mb-1">Flow Rate</div>
              <div className="text-xl font-bold text-gray-800">{circuit.flowRate.toFixed(3)} l/s</div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <div className="text-xs text-gray-600 mb-1">ΔT Design</div>
              <div className="text-xl font-bold text-gray-800">{circuit.designDeltaT}°C</div>
            </div>
            <div className={`rounded p-3 ${circuit.isIndexCircuit ? 'bg-yellow-100' : 'bg-gray-50'}`}>
              <div className="text-xs text-gray-600 mb-1">Pressure Drop</div>
              <div className={`text-xl font-bold ${circuit.isIndexCircuit ? 'text-yellow-800' : 'text-gray-800'}`}>
                {circuit.totalPressureDrop.toFixed(2)} kPa
              </div>
            </div>
          </div>

          {/* Connected Rooms */}
          {circuit.connectedRooms && circuit.connectedRooms.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-semibold text-gray-700 mb-2">Connected Rooms:</div>
              <div className="flex flex-wrap gap-2">
                {circuit.connectedRooms.map((roomId) => (
                  <span
                    key={roomId}
                    className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full"
                  >
                    {getRoomName(roomId)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Pipe Sections Summary */}
          {circuit.sections && circuit.sections.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Pipe Sections:</div>
              <div className="space-y-2">
                {circuit.sections.map((section, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-gray-50 rounded p-2 text-sm"
                  >
                    <div className="flex-1">
                      <span className="font-semibold">{section.name || `Section ${idx + 1}`}</span>
                      <span className="text-gray-600 ml-2">
                        {section.material} • {section.diameter} • {section.length}m
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-800 font-semibold">
                        {section.pressureDrop ? section.pressureDrop.toFixed(2) : '0.00'} kPa
                      </div>
                      <div className="text-xs text-gray-600">
                        v = {section.velocity ? section.velocity.toFixed(2) : '0.00'} m/s
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state for sections */}
          {(!circuit.sections || circuit.sections.length === 0) && (
            <div className="text-sm text-gray-500 italic">
              No pipe sections defined. Click Edit to add sections.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
