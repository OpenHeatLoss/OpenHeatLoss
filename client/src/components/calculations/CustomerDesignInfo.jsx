// client/src/components/calculations/CustomerDesignInfo.jsx
//
// Checklist of the information MIS 3005-D 5.9.2 requires to be given to the
// customer in writing before installation, items (a)–(g). Read-only: it shows
// the saved project data (buildCustomerDesignInfo) and points to where each
// missing item is entered. "Download PDF" prints the same result as the
// customer-facing "Your Heating System Design" document (also in the customer
// pack and quote pack); missing items print as "To be confirmed".

import { useState } from 'react';
import { buildCustomerDesignInfo } from '../../utils/customerDesignInfo';
import { buildCustomerDesignSummaryPayload } from '../../utils/buildCustomerDesignSummaryPayload';
import { designStandardLabel, CUSTOMER_DESIGN_INFO_CLAUSE, DHW_CLAUSES } from '../../utils/mcsClauses';

const STATUS = {
  ok:      { icon: '✓', cls: 'text-green-700 bg-green-50 border-green-300', label: 'Complete' },
  warning: { icon: '⚠', cls: 'text-amber-800 bg-amber-50 border-amber-300', label: 'Check' },
  missing: { icon: '○', cls: 'text-gray-600 bg-gray-50 border-gray-300',   label: 'Missing' },
};

const c1 = (x) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(1));

function Detail({ item }) {
  switch (item.key) {
    case 'a':
      return item.status === 'missing' ? <p>No rooms entered.</p> : (
        <div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-0.5">
            {item.rooms.map((r, i) => (
              <div key={i} className="flex justify-between"><span>{r.name}</span><span className="font-semibold">{r.wPerM2.toFixed(0)} W/m²</span></div>
            ))}
          </div>
          <p className="text-gray-500 mt-1">Whole building: {item.buildingWPerM2.toFixed(0)} W/m²</p>
        </div>
      );

    case 'b':
      return item.demand
        ? <p><span className="font-semibold">{item.demand.litres} L/day</span> — 45 × N, N = {item.demand.n} ({item.demand.basis === 'occupants' ? 'known occupants' : 'bedrooms + 1'}), {DHW_CLAUSES.demand}</p>
        : <p>Enter bedrooms or occupants in Hot Water Design.</p>;

    case 'c':
      if (item.status === 'missing') return <p>No emitters scheduled — add them in Emitter Sizing.</p>;
      return (
        <div className="space-y-1">
          {item.rooms.filter(r => r.emitters.length).map((r, i) => (
            <div key={i}>
              <span className="font-semibold">{r.name}:</span>{' '}
              {r.emitters.map((e, j) => (
                <span key={j}>
                  {j > 0 && '; '}
                  {e.quantity > 1 ? `${e.quantity} × ` : ''}{e.description}{e.retained ? ' (existing, retained)' : ''}
                </span>
              ))}
            </div>
          ))}
          {item.roomsWithoutEmitters.length > 0 && (
            <p className="text-gray-500">No emitter: {item.roomsWithoutEmitters.join(', ')}</p>
          )}
        </div>
      );

    case 'd':
      if (item.status === 'missing') {
        return item.reason === 'no_rooms'
          ? <p>No rooms entered yet.</p>
          : <p>Set a valid design flow and return temperature in Emitter Sizing.</p>;
      }
      return (
        <div className="space-y-1">
          <p>
            <span className="font-semibold">Flow {item.flowTemp} °C / return {item.returnTemp} °C</span>{' '}
            (mean water {c1(item.meanWaterTemp)} °C).
            {item.worstRoom && <> Worst performing room with emitters: <span className="font-semibold">{item.worstRoom}</span>, which needs {c1(item.worstRoomFlowTemp)} °C flow.</>}
            {item.ufhMinFlowTemp != null && <> UFH needs at least {c1(item.ufhMinFlowTemp)} °C.</>}
          </p>
          {item.acceptedShortfalls.length > 0 && (
            <div>
              <p className="font-semibold">Accepted room shortfalls (made up by other rooms):</p>
              {item.acceptedShortfalls.map((s, i) => (
                <p key={i} className="ml-3">{s.name}: {s.shortfallW.toFixed(0)} W short{s.reason ? ` — ${s.reason}` : ' — no reason entered'}</p>
              ))}
            </div>
          )}
          {item.unresolvedShortRooms.length > 0 && (
            <p className="text-amber-800">
              ⚠ Short and not accepted: {item.unresolvedShortRooms.map(r => `${r.name} (${r.shortfallW.toFixed(0)} W)`).join(', ')}.
            </p>
          )}
          {!item.wholeHouseCovered && (
            <p className="text-amber-800">
              ⚠ Whole-house emitter output ({item.totalOutput.toFixed(0)} W) is below the heat loss ({item.totalHeatLoss.toFixed(0)} W) at this flow temperature.
            </p>
          )}
        </div>
      );

    case 'e':
      if (item.isNew === false) return <p>Existing cylinder retained{item.litres ? ` (${item.litres} L)` : ''} — no new cylinder to specify.</p>;
      return (
        <div className="space-y-1">
          {(item.manufacturer || item.model || item.litres) && (
            <p><span className="font-semibold">{[item.manufacturer, item.model].filter(Boolean).join(' ') || 'Cylinder'}</span>
              {item.litres ? `, ${item.litres} L` : ''}{item.coilAreaM2 ? `, ${item.coilAreaM2} m² coil` : ''}</p>
          )}
          {item.recoveryMin != null && (
            <p>Recovery: <span className="font-semibold">{Math.round(item.recoveryMin)} min</span>
              {item.recoveryLph ? ` (${Math.round(item.recoveryLph)} L/h)` : ''} — {item.conditions}
              {item.recoveryBasis === 'heat_pump' ? ', limited by the heat pump output' : ', datasheet figure'}.</p>
          )}
          <p className={item.reheatAgreed ? '' : 'text-gray-500'}>
            Reheat time agreed with the customer ({DHW_CLAUSES.reheatAgreed}):{' '}
            {item.reheatAgreed ? `${item.reheatAgreedMin} min` : 'not recorded'}
          </p>
          {item.missing?.length > 0 && <p className="text-gray-500">Still needed in Hot Water Design: {item.missing.join(', ')}.</p>}
        </div>
      );

    case 'f':
      if (item.status === 'missing') return <p>Set the design flow temperature in Emitter Sizing.</p>;
      return (
        <p>
          <span className="font-semibold">{item.leavingTemp} °C</span>
          {item.blendedCircuits.length > 0
            ? <> — UFH blended down to {item.blendedCircuits.map(u => `${u.flowTemp} °C (${u.name})`).join(', ')}.</>
            : ' — no blended circuits.'}
        </p>
      );

    case 'g':
      if (item.basis === 'listed_scop') {
        if (item.status === 'missing') return <p>Needs the heat pump's SCoP from the MCS website (MCS 031 tab, no-EPC route).</p>;
        return (
          <p>
            <span className="font-semibold">SCoP {item.scop}</span> ({item.heatPumpType}) — {item.source}.
            <span className="text-gray-500"> As listed on the MCS website (no-EPC route, MCS 031 Appendix A).</span>
          </p>
        );
      }
      if (item.status === 'missing') return <p>Needs the design flow temperature.</p>;
      return (
        <p>
          <span className="font-semibold">SPF {item.spf.toFixed(1)}</span> ({item.heatPumpType}, {item.flowTempBand} °C band) — {item.source}.
          <span className="text-gray-500"> MCS 031 v4 replaced SCoP values with SPF.</span>
        </p>
      );

    default:
      return null;
  }
}

export default function CustomerDesignInfo({ project }) {
  const [open, setOpen] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { items, counts } = buildCustomerDesignInfo(project);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch('/api/generate-pdf/customer-design-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCustomerDesignSummaryPayload(project)),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Heating_System_Design_${project.name || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
      } else { alert('Failed to generate PDF.'); }
    } catch (error) { console.error(error); alert('Error generating PDF.'); }
    setDownloading(false);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold">Customer Design Information</h3>
          <p className="text-xs text-gray-500">
            {designStandardLabel()} {CUSTOMER_DESIGN_INFO_CLAUSE} — to be given to the customer in writing before installation.
            Shows saved data; unsaved edits above are not included.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded border text-green-700 bg-green-50 border-green-300">{counts.ok} complete</span>
          {counts.warning > 0 && <span className="px-2 py-1 rounded border text-amber-800 bg-amber-50 border-amber-300">{counts.warning} to check</span>}
          {counts.missing > 0 && <span className="px-2 py-1 rounded border text-gray-600 bg-gray-50 border-gray-300">{counts.missing} missing</span>}
          <button
            onClick={handleDownload}
            disabled={downloading}
            title={counts.missing ? 'Missing items will print as "To be confirmed before installation"' : 'Customer-facing design summary'}
            className="ml-2 bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:bg-gray-400 font-semibold"
          >
            {downloading ? '⏳ Generating...' : '📄 Download PDF'}
          </button>
          <button onClick={() => setOpen(!open)} className="text-blue-600 hover:text-blue-800 ml-2">{open ? 'Hide' : 'Show'}</button>
        </div>
      </div>

      {open && (
        <div className="mt-4 divide-y divide-gray-200 border-t border-gray-200">
          {items.map(item => {
            const s = STATUS[item.status];
            return (
              <div key={item.key} className="py-3 flex gap-3">
                <span title={s.label} className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border text-sm font-bold ${s.cls}`}>{s.icon}</span>
                <div className="flex-1 text-sm">
                  <div className="font-semibold text-gray-900">
                    ({item.key}) {item.title} <span className="font-normal text-xs text-gray-400">{item.clause}</span>
                  </div>
                  <div className="text-xs text-gray-700 mt-1"><Detail item={item} /></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
