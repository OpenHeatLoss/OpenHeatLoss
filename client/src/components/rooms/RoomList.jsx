// client/src/components/rooms/RoomList.jsx
import { useState, useEffect, useRef } from 'react';
import { PlusIcon, ChevronDownIcon, ChevronUpIcon } from '../common/Icons';
import RoomEditor from './RoomEditor';
import { calculateTransmissionLoss, calculateVentilationLoss } from '../../utils/calculations';

export default function RoomList({ 
  rooms, 
  project,
  onAddRoom, 
  onUpdateRoom, 
  onDeleteRoom,
  onAddElement,
  onUpdateElement,
  onUpdateElementBatch,
  onDeleteElement,
  onAddEmitter,
  onUpdateEmitter,
  onDeleteEmitter,
  onAddRadiatorSpec
}) {
  const [expandedRooms, setExpandedRooms] = useState(new Set());
  const prevRoomCountRef = useRef(rooms?.length || 0);

  // Auto-expand newly added rooms
  useEffect(() => {
    if (rooms && rooms.length > prevRoomCountRef.current) {
      // A new room was added - expand only the last room
      const newRoomId = rooms[rooms.length - 1]?.id;
      if (newRoomId) {
        setExpandedRooms(new Set([newRoomId]));
      }
    }
    prevRoomCountRef.current = rooms?.length || 0;
  }, [rooms]);

  const toggleRoom = (roomId) => {
    const newExpanded = new Set(expandedRooms);
    if (newExpanded.has(roomId)) {
      newExpanded.delete(roomId);
    } else {
      newExpanded.add(roomId);
    }
    setExpandedRooms(newExpanded);
  };

  const collapseAll = () => {
    setExpandedRooms(new Set());
  };

  const expandAll = () => {
    if (rooms) {
      setExpandedRooms(new Set(rooms.map(r => r.id)));
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Rooms</h2>
        <div className="flex gap-2">
          {rooms && rooms.length > 0 && (
            <>
              <button
                onClick={expandAll}
                className="text-blue-600 hover:text-blue-700 px-3 py-2 rounded border border-blue-300 hover:bg-blue-50 text-sm transition"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="text-gray-600 hover:text-gray-700 px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 text-sm transition"
              >
                Collapse All
              </button>
            </>
          )}
          <button
            onClick={onAddRoom}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 transition"
          >
            <PlusIcon />
            Add Room
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {rooms && rooms.length > 0 ? (
          rooms.map(room => {
            const isExpanded = expandedRooms.has(room.id);
            const transmissionLoss = calculateTransmissionLoss(room, project.externalTemp);
            const ventilationLoss = calculateVentilationLoss(room, project.externalTemp, project.airDensity, project.specificHeat, project);
            const totalLoss = transmissionLoss + ventilationLoss;

            return (
              <div key={room.id} className="border border-gray-300 rounded-lg overflow-hidden">
                {/* Collapsed Header */}
                <button
                  onClick={() => toggleRoom(room.id)}
                  className="w-full bg-gray-50 hover:bg-gray-100 p-4 flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-4 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUpIcon className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                      )}
                      <span className="font-bold text-lg">{room.name}</span>
                    </div>
                    
                    {/* Summary Info (visible when collapsed) */}
                    {!isExpanded && (
                      <div className="flex gap-6 text-sm">
                        <div>
                          <span className="text-gray-600">Floor Area:</span>{' '}
                          <span className="font-semibold">{room.floorArea.toFixed(2)} m²</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Volume:</span>{' '}
                          <span className="font-semibold">{room.volume.toFixed(2)} m³</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Elements:</span>{' '}
                          <span className="font-semibold">{room.elements?.length || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Emitters:</span>{' '}
                          <span className="font-semibold">{room.emitters?.length || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Heat Loss:</span>{' '}
                          <span className="font-semibold text-purple-600">
                            {totalLoss.toFixed(0)} W ({(totalLoss/1000).toFixed(2)} kW)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-4 bg-white">
                    <RoomEditor
                      room={room}
                      project={project}
                      onUpdate={onUpdateRoom}
                      onDelete={onDeleteRoom}
                      onAddElement={onAddElement}
                      onUpdateElement={onUpdateElement}
                      onUpdateElementBatch={onUpdateElementBatch}
                      onDeleteElement={onDeleteElement}
                      onAddEmitter={onAddEmitter}
                      onUpdateEmitter={onUpdateEmitter}
                      onDeleteEmitter={onDeleteEmitter}
                      onAddRadiatorSpec={onAddRadiatorSpec}
                    />
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No rooms yet</p>
            <p className="text-sm mt-2">Click "Add Room" to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}