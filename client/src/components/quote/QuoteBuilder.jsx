// client/src/components/quote/QuoteBuilder.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../utils/api';

// ─── Constants ───────────────────────────────────────────────────────────────

// Parent categories — fixed, these are what the customer sees on the quote.
// The key must match the parent_category values stored in materials_list_items.
const CATEGORIES = [
  { key: 'heat_pump',  label: 'Heat pump',           itemType: 'goods'  },
  { key: 'cylinder',   label: 'Cylinder',             itemType: 'goods'  },
  { key: 'radiators',  label: 'Radiators / emitters', itemType: 'goods'  },
  { key: 'pipework',   label: 'Pipework & materials', itemType: 'goods'  },
  { key: 'electrical', label: 'Electrical works',     itemType: 'labour' },
  { key: 'labour',     label: 'Labour',               itemType: 'labour' },
  { key: 'design',     label: 'Design / survey fee',  itemType: 'labour' },
  { key: 'mcs',        label: 'MCS registration',     itemType: 'labour' },
  { key: 'other',      label: 'Other',                itemType: 'goods'  },
];

const PRICING_MODES = [
  { value: 'unit',      label: 'Unit × price' },
  { value: 'per_metre', label: 'Length × price/m' },
  { value: 'flat',      label: 'Flat figure' },
];

const VAT_OPTIONS = [
  { value: 0,  label: '0% — domestic heat pump installation' },
  { value: 5,  label: '5%' },
  { value: 20, label: '20%' },
];

const SURVEY_BASIS_OPTIONS = [
  { value: 'full',   label: 'Full site survey completed — Consumer Journey 1' },
  { value: 'prelim', label: 'Preliminary visit only — Consumer Journey 2' },
];

// RECC compliance checklist
const CHECKLIST_SECTIONS = [
  {
    id: 'design', title: 'System design inputs',
    items: [
      { t: 'Heat loss calculation completed — room by room', recc: true },
      { t: 'Design flow temperature confirmed and documented (target ≤55°C)' },
      { t: 'Heat pump model, output (kW) and COP selected to match heat loss' },
      { t: 'SCOP figure noted — required for MCS performance estimate' },
      { t: 'Cylinder model, volume and coil sizing confirmed for DHW demand' },
      { t: 'Emitter upgrades required — rooms identified, new sizes specified' },
      { t: 'Buffer vessel decision made — required or not, documented' },
      { t: 'Electrical supply requirements confirmed' },
      { t: 'External unit location finalised — clearances, noise checked' },
      { t: 'MCS Heat Pump System Performance Estimate completed', recc: true },
      { t: 'Final system design shared with client and approval obtained', recc: true },
    ],
  },
  {
    id: 'scope', title: 'Scope of works',
    items: [
      { t: 'Heat pump — make, model, output, quantity listed as line item', recc: true },
      { t: 'Cylinder — make, model, capacity listed as line item', recc: true },
      { t: 'All other goods listed: radiators, valves, controls, pipework', recc: true },
      { t: 'System flush and chemical cleanse included and itemised' },
      { t: 'Electrical works itemised' },
      { t: 'Emitter upgrades itemised — room by room' },
      { t: 'Controls package specified' },
      { t: 'Testing and commissioning included', recc: true },
      { t: 'MCS registration included and costed', recc: true },
      { t: 'Building notice — included or explicitly excluded', recc: true },
      { t: 'Old boiler / cylinder removal — included or explicitly excluded', recc: true },
      { t: 'Goods and services shown as separate line items', recc: true },
    ],
  },
  {
    id: 'exclusions', title: 'Exclusions and client responsibilities',
    items: [
      { t: 'All exclusions drafted — everything not in scope stated explicitly', recc: true },
      { t: 'Making good / redecoration — excluded or included, clearly stated', recc: true },
      { t: 'Asbestos — risk noted, exclusion stated if applicable' },
      { t: 'Groundworks — scope confirmed or excluded' },
      { t: "Planning permission — client's responsibility stated clearly", recc: true },
      { t: 'EPC assessment — included, excluded, or client\'s responsibility', recc: true },
      { t: 'Fabric improvement works — out of scope if not included' },
      { t: 'Variation rate stated for unforeseen works', recc: true },
      { t: 'Any sub-contractors named if third parties will carry out work', recc: true },
    ],
  },
  {
    id: 'documents', title: 'Documents to send with quote',
    items: [
      { t: 'Quote document itself — itemised, signed, dated', recc: true },
      { t: 'MCS Performance Estimate document included', recc: true },
      { t: 'RECC cancellation rights form included', recc: true },
      { t: 'RECC standard terms and conditions sent', recc: true },
      { t: 'RECC consumer code leaflet included', recc: true },
      { t: "Your company's complaints procedure included", recc: true },
    ],
  },
];

function emptyChecklist() {
  const checks = {};
  const notes  = {};
  CHECKLIST_SECTIONS.forEach(sec => {
    sec.items.forEach((_, i) => { checks[`${sec.id}_${i}`] = false; });
    notes[sec.id] = '';
  });
  return { checks, notes };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcItemTotal(item) {
  if (item.pricingMode === 'flat') return item.unitCost || 0;
  return (item.quantity || 0) * (item.unitCost || 0);
}

function categorySubtotal(materials, catKey) {
  return materials
    .filter(m => m.parent_category === catKey)
    .reduce((sum, m) => sum + (m.total_cost || 0), 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Single child item row in the materials list
function MaterialRow({ item, onUpdate, onDelete, onSaveToLibrary, libraryItems }) {
  const [desc, setDesc]         = useState(item.description || '');
  const [qty, setQty]           = useState(item.quantity ?? 1);
  const [cost, setCost]         = useState(item.unit_cost ?? 0);
  const [mode, setMode]         = useState(item.pricing_mode || 'unit');
  const [unitLabel, setUnitLabel] = useState(item.unit_label || '');
  const [saving, setSaving]     = useState(false);
  const debounce = useRef(null);

  // Sync from parent when item changes (e.g. after import)
  useEffect(() => {
    setDesc(item.description || '');
    setQty(item.quantity ?? 1);
    setCost(item.unit_cost ?? 0);
    setMode(item.pricing_mode || 'unit');
    setUnitLabel(item.unit_label || '');
  }, [item.id]);

  const total = mode === 'flat' ? cost : qty * cost;

  const debouncedSave = useCallback((patch) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setSaving(true);
      onUpdate(item.id, patch).finally(() => setSaving(false));
    }, 800);
  }, [item.id, onUpdate]);

  const handleChange = (field, value) => {
    const patch = {
      parentCategory: item.parent_category,
      description: desc, quantity: qty, unitCost: cost,
      pricingMode: mode, unitLabel,
      [field]: value,
    };
    if (field === 'description') setDesc(value);
    if (field === 'quantity')    setQty(value);
    if (field === 'unitCost')    setCost(value);
    if (field === 'pricingMode') setMode(value);
    if (field === 'unitLabel')   setUnitLabel(value);
    debouncedSave(patch);
  };

  const sourceBadge = item.source && item.source !== 'manual' ? (
    <span className="text-xs text-gray-400 ml-1">
      {item.source === 'radiator_schedule' ? '↑ schedule' :
       item.source === 'pipe_sections'     ? '↑ pipe' :
       item.source === 'library'           ? '↑ library' : ''}
    </span>
  ) : null;

  return (
    <div className="grid grid-cols-12 gap-1.5 items-center py-1.5 border-b border-gray-50 last:border-0 group">
      {/* Description */}
      <div className="col-span-4 flex items-center gap-1">
        <input
          type="text"
          value={desc}
          onChange={e => handleChange('description', e.target.value)}
          placeholder="Description"
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 focus:bg-white"
        />
        {sourceBadge}
      </div>

      {/* Pricing mode */}
      <div className="col-span-2">
        <select
          value={mode}
          onChange={e => handleChange('pricingMode', e.target.value)}
          className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:ring-1 focus:ring-blue-500"
        >
          {PRICING_MODES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Qty / length — hidden for flat */}
      <div className="col-span-1">
        {mode !== 'flat' ? (
          <input
            type="number"
            value={qty}
            onChange={e => handleChange('quantity', parseFloat(e.target.value) || 0)}
            min="0"
            step="0.1"
            className="w-full text-sm text-right border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:ring-1 focus:ring-blue-500 focus:bg-white"
          />
        ) : (
          <div className="text-xs text-gray-300 text-center">—</div>
        )}
      </div>

      {/* Unit label — e.g. "m", "each" */}
      <div className="col-span-1">
        <input
          type="text"
          value={unitLabel}
          onChange={e => handleChange('unitLabel', e.target.value)}
          placeholder={mode === 'per_metre' ? 'm' : mode === 'unit' ? 'ea' : ''}
          className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:ring-1 focus:ring-blue-500 text-center"
        />
      </div>

      {/* Unit cost / price per m / flat figure */}
      <div className="col-span-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
          <input
            type="number"
            value={cost}
            onChange={e => handleChange('unitCost', parseFloat(e.target.value) || 0)}
            min="0"
            step="0.01"
            className="w-full text-sm text-right border border-gray-200 rounded pl-4 pr-1.5 py-1 bg-gray-50 focus:ring-1 focus:ring-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Total */}
      <div className="col-span-1 text-sm text-right text-gray-700 font-medium pr-1">
        £{total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        {saving && <span className="block text-xs text-gray-300 font-normal">saving</span>}
      </div>

      {/* Actions */}
      <div className="col-span-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onSaveToLibrary(item)}
          title="Save to company library"
          className="text-xs text-blue-400 hover:text-blue-600 px-1"
        >
          ↗
        </button>
        <button
          onClick={() => onDelete(item.id)}
          title="Remove"
          className="text-red-300 hover:text-red-500 text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// One category section — collapsible, shows subtotal in header
function MaterialsCategory({
  category, items, libraryItems, rateCard, onAddItem, onAddFromLibrary,
  onAddFromRateCard, onUpdate, onDelete, onSaveToLibrary, defaultOpen,
}) {
  const [open,        setOpen]        = useState(defaultOpen ?? false);
  const [showLibPick, setShowLibPick] = useState(false);
  const [showRcPick,  setShowRcPick]  = useState(false);

  const catItems = items.filter(m => m.parent_category === category.key);
  const subtotal = catItems.reduce((s, m) => s + (m.total_cost || 0), 0);

  const catLibItems   = libraryItems.filter(l => l.category_key === category.key);
  const rateCardOptions = (category.itemType === 'labour' && rateCard) ? [
    ...(rateCard.day_rate    > 0 ? [{ description: 'Day rate',    unit: 'day',  rate: rateCard.day_rate    }] : []),
    ...(rateCard.hourly_rate > 0 ? [{ description: 'Hourly rate', unit: 'hour', rate: rateCard.hourly_rate }] : []),
    ...(Array.isArray(rateCard.items) ? rateCard.items : []),
  ] : [];

  // Close pickers when category collapses
  const handleToggleOpen = () => {
    setOpen(o => {
      if (o) { setShowLibPick(false); setShowRcPick(false); }
      return !o;
    });
  };

  const handlePickLib = (item) => {
    onAddFromLibrary(category.key, item);
    setShowLibPick(false);
  };

  const handlePickRc = (item) => {
    onAddFromRateCard(category.key, item);
    setShowRcPick(false);
  };

  return (
    <div className="border border-gray-200 rounded-lg mb-2">
      {/* Category header */}
      <button
        onClick={handleToggleOpen}
        className={`w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left ${open ? 'rounded-t-lg' : 'rounded-lg'}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">{category.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            category.itemType === 'goods'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-purple-100 text-purple-700'
          }`}>{category.itemType}</span>
          {catItems.length > 0 && (
            <span className="text-xs text-gray-400">{catItems.length} item{catItems.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">
            £{subtotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="bg-white rounded-b-lg">
          {/* Column headers */}
          {catItems.length > 0 && (
            <div className="grid grid-cols-12 gap-1.5 px-4 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <div className="col-span-4">Description</div>
              <div className="col-span-2">Mode</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-1 text-center">Unit</div>
              <div className="col-span-2 text-right">Unit cost</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>
          )}

          {/* Items */}
          <div className="px-4">
            {catItems.length === 0 && (
              <div className="text-sm text-gray-400 py-3 text-center">
                No items — add below
              </div>
            )}
            {catItems.map(item => (
              <MaterialRow
                key={item.id}
                item={item}
                libraryItems={libraryItems}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onSaveToLibrary={onSaveToLibrary}
              />
            ))}
          </div>

          {/* Add controls */}
          <div className="px-4 pt-3 pb-2 border-t border-gray-100 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => { onAddItem(category.key); setShowLibPick(false); setShowRcPick(false); }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add item
            </button>

            {catLibItems.length > 0 && (
              <button
                onClick={() => { setShowLibPick(v => !v); setShowRcPick(false); }}
                className={`text-sm font-medium transition ${showLibPick ? 'text-gray-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                + From library {showLibPick ? '▲' : '▾'}
              </button>
            )}

            {rateCardOptions.length > 0 && (
              <button
                onClick={() => { setShowRcPick(v => !v); setShowLibPick(false); }}
                className={`text-sm font-medium transition ${showRcPick ? 'text-purple-700' : 'text-purple-600 hover:text-purple-700'}`}
              >
                + From rate card {showRcPick ? '▲' : '▾'}
              </button>
            )}

            {category.itemType === 'labour' && !rateCard && (
              <span className="text-xs text-gray-400 italic">
                No rate card — set one up in Settings
              </span>
            )}
          </div>

          {/* Library picker — inline expansion */}
          {showLibPick && catLibItems.length > 0 && (
            <div className="mx-4 mb-3 border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Company library — {category.label}
              </div>
              {catLibItems.map(l => (
                <button
                  key={l.id}
                  onClick={() => handlePickLib(l)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center justify-between gap-4"
                >
                  <span className="font-medium text-gray-700">{l.description}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    £{(l.default_unit_cost || 0).toFixed(2)}
                    {l.unit_label ? ` / ${l.unit_label}` : ''}
                    {' · '}{l.pricing_mode}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Rate card picker — inline expansion */}
          {showRcPick && rateCardOptions.length > 0 && (
            <div className="mx-4 mb-3 border border-purple-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-purple-50 border-b border-purple-200 text-xs font-semibold text-purple-700 uppercase tracking-wide flex items-center justify-between">
                <span>Rate card</span>
                <span className="font-normal text-purple-500 normal-case">
                  Effective {new Date(rateCard.effective_from).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
              </div>
              {rateCardOptions.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handlePickRc(item)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-purple-50 border-b border-gray-50 last:border-0 flex items-center justify-between gap-4"
                >
                  <span className="font-medium text-gray-700">{item.description}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    £{(item.rate || 0).toFixed(2)} / {item.unit}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryOverrideRow({ row, isOverridden, onCommit }) {
  const [draft, setDraft] = useState(
    (isOverridden ? row.quotePrice : row.withMarkup).toFixed(2)
  );

  // Re-sync local buffer when the underlying value changes for reasons
  // other than this input's own edits — e.g. markup % changed elsewhere,
  // or the override was reset via the ↺ button.
  useEffect(() => {
    setDraft((isOverridden ? row.quotePrice : row.withMarkup).toFixed(2));
  }, [row.key, isOverridden, row.quotePrice, row.withMarkup]);

  const commit = () => {
    const parsed = parseFloat(draft) || 0;
    onCommit(row.key, parsed);
  };

  return (
    <div className="col-span-3">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
        <input
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur(); } }}
          min="0"
          step="0.01"
          className={`w-full text-sm text-right border rounded pl-5 pr-2 py-1 focus:ring-1 focus:ring-blue-500 ${
            isOverridden
              ? 'border-amber-300 bg-amber-50 font-medium'
              : 'border-gray-200 bg-gray-50'
          }`}
        />
      </div>
    </div>
  );
}

// Quote summary — category totals + markup + VAT + BUS grant
function QuoteSummary({
  materials, markupPct, setMarkupPct,
  categoryOverrides, setCategoryOverride,
  vatRate, setVatRate,
  depositAmount, setDepositAmount,
  advanceAmount, setAdvanceAmount,
  hourlyRate, setHourlyRate,
  busGrant,
}) {
  const rows = CATEGORIES.map(cat => {
    const materialsTotal = categorySubtotal(materials, cat.key);
    const withMarkup     = materialsTotal * (1 + markupPct / 100);
    const override       = categoryOverrides[cat.key];
    const quotePrice     = override !== null && override !== undefined ? override : withMarkup;
    return { ...cat, materialsTotal, withMarkup, quotePrice };
  });

  const totalExVat  = rows.reduce((s, r) => s + r.quotePrice, 0);
  const vatAmount   = totalExVat * (vatRate / 100);
  const totalIncVat = totalExVat + vatAmount;
  const clientPays  = Math.max(0, totalIncVat - busGrant);

  const max25Pct    = totalIncVat * 0.25;
  const max60Pct    = totalIncVat * 0.60;
  const depositPct  = totalIncVat ? ((depositAmount / totalIncVat) * 100).toFixed(1) : 0;
  const combinedPct = totalIncVat
    ? (((depositAmount + advanceAmount) / totalIncVat) * 100).toFixed(1)
    : 0;

  let depositMessage = null;
  if (depositAmount > 0 && totalIncVat > 0) {
    if (depositAmount > max25Pct) {
      depositMessage = { type: 'warn', text: `Deposit ${depositPct}% exceeds RECC 25% maximum (£${max25Pct.toFixed(2)}). Must be reduced.` };
    } else if ((depositAmount + advanceAmount) > max60Pct) {
      depositMessage = { type: 'warn', text: `Deposit + advance (${combinedPct}%) exceeds RECC 60% combined maximum.` };
    } else {
      depositMessage = { type: 'ok', text: `Deposit ${depositPct}% — within RECC limits. Combined: ${combinedPct}%.` };
    }
  }

  return (
    <div className="space-y-4">
      {/* Markup */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Quote summary</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Markup</label>
            <div className="relative">
              <input
                type="number"
                value={markupPct}
                onChange={e => setMarkupPct(parseFloat(e.target.value) || 0)}
                min="0"
                max="200"
                step="1"
                className="w-20 text-sm text-right border border-gray-300 rounded px-2 py-1 pr-5 focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
            </div>
          </div>
        </div>

        {/* Category rows */}
        <div className="space-y-0">
          {/* Headers */}
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            <div className="col-span-4">Category</div>
            <div className="col-span-2 text-right">Materials</div>
            <div className="col-span-2 text-right">+ Markup</div>
            <div className="col-span-3 text-right">Quote price £</div>
            <div className="col-span-1"></div>
          </div>

          {rows.map(row => {
            const isOverridden = categoryOverrides[row.key] !== null && categoryOverrides[row.key] !== undefined;
            return (
              <div key={row.key} className="grid grid-cols-12 gap-2 items-center py-1.5 border-b border-gray-50 last:border-0">
                <div className="col-span-4 flex items-center gap-2">
                  <span className="text-sm text-gray-700">{row.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    row.itemType === 'goods' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                  }`}>{row.itemType}</span>
                </div>
                <div className="col-span-2 text-sm text-right text-gray-500">
                  {row.materialsTotal > 0
                    ? `£${row.materialsTotal.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : '—'}
                </div>
                <div className="col-span-2 text-sm text-right text-gray-500">
                  {row.withMarkup > 0
                    ? `£${row.withMarkup.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : '—'}
                </div>
                <CategoryOverrideRow
                  row={row}
                  isOverridden={isOverridden}
                  onCommit={setCategoryOverride}
                />
                <div className="col-span-1 text-center">
                  {isOverridden && (
                    <button
                      onClick={() => setCategoryOverride(row.key, null)}
                      title="Reset to materials + markup"
                      className="text-xs text-amber-500 hover:text-amber-700"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* VAT */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4">
          <label className="text-xs font-semibold text-gray-600 whitespace-nowrap">VAT rate</label>
          <select
            value={vatRate}
            onChange={e => setVatRate(parseFloat(e.target.value))}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          >
            {VAT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Totals */}
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
          {[
            { label: 'Subtotal (ex VAT)', value: totalExVat },
            { label: `VAT (${vatRate}%)`,  value: vatAmount  },
            { label: 'Grand total (inc VAT)', value: totalIncVat, bold: true },
          ].map(row => (
            <div key={row.label} className={`flex justify-between text-sm ${row.bold ? 'font-semibold' : 'text-gray-600'}`}>
              <span>{row.label}</span>
              <span>£{row.value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          ))}
          {busGrant > 0 && (
            <div className="flex justify-between text-sm text-green-700">
              <span>BUS grant</span>
              <span>− £{busGrant.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base text-blue-700 pt-1 border-t border-gray-200">
            <span>Client pays</span>
            <span>£{clientPays.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Payment schedule */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Payment schedule</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Deposit £ (max 25%)</label>
            <input
              type="number"
              value={depositAmount || ''}
              onChange={e => setDepositAmount(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Further advance £</label>
            <input
              type="number"
              value={advanceAmount || ''}
              onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Balance on completion £</label>
            <input
              type="number"
              readOnly
              value={Math.max(0, clientPays - depositAmount - advanceAmount).toFixed(2)}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-gray-50 text-gray-600"
            />
          </div>
        </div>
        {depositMessage && (
          <div className={`mt-3 text-xs px-3 py-2 rounded ${
            depositMessage.type === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'
          }`}>
            {depositMessage.type === 'warn' ? '⚠ ' : '✓ '}{depositMessage.text}
          </div>
        )}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Hourly rate for variation works £/hr
            <span className="text-amber-600 font-normal ml-1">— RECC requirement</span>
          </label>
          <input
            type="number"
            value={hourlyRate || ''}
            onChange={e => setHourlyRate(parseFloat(e.target.value) || 0)}
            placeholder="e.g. 65"
            className="w-40 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

// Snapshot history panel
function SnapshotHistory({ quoteId, onSaveSnapshot }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [viewing,   setViewing]   = useState(null); // snapshot data for modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [label, setLabel] = useState('');
  const [note,  setNote]  = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!quoteId) return;
    api.getQuoteSnapshots(quoteId)
      .then(data => setSnapshots(Array.isArray(data) ? data : []))
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [quoteId]);

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const snapshot = await onSaveSnapshot(label.trim(), note.trim(), 'manual');
      setSnapshots(prev => [snapshot, ...prev]);
      setShowSaveModal(false);
      setLabel('');
      setNote('');
    } finally {
      setSaving(false);
    }
  };

  const handleView = async (snapshot) => {
    const full = await api.getQuoteSnapshot(snapshot.id);
    setViewing(full);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Version history</h3>
          <div className="text-xs text-gray-400 mt-0.5">{snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}</div>
        </div>
        <button
          onClick={() => setShowSaveModal(true)}
          className="text-sm bg-gray-800 hover:bg-gray-900 text-white px-3 py-1.5 rounded font-medium transition"
        >
          Save version
        </button>
      </div>

      {loading ? (
        <div className="px-5 py-4 text-sm text-gray-400">Loading...</div>
      ) : snapshots.length === 0 ? (
        <div className="px-5 py-4 text-sm text-gray-400">
          No versions saved yet. Use "Save version" before making significant changes.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {snapshots.map(snap => (
            <div key={snap.id} className="px-5 py-3 flex items-start justify-between hover:bg-gray-50">
              <div>
                <div className="text-sm font-medium text-gray-800">{snap.version_label}</div>
                {snap.note && <div className="text-xs text-gray-500 mt-0.5">{snap.note}</div>}
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(snap.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {snap.created_by && ` · ${snap.created_by}`}
                  {snap.triggered_by === 'status_change' && (
                    <span className="ml-2 text-blue-500">auto</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleView(snap)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-4 mt-0.5 whitespace-nowrap"
              >
                View →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Save version modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold text-gray-900">Save version</h3>
              <button onClick={() => setShowSaveModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Label *</label>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. v1 — initial design, After client revision"
                  autoFocus
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Note (optional)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="What changed and why?"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={!label.trim() || saving}
                className="w-full bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white font-semibold py-2.5 rounded transition"
              >
                {saving ? 'Saving...' : 'Save snapshot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View snapshot modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900">{viewing.version_label}</h3>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(viewing.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </div>
              <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="overflow-auto p-5 flex-1">
              {viewing.note && (
                <div className="mb-4 text-sm bg-blue-50 text-blue-800 px-3 py-2 rounded">
                  {viewing.note}
                </div>
              )}
              {viewing.snapshot_data && (
                <SnapshotReadOnly data={viewing.snapshot_data} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Read-only view of a snapshot's data
function SnapshotReadOnly({ data }) {
  if (!data) return <div className="text-sm text-gray-400">No data</div>;
  const { quote, materials, categoryOverrides, totals, rateCard } = data;

  return (
    <div className="space-y-4 text-sm">
      {/* Quote header */}
      {quote && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div><span className="text-gray-500">Reference:</span> <span className="font-medium">{quote.reference}</span></div>
          <div><span className="text-gray-500">Prepared by:</span> <span className="font-medium">{quote.preparedBy}</span></div>
          <div><span className="text-gray-500">Markup:</span> <span className="font-medium">{quote.markupPct}%</span></div>
        </div>
      )}
      {rateCard && (
        <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded">
          Rate card: effective {new Date(rateCard.effective_from).toLocaleDateString('en-GB')} ·
          Day rate £{rateCard.day_rate} · Hourly £{rateCard.hourly_rate}
        </div>
      )}
      {/* Category breakdown */}
      {materials && materials.length > 0 && (
        <div>
          <div className="font-semibold text-gray-700 mb-2">Materials</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400">
                <th className="text-left pb-1">Category</th>
                <th className="text-left pb-1">Description</th>
                <th className="text-right pb-1">Qty</th>
                <th className="text-right pb-1">Unit cost</th>
                <th className="text-right pb-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1 text-gray-500">{m.parent_category}</td>
                  <td className="py-1">{m.description}</td>
                  <td className="py-1 text-right">{m.pricing_mode !== 'flat' ? m.quantity : '—'}</td>
                  <td className="py-1 text-right">£{(m.unit_cost || 0).toFixed(2)}</td>
                  <td className="py-1 text-right">£{(m.total_cost || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Totals */}
      {totals && (
        <div className="border-t border-gray-200 pt-3 space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Ex VAT</span><span className="font-medium">£{(totals.exVat || 0).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">VAT</span><span className="font-medium">£{(totals.vatAmount || 0).toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold"><span>Inc VAT</span><span>£{(totals.incVat || 0).toFixed(2)}</span></div>
          <div className="flex justify-between text-green-700"><span>BUS grant</span><span>− £{(totals.busGrant || 0).toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-blue-700"><span>Client pays</span><span>£{(totals.clientPays || 0).toFixed(2)}</span></div>
        </div>
      )}
    </div>
  );
}

// RECC checklist — unchanged from original
function ReccChecklist({ checklist, setChecklist }) {
  const [openSections, setOpenSections] = useState({});

  const toggleCheck = (key) => {
    setChecklist(prev => ({
      ...prev,
      checks: { ...prev.checks, [key]: !prev.checks[key] },
    }));
  };

  const updateNote = (sectionId, value) => {
    setChecklist(prev => ({
      ...prev,
      notes: { ...prev.notes, [sectionId]: value },
    }));
  };

  const toggleSection = (id) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const totalChecks = Object.keys(checklist.checks).length;
  const doneChecks  = Object.values(checklist.checks).filter(Boolean).length;
  const totalRecc   = CHECKLIST_SECTIONS.flatMap(s => s.items).filter(i => i.recc).length;
  const doneRecc    = CHECKLIST_SECTIONS.flatMap((s) =>
    s.items.filter((item, i) => item.recc && checklist.checks[`${s.id}_${i}`])
  ).length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Pre-send checklist</h3>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>{doneChecks} / {totalChecks} done</span>
            <span className={doneRecc === totalRecc ? 'text-green-600 font-medium' : 'text-amber-600'}>
              {doneRecc} / {totalRecc} RECC
            </span>
          </div>
        </div>
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: totalChecks ? `${(doneChecks / totalChecks) * 100}%` : '0%' }}
          />
        </div>
      </div>
      {CHECKLIST_SECTIONS.map(section => {
        const isOpen      = openSections[section.id];
        const sectionDone = section.items.filter((_, i) => checklist.checks[`${section.id}_${i}`]).length;
        return (
          <div key={section.id} className="border-b border-gray-100 last:border-0">
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition text-left"
            >
              <span className="text-sm font-medium text-gray-700">{section.title}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  sectionDone === section.items.length ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {sectionDone} / {section.items.length}
                </span>
                <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-gray-100">
                {section.items.map((item, i) => {
                  const key     = `${section.id}_${i}`;
                  const checked = checklist.checks[key];
                  return (
                    <label
                      key={key}
                      className="flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={checked || false}
                        onChange={() => toggleCheck(key)}
                        className="mt-0.5 flex-shrink-0 accent-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {item.t}
                        </span>
                        {item.recc && (
                          <span className="ml-2 text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">RECC</span>
                        )}
                      </div>
                    </label>
                  );
                })}
                <div className="px-5 py-3 bg-gray-50">
                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                  <textarea
                    value={checklist.notes[section.id] || ''}
                    onChange={e => updateNote(section.id, e.target.value)}
                    rows={2}
                    className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuoteBuilder({ project }) {
  // Quote header state
  const [quoteId,       setQuoteId]       = useState(null);
  const [reference,     setReference]     = useState('');
  const [preparedBy,    setPreparedBy]    = useState('');
  const [surveyBasis,   setSurveyBasis]   = useState('full');
  const [validDays,     setValidDays]     = useState(30);
  const [vatRate,       setVatRate]       = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [hourlyRate,    setHourlyRate]    = useState(0);
  const [markupPct,     setMarkupPct]     = useState(0);
  const [categoryOverrides, setCategoryOverrides] = useState({});
  const [rateCardId,    setRateCardId]    = useState(null);
  const [checklist,     setChecklist]     = useState(emptyChecklist);

  // Materials list state
  const [materials,      setMaterials]     = useState([]);
  const [libraryItems,   setLibraryItems]  = useState([]);
  const [currentRateCard, setCurrentRateCard] = useState(null);
  const [importing,      setImporting]     = useState(null); // 'radiators' | 'pipe'

  // UI state
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // ── Load on mount ──
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Load quote + materials + library + rate card in parallel
        const [quoteData, materialsData, libraryData, rateCardData] = await Promise.all([
          api.getQuote(project.id),
          api.getMaterials(project.id),
          api.getMaterialsLibrary().catch(() => []),
          api.getCurrentLabourRateCard().catch(() => null),
        ]);

        let quote = quoteData;
        if (!quote) {
          quote = await api.createQuote(project.id, { preparedBy: project.designer || '' });
        }

        setQuoteId(quote.id);
        setReference(quote.reference || '');
        setPreparedBy(quote.prepared_by || project.designer || '');
        setSurveyBasis(quote.survey_basis || 'full');
        setValidDays(quote.valid_days || 30);
        setVatRate(0);
        setDepositAmount(quote.deposit_amount || 0);
        setAdvanceAmount(quote.advance_amount || 0);
        setHourlyRate(quote.hourly_rate || 0);
        setMarkupPct(quote.markup_pct || 0);
        setRateCardId(quote.rate_card_id || null);

        // Parse category_overrides — null means auto (materials + markup)
        const overrides = {};
        if (quote.category_overrides) {
          const raw = typeof quote.category_overrides === 'string'
            ? JSON.parse(quote.category_overrides)
            : quote.category_overrides;
          CATEGORIES.forEach(cat => {
            overrides[cat.key] = raw[cat.key] !== undefined ? raw[cat.key] : null;
          });
        } else {
          CATEGORIES.forEach(cat => { overrides[cat.key] = null; });
        }
        setCategoryOverrides(overrides);

        if (quote.notes) {
          try { setChecklist(JSON.parse(quote.notes)); } catch { /* keep default */ }
        }

        setMaterials(Array.isArray(materialsData) ? materialsData : []);
        setLibraryItems(Array.isArray(libraryData) ? libraryData : []);

        // Store the full rate card object for the UI pickers
        if (rateCardData) {
          setCurrentRateCard(rateCardData);
          // If this quote has no rate card recorded yet, link it to the current one
          if (!quote.rate_card_id && rateCardData.id) {
            setRateCardId(rateCardData.id);
          }
        }
      } catch (err) {
        console.error('Error loading quote:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [project.id]);

  // ── Autosave (debounced, 1.5s) ──
  const save = useCallback(async () => {
    if (!quoteId) return;
    setSaving(true);
    try {
      // Compute totals from current state for storage
      const rows = CATEGORIES.map(cat => {
        const materialsTotal = categorySubtotal(materials, cat.key);
        const withMarkup     = materialsTotal * (1 + markupPct / 100);
        const override       = categoryOverrides[cat.key];
        return override !== null && override !== undefined ? override : withMarkup;
      });
      const totalExVat  = rows.reduce((s, v) => s + v, 0);
      const vatAmount   = totalExVat * (vatRate / 100);
      const totalIncVat = totalExVat + vatAmount;
      const busGrantAmt = project.busGrantStatus !== 'not_applicable'
        ? (project.busGrantAmount || 0) : 0;
      const clientPays  = Math.max(0, totalIncVat - busGrantAmt);

      // Build category_overrides object — only store non-null overrides
      const overridesForSave = {};
      CATEGORIES.forEach(cat => {
        overridesForSave[cat.key] = categoryOverrides[cat.key] ?? null;
      });

      await api.updateQuote(quoteId, {
        status:             'draft',
        surveyBasis,
        preparedBy,
        validDays,
        totalExVat,
        vatAmount,
        totalIncVat,
        busGrant:           busGrantAmt,
        clientPays,
        depositAmount,
        advanceAmount,
        hourlyRate,
        checklist,
        markupPct,
        categoryOverrides:  overridesForSave,
        rateCardId,
      });
      setLastSaved(new Date());
    } catch (err) {
      console.error('Autosave failed:', err);
    } finally {
      setSaving(false);
    }
  }, [
    quoteId, surveyBasis, preparedBy, validDays, vatRate,
    depositAmount, advanceAmount, hourlyRate, checklist, markupPct,
    categoryOverrides, rateCardId, materials,
  ]);

  useEffect(() => {
    if (!quoteId || loading) return;
    const t = setTimeout(save, 1500);
    return () => clearTimeout(t);
  }, [save, quoteId, loading]);

  // ── Materials CRUD ──
  const handleAddItem = async (categoryKey) => {
    try {
      const result = await api.createMaterial(project.id, {
        parentCategory: categoryKey,
        description:    '',
        pricingMode:    'unit',
        unitLabel:      'each',
        quantity:       1,
        unitCost:       0,
        source:         'manual',
      });
      // Refresh materials list
      const updated = await api.getMaterials(project.id);
      setMaterials(Array.isArray(updated) ? updated : []);
    } catch (err) {
      console.error('Failed to add item:', err);
    }
  };

  const handleAddFromLibrary = async (categoryKey, libItem) => {
    try {
      await api.createMaterial(project.id, {
        parentCategory: categoryKey,
        description:    libItem.description,
        pricingMode:    libItem.pricing_mode,
        unitLabel:      libItem.unit_label,
        quantity:       1,
        unitCost:       libItem.default_unit_cost,
        source:         'library',
        libraryItemId:  libItem.id,
      });
      const updated = await api.getMaterials(project.id);
      setMaterials(Array.isArray(updated) ? updated : []);
    } catch (err) {
      console.error('Failed to add from library:', err);
    }
  };

  // Add a standard task or day/hourly rate line from the rate card.
  // rateItem shape: { description, unit, rate } — from labour_rate_items rows,
  // or a synthetic { description: 'Day rate', unit: 'day', rate: card.day_rate }
  const handleAddFromRateCard = async (categoryKey, rateItem) => {
    try {
      const isTimeUnit = rateItem.unit === 'day' || rateItem.unit === 'hour';
      await api.createMaterial(project.id, {
        parentCategory: categoryKey,
        description:    rateItem.description,
        pricingMode:    'unit',
        unitLabel:      rateItem.unit === 'day'  ? 'day'
                      : rateItem.unit === 'hour' ? 'hr'
                      : 'each',
        quantity:       1,
        unitCost:       rateItem.rate || 0,
        source:         'manual', // rate card items are a starting point, not a locked reference
      });
      const updated = await api.getMaterials(project.id);
      setMaterials(Array.isArray(updated) ? updated : []);
    } catch (err) {
      console.error('Failed to add from rate card:', err);
    }
  };

  const handleUpdateItem = useCallback(async (id, patch) => {
    await api.updateMaterial(id, patch);
    // Update local state immediately so totals recalculate without a round-trip
    setMaterials(prev => prev.map(m => {
      if (m.id !== id) return m;
      const totalCost = patch.pricingMode === 'flat'
        ? (patch.unitCost || 0)
        : (patch.quantity || 0) * (patch.unitCost || 0);
      return { ...m, ...patch,
        parent_category: patch.parentCategory || m.parent_category,
        description:     patch.description    ?? m.description,
        pricing_mode:    patch.pricingMode     || m.pricing_mode,
        unit_label:      patch.unitLabel       ?? m.unit_label,
        quantity:        patch.quantity        ?? m.quantity,
        unit_cost:       patch.unitCost        ?? m.unit_cost,
        total_cost:      totalCost,
      };
    }));
  }, []);

  const handleDeleteItem = async (id) => {
    await api.deleteMaterial(id);
    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  const handleSaveToLibrary = async (item) => {
    try {
      await api.createMaterialsLibraryItem({
        categoryKey:     item.parent_category,
        description:     item.description,
        pricingMode:     item.pricing_mode,
        unitLabel:       item.unit_label,
        defaultUnitCost: item.unit_cost,
      });
      // Refresh library
      const lib = await api.getMaterialsLibrary().catch(() => []);
      setLibraryItems(Array.isArray(lib) ? lib : []);
    } catch (err) {
      console.error('Failed to save to library:', err);
    }
  };

  // ── Import ──
  const handleImportRadiators = async () => {
    setImporting('radiators');
    try {
      await api.importRadiators(project.id, 'radiators');
      const updated = await api.getMaterials(project.id);
      setMaterials(Array.isArray(updated) ? updated : []);
    } catch (err) {
      console.error('Import radiators failed:', err);
    } finally {
      setImporting(null);
    }
  };

  const handleImportPipeSections = async () => {
    setImporting('pipe');
    try {
      await api.importPipeSections(project.id, 'pipework');
      const updated = await api.getMaterials(project.id);
      setMaterials(Array.isArray(updated) ? updated : []);
    } catch (err) {
      console.error('Import pipe sections failed:', err);
    } finally {
      setImporting(null);
    }
  };

  // ── Category override helper ──
  const setCategoryOverride = useCallback((key, value) => {
    setCategoryOverrides(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Snapshot ──
  const handleSaveSnapshot = useCallback(async (label, note, triggeredBy) => {
    // Build snapshot data from current state
    const rows = CATEGORIES.map(cat => {
      const materialsTotal = categorySubtotal(materials, cat.key);
      const withMarkup     = materialsTotal * (1 + markupPct / 100);
      const override       = categoryOverrides[cat.key];
      return override !== null && override !== undefined ? override : withMarkup;
    });
    const totalExVat  = rows.reduce((s, v) => s + v, 0);
    const vatAmount   = totalExVat * (vatRate / 100);
    const totalIncVat = totalExVat + vatAmount;
    const busGrantAmt = project.busGrantStatus !== 'not_applicable'
      ? (project.busGrantAmount || 0) : 0;
    const clientPays  = Math.max(0, totalIncVat - busGrantAmt);

    const snapshotData = {
      quote: { reference, preparedBy, markupPct, surveyBasis, validDays },
      materials: materials.map(m => ({
        parent_category: m.parent_category,
        description:     m.description,
        pricing_mode:    m.pricing_mode,
        quantity:        m.quantity,
        unit_cost:       m.unit_cost,
        total_cost:      m.total_cost,
      })),
      categoryOverrides,
      rateCard: currentRateCard ? {
        id:             currentRateCard.id,
        effective_from: currentRateCard.effective_from,
        day_rate:       currentRateCard.day_rate,
        hourly_rate:    currentRateCard.hourly_rate,
      } : null,
      totals: {
        exVat:     totalExVat,
        vatAmount,
        incVat:    totalIncVat,
        busGrant:  busGrantAmt,
        clientPays,
      },
    };

    const result = await api.createQuoteSnapshot(quoteId, {
      versionLabel:  label,
      note,
      triggeredBy:   triggeredBy || 'manual',
      snapshotData,
    });
    return { ...result, version_label: label, note, triggered_by: triggeredBy, created_at: new Date().toISOString() };
  }, [quoteId, reference, preparedBy, markupPct, surveyBasis, validDays,
      materials, categoryOverrides, rateCardId, vatRate]);

  // ── New radiators in schedule — badge count ──
  const newRadiatorCount = project.rooms
    ? project.rooms.reduce((sum, room) =>
        sum + (room.radiatorSchedule || []).filter(rs => rs.emitter_status === 'new').length, 0)
    : 0;

  const importedRadiatorIds = new Set(
    materials.filter(m => m.source === 'radiator_schedule').map(m => m.source_id)
  );
  const unimportedRadiators = project.rooms
    ? project.rooms.reduce((sum, room) =>
        sum + (room.radiatorSchedule || []).filter(
          rs => rs.emitter_status === 'new' && !importedRadiatorIds.has(rs.id)
        ).length, 0)
    : 0;

  const pipeSectionCount = (project.pipeSections || []).length;
  const importedPipeIds  = new Set(
    materials.filter(m => m.source === 'pipe_sections').map(m => m.source_id)
  );
  const unimportedPipes  = (project.pipeSections || []).filter(
    s => !importedPipeIds.has(s.id)
  ).length;

  if (loading) {
    return <div className="text-gray-500 text-sm py-12 text-center">Loading quote...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Quote</h2>
          <div className="text-sm text-gray-500 mt-0.5">Ref: {reference}</div>
        </div>
        <div className="text-xs text-gray-400">
          {saving
            ? 'Saving...'
            : lastSaved
              ? `Saved ${lastSaved.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
        </div>
      </div>

      {/* Quote details */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Quote details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Prepared by</label>
            <input
              type="text"
              value={preparedBy}
              onChange={e => setPreparedBy(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Valid for (days)</label>
            <input
              type="number"
              value={validDays}
              onChange={e => setValidDays(parseInt(e.target.value) || 30)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Survey basis</label>
            <select
              value={surveyBasis}
              onChange={e => setSurveyBasis(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {SURVEY_BASIS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="text-xs text-gray-400 mt-1">
              RECC / MCS 3005 — state which journey applies on the quote document
            </div>
          </div>
        </div>
      </div>

      {/* ── MATERIALS LIST ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Materials list</h3>
            <div className="text-xs text-gray-400 mt-0.5">
              Internal cost breakdown — customer sees category totals only
            </div>
          </div>
          {/* Import controls */}
          <div className="flex items-center gap-2">
            {unimportedRadiators > 0 && (
              <button
                onClick={handleImportRadiators}
                disabled={importing === 'radiators'}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded px-3 py-1.5 font-medium transition disabled:opacity-50"
              >
                {importing === 'radiators'
                  ? 'Importing...'
                  : `Import ${unimportedRadiators} new radiator${unimportedRadiators !== 1 ? 's' : ''}`}
              </button>
            )}
            {unimportedPipes > 0 && (
              <button
                onClick={handleImportPipeSections}
                disabled={importing === 'pipe'}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded px-3 py-1.5 font-medium transition disabled:opacity-50"
              >
                {importing === 'pipe'
                  ? 'Importing...'
                  : `Import ${unimportedPipes} pipe section${unimportedPipes !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>

        {/* One section per category */}
        {CATEGORIES.map((cat, i) => (
          <MaterialsCategory
            key={cat.key}
            category={cat}
            items={materials}
            libraryItems={libraryItems}
            rateCard={currentRateCard}
            onAddItem={handleAddItem}
            onAddFromLibrary={handleAddFromLibrary}
            onAddFromRateCard={handleAddFromRateCard}
            onUpdate={handleUpdateItem}
            onDelete={handleDeleteItem}
            onSaveToLibrary={handleSaveToLibrary}
            defaultOpen={i === 0}
          />
        ))}
      </div>

      {/* ── QUOTE SUMMARY ── */}
      <QuoteSummary
        materials={materials}
        markupPct={markupPct}
        setMarkupPct={setMarkupPct}
        categoryOverrides={categoryOverrides}
        setCategoryOverride={setCategoryOverride}
        vatRate={vatRate}
        setVatRate={setVatRate}
        depositAmount={depositAmount}
        setDepositAmount={setDepositAmount}
        advanceAmount={advanceAmount}
        setAdvanceAmount={setAdvanceAmount}
        hourlyRate={hourlyRate}
        setHourlyRate={setHourlyRate}
        busGrant={project.busGrantStatus !== 'not_applicable' && project.busGrantStatus
          ? (project.busGrantAmount || 0)
          : 0}
      />

      {/* ── SNAPSHOT HISTORY ── */}
      <SnapshotHistory
        quoteId={quoteId}
        onSaveSnapshot={handleSaveSnapshot}
      />

      {/* ── RECC CHECKLIST ── */}
      <ReccChecklist
        checklist={checklist}
        setChecklist={setChecklist}
      />

    </div>
  );
}
