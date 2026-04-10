// client/src/components/pipesizing/IndexCircuitSummary.jsx
import { useState } from 'react';

export default function IndexCircuitSummary({ circuit, project }) {
  const [residualHead, setResidualHead] = useState(0);

  // Convert kPa to meters head (1 kPa ≈ 0.102 m)
  const requiredHeadMeters = circuit.totalPressureDrop * 0.102;
  
  // Check if residual head is sufficient
  const headDifference = residualHead - requiredHeadMeters;
  const isResidualHeadSufficient = residualHead >= requiredHeadMeters;

  return (
    <div className="border-2 border-yellow-500 rounded-lg p-6 bg-gradient-to-r from-yellow-50 to-orange-50">
      <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <span className="text-2xl">🏆</span>
        Index Circuit & Pump Requirements
      </h3>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Required Specifications */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-3">System Requirements:</h4>
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Index Circuit</div>
              <div className="text-2xl font-bold text-gray-800">{circuit.name}</div>
            </div>
            
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Required Pump Head</div>
              <div className="text-2xl font-bold text-orange-600">
                {circuit.totalPressureDrop.toFixed(2)} kPa
              </div>
              <div className="text-sm text-gray-600 mt-1">
                ({requiredHeadMeters.toFixed(2)} m head)
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Required Flow Rate</div>
              <div className="text-2xl font-bold text-blue-600">
                {circuit.flowRate.toFixed(3)} l/s
              </div>
              <div className="text-sm text-gray-600 mt-1">
                ({(circuit.flowRate * 3.6).toFixed(2)} m³/h)
              </div>
            </div>
          </div>
        </div>

        {/* Heat Pump Residual Head Comparison */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-3">Heat Pump Specification:</h4>
          
          <div className="bg-white rounded-lg p-4 shadow-sm mb-3">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Heat Pump Residual Head (m)
            </label>
            <input
              type="number"
              step="0.1"
              value={residualHead || ''}
              onChange={(e) => setResidualHead(parseFloat(e.target.value) || 0)}
              placeholder="Enter residual head from datasheet"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              Find this in the heat pump's technical datasheet (usually 0.5-2.0m)
            </div>
          </div>

          {residualHead > 0 && (
            <div className={`rounded-lg p-4 ${
              isResidualHeadSufficient 
                ? 'bg-green-100 border-2 border-green-500' 
                : 'bg-red-100 border-2 border-red-500'
            }`}>
              <div className="text-sm font-semibold mb-2">
                {isResidualHeadSufficient ? '✓ Residual Head Sufficient' : '✗ Insufficient Residual Head'}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700">Heat pump provides:</span>
                  <span className="font-bold">{residualHead.toFixed(2)} m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">System requires:</span>
                  <span className="font-bold">{requiredHeadMeters.toFixed(2)} m</span>
                </div>
                <div className="border-t border-gray-300 pt-2 flex justify-between">
                  <span className="font-semibold text-gray-700">Difference:</span>
                  <span className={`font-bold ${isResidualHeadSufficient ? 'text-green-700' : 'text-red-700'}`}>
                    {headDifference >= 0 ? '+' : ''}{headDifference.toFixed(2)} m
                  </span>
                </div>
              </div>
              
              {!isResidualHeadSufficient && (
                <div className="mt-3 text-xs text-red-800 bg-red-50 rounded p-2">
                  <strong>Action required:</strong> Additional external pump needed or reduce system pressure drop
                  by increasing pipe sizes or reducing circuit length.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pump Selection Guidance */}
      <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Pump Selection Guidance:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Select a pump that can provide <strong>{requiredHeadMeters.toFixed(2)}m head</strong> at <strong>{(circuit.flowRate * 3.6).toFixed(2)} m³/h</strong></li>
          <li>• Add 10-20% safety margin for future expansion or fouling</li>
          <li>• Consider using a variable speed pump for energy efficiency</li>
          <li>• If using heat pump's internal pump, ensure residual head exceeds system requirement</li>
          <li>• Check pump curve at the operating point for efficiency</li>
        </ul>
      </div>
    </div>
  );
}
