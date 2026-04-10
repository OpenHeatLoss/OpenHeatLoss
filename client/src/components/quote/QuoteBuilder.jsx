// client/src/components/quote/QuoteBuilder.jsx
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';

// Fixed line item categories — always present, amount can be zero
const FIXED_ITEMS = [
  { key: 'heat_pump',    description: 'Heat pump unit',           itemType: 'goods'   },
  { key: 'cylinder',     description: 'Cylinder',                 itemType: 'goods'   },
  { key: 'radiators',    description: 'Radiators / emitters',     itemType: 'goods'   },
  { key: 'materials',    description: 'Other materials',          itemType: 'goods'   },
  { key: 'labour',       description: 'Labour',                   itemType: 'labour'  },
  { key: 'electrical',   description: 'Electrical works',         itemType: 'labour'  },
  { key: 'design',       description: 'Design / survey fee',      itemType: 'labour'  },
  { key: 'mcs',          description: 'MCS registration',         itemType: 'labour'  },
];

const BUS_GRANT = 7500;

const VAT_OPTIONS = [
  { value: 0,  label: '0% — domestic heat pump installation' },
  { value: 5,  label: '5%' },
  { value: 20, label: '20%' },
];

const SURVEY_BASIS_OPTIONS = [
  { value: 'full',  label: 'Full site survey completed — Consumer Journey 1' },
  { value: 'prelim', label: 'Preliminary visit only — Consumer Journey 2' },
];

// RECC compliance checklist sections (ported from the HTML tool)
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
      { t: 'Planning permission — client\'s responsibility stated clearly', recc: true },
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
      { t: 'Your company\'s complaints procedure included', recc: true },
    ],
  },
];

// Build a fresh checklist state object (all unchecked, no notes)
function emptyChecklist() {
  const checks = {};
  const notes  = {};
  CHECKLIST_SECTIONS.forEach(sec => {
    sec.items.forEach((_, i) => { checks[`${sec.id}_${i}`] = false; });
    notes[sec.id] = '';
  });
  return { checks, notes };
}

// Build initial line items array from FIXED_ITEMS
function buildDefaultItems() {
  return FIXED_ITEMS.map(fi => ({
    key:         fi.key,
    description: fi.description,
    itemType:    fi.itemType,
    unitPrice:   0,
    quantity:    1,
    totalPrice:  0,
    isFixed:     true,
  }));
}

// Map saved quote_items rows back onto the fixed + custom structure
function mergeItemsFromDB(dbItems) {
  const fixed = buildDefaultItems();

  // Overlay saved values onto fixed items by description match
  fixed.forEach(fi => {
    const saved = dbItems.find(
      d => d.description === fi.description && d.item_type === fi.itemType
    );
    if (saved) {
      fi.unitPrice  = saved.unit_price  || 0;
      fi.totalPrice = saved.total_price || 0;
    }
  });

  // Any items that don't match a fixed key are custom lines
  const fixedDescriptions = FIXED_ITEMS.map(f => f.description);
  const customItems = dbItems
    .filter(d => !fixedDescriptions.includes(d.description))
    .map(d => ({
      key:         `custom_${d.id}`,
      description: d.description,
      itemType:    d.item_type || 'goods',
      unitPrice:   d.unit_price  || 0,
      quantity:    d.quantity    || 1,
      totalPrice:  d.total_price || 0,
      isFixed:     false,
    }));

  return [...fixed, ...customItems];
}

// ─── Main component ───────────────────────────────────────────

export default function QuoteBuilder({ project }) {
  const [quoteId,      setQuoteId]      = useState(null);
  const [reference,    setReference]    = useState('');
  const [preparedBy,   setPreparedBy]   = useState('');
  const [surveyBasis,  setSurveyBasis]  = useState('full');
  const [validDays,    setValidDays]    = useState(30);
  const [vatRate,      setVatRate]      = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [hourlyRate,   setHourlyRate]   = useState(0);
  const [items,        setItems]        = useState(buildDefaultItems);
  const [checklist,    setChecklist]    = useState(emptyChecklist);
  const [openSections, setOpenSections] = useState({});
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [lastSaved,    setLastSaved]    = useState(null);

  // ── Load or create quote on mount ──
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        let quote = await api.getQuote(project.id);

        if (!quote) {
          // No quote yet — create one
          quote = await api.createQuote(project.id, {
            preparedBy: project.designer || '',
          });
        }

        setQuoteId(quote.id);
        setReference(quote.reference || '');
        setPreparedBy(quote.prepared_by || project.designer || '');
        setSurveyBasis(quote.survey_basis || 'full');
        setValidDays(quote.valid_days || 30);
        setVatRate(0); // recalculate from items rather than storing

        if (quote.items && quote.items.length > 0) {
          setItems(mergeItemsFromDB(quote.items));
        }

        if (quote.checklist) {
          setChecklist(quote.checklist);
        }

        setDepositAmount(quote.deposit_amount || 0);
        setAdvanceAmount(0); // advance not stored separately yet
        setHourlyRate(quote.hourly_rate || 0);
      } catch (err) {
        console.error('Error loading quote:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [project.id]);

  // ── Pricing calculations ──
  const totalExVat  = items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
  const vatAmount   = totalExVat * (vatRate / 100);
  const totalIncVat = totalExVat + vatAmount;
  const clientPays  = Math.max(0, totalIncVat - BUS_GRANT);

  const max25Pct  = totalIncVat * 0.25;
  const max60Pct  = totalIncVat * 0.60;
  const depositPct = totalIncVat ? ((depositAmount / totalIncVat) * 100).toFixed(1) : 0;
  const combinedPct = totalIncVat ? (((depositAmount + advanceAmount) / totalIncVat) * 100).toFixed(1) : 0;

  // ── Autosave (debounced) ──
  const save = useCallback(async () => {
    if (!quoteId) return;
    setSaving(true);
    try {
      await Promise.all([
        api.updateQuote(quoteId, {
          status:        'draft',
          surveyBasis,
          preparedBy,
          validDays,
          totalExVat,
          vatAmount,
          totalIncVat,
          busGrant:      BUS_GRANT,
          clientPays,
          depositAmount,
          hourlyRate,
          checklist,
        }),
        api.updateQuoteItems(quoteId, items.map(i => ({
          description: i.description,
          itemType:    i.itemType,
          quantity:    i.quantity    || 1,
          unitPrice:   i.unitPrice   || 0,
          totalPrice:  i.totalPrice  || 0,
        }))),
      ]);
      setLastSaved(new Date());
    } catch (err) {
      console.error('Autosave failed:', err);
    } finally {
      setSaving(false);
    }
  }, [quoteId, surveyBasis, preparedBy, validDays, totalExVat, vatAmount,
      totalIncVat, clientPays, depositAmount, hourlyRate, checklist, items]);

  // Debounce: save 1.5s after last change
  useEffect(() => {
    if (!quoteId || loading) return;
    const t = setTimeout(save, 1500);
    return () => clearTimeout(t);
  }, [save, quoteId, loading]);

  // ── Item helpers ──
  const updateItem = (key, field, value) => {
    setItems(prev => prev.map(i => {
      if (i.key !== key) return i;
      const updated = { ...i, [field]: value };
      // Keep totalPrice in sync with unitPrice for simple items
      if (field === 'unitPrice') {
        updated.totalPrice = value * (updated.quantity || 1);
      }
      return updated;
    }));
  };

  const addCustomLine = () => {
    setItems(prev => [...prev, {
      key:         `custom_${Date.now()}`,
      description: '',
      itemType:    'goods',
      unitPrice:   0,
      quantity:    1,
      totalPrice:  0,
      isFixed:     false,
    }]);
  };

  const removeCustomLine = (key) => {
    setItems(prev => prev.filter(i => i.key !== key));
  };

  // ── Checklist helpers ──
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

  const totalChecks  = Object.keys(checklist.checks).length;
  const doneChecks   = Object.values(checklist.checks).filter(Boolean).length;
  const totalRecc    = CHECKLIST_SECTIONS.flatMap(s => s.items).filter(i => i.recc).length;
  const doneRecc     = CHECKLIST_SECTIONS.flatMap((s, _) =>
    s.items.filter((item, i) => item.recc && checklist.checks[`${s.id}_${i}`])
  ).length;

  // ── Deposit validation ──
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

  if (loading) {
    return <div className="text-gray-500 text-sm py-12 text-center">Loading quote...</div>;
  }

  // ── Render ──
  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header row — reference + autosave indicator */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Quote</h2>
          <div className="text-sm text-gray-500 mt-0.5">Ref: {reference}</div>
        </div>
        <div className="text-xs text-gray-400">
          {saving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
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
            <div className="text-xs text-gray-400 mt-1">RECC / MCS 3005 — state which journey applies on the quote document</div>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Pricing</h3>

        {/* Column headers */}
        <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 mb-2 px-1">
          <div className="col-span-5">Description</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2 text-right">Ex VAT £</div>
          <div className="col-span-2 text-right">Total £</div>
          <div className="col-span-1"></div>
        </div>

        <div className="space-y-1">
          {items.map(item => (
            <div key={item.key} className="grid grid-cols-12 gap-2 items-center">
              {item.isFixed ? (
                <div className="col-span-5 text-sm text-gray-700 py-1 px-1">{item.description}</div>
              ) : (
                <input
                  type="text"
                  value={item.description}
                  onChange={e => updateItem(item.key, 'description', e.target.value)}
                  placeholder="Description"
                  className="col-span-5 border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                />
              )}
              <div className="col-span-2">
                {item.isFixed ? (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    item.itemType === 'goods' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>{item.itemType}</span>
                ) : (
                  <select
                    value={item.itemType}
                    onChange={e => updateItem(item.key, 'itemType', e.target.value)}
                    className="w-full border border-gray-300 rounded px-1 py-1.5 text-xs focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="goods">Goods</option>
                    <option value="labour">Labour</option>
                  </select>
                )}
              </div>
              <input
                type="number"
                value={item.unitPrice || ''}
                onChange={e => updateItem(item.key, 'unitPrice', parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="col-span-2 border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-blue-500"
              />
              <div className="col-span-2 text-sm text-right text-gray-700 py-1 px-1">
                {(item.totalPrice || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="col-span-1 text-center">
                {!item.isFixed && (
                  <button
                    onClick={() => removeCustomLine(item.key)}
                    className="text-red-400 hover:text-red-600 text-lg leading-none"
                  >×</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addCustomLine}
          className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          + Add custom line
        </button>

        {/* VAT selector */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-4">
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
          <div className="flex justify-between text-sm text-green-700">
            <span>BUS grant (ASHP)</span>
            <span>− £{BUS_GRANT.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
          </div>
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
            depositMessage.type === 'warn'
              ? 'bg-amber-50 text-amber-800'
              : 'bg-green-50 text-green-800'
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

      {/* RECC checklist */}
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
          {/* Progress bar */}
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
                    sectionDone === section.items.length
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
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

    </div>
  );
}