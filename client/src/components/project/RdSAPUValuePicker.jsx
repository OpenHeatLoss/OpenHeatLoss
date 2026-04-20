// client/src/components/project/RdSAPUValuePicker.jsx
//
// Stepped picker that looks up U-values from the bundled RdSAP10 construction
// library (construction_library.json) and saves results into the project's
// U-value library via onSaveToLibrary.
//
// Region is auto-derived from project.customerPostcode using regionFromPostcode().
// Formula rows (solid brick / stone, age bands A–E) show a thickness input.
// All other rows return a fixed U-value immediately on selection.
//
// Props:
//   project          — full project object (needs customerPostcode)
//   onSaveToLibrary  — async ({ elementCategory, name, uValue, notes }) => void
//                      Same signature as FloorUValueCalculator's onSaveToLibrary.

import { useState, useMemo } from 'react';
import libraryData from '../../utils/construction_library.json';
import {
  regionFromPostcode,
  ageBandFromYear,
  solidBrickUValue,
  stoneGraniteUValue,
  stoneSandstoneUValue,
  AGE_BANDS,
  WALL_TYPE_LABELS,
  ROOF_TYPE_LABELS,
} from '../../utils/constructionLibrary';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ELEMENT_TYPE_OPTIONS = [
  { value: 'wall',          label: 'Wall' },
  { value: 'roof',          label: 'Roof' },
  { value: 'floor_exposed', label: 'Exposed / Semi-exposed Floor' },
];

const REGION_LABELS = {
  england:  'England',
  scotland: 'Scotland',
  wales:    'Wales',
  ni:       'Northern Ireland',
  iom:      'Isle of Man',
};

// Maps RdSAP element_type + wall_type/roof_type to the app's ELEMENT_TYPES
// (the element_category stored on each u_value_library row).
function toElementCategory(record) {
  if (record.element_type === 'roof') {
    if (record.roof_type === 'room_in_roof') return 'Roof Room';
    return 'Roof';
  }
  if (record.element_type === 'floor_exposed') return 'Floor';
  // wall
  return 'External Wall';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveUValue(record, thicknessMm) {
  if (!record.formula_type) return record.u_value;
  if (!thicknessMm) return null;
  switch (record.formula_type) {
    case 'brick_thickness':  return solidBrickUValue(thicknessMm);
    case 'stone_granite':    return stoneGraniteUValue(thicknessMm);
    case 'stone_sandstone':  return stoneSandstoneUValue(thicknessMm);
    default: return null;
  }
}

function getUValueColour(u) {
  if (u == null) return '#9ca3af';
  if (u <= 0.18) return '#16a34a';
  if (u <= 0.28) return '#65a30d';
  if (u <= 0.45) return '#ca8a04';
  if (u <= 1.0)  return '#ea580c';
  return '#dc2626';
}

// ---------------------------------------------------------------------------
// Shared style primitives — matches FloorUValueCalculator's inline style tokens
// ---------------------------------------------------------------------------
const sectionStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  marginBottom: 12,
  overflow: 'hidden',
};

const sectionHeaderStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #e5e7eb',
  fontWeight: 700,
  fontSize: 13,
  color: '#374151',
  background: '#f9fafb',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 5,
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
  background: '#fff',
};

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
};

const badgeStyle = (active) => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 99,
  fontSize: 11,
  fontWeight: 700,
  background: active ? '#1e3a5f' : '#f3f4f6',
  color: active ? '#fff' : '#6b7280',
  cursor: 'pointer',
  border: active ? '1px solid #1e3a5f' : '1px solid #e5e7eb',
  transition: 'all .12s',
});

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------
function StepDot({ n, active, done }) {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: '50%', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontSize: 11,
      fontWeight: 700, flexShrink: 0,
      background: done ? '#16a34a' : active ? '#1e3a5f' : '#e5e7eb',
      color: done || active ? '#fff' : '#9ca3af',
    }}>
      {done ? '✓' : n}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function RdSAPUValuePicker({ project, onSaveToLibrary }) {
  // --- Derived region from postcode ---
  const derivedRegion = useMemo(
    () => regionFromPostcode(project?.customerPostcode || ''),
    [project?.customerPostcode]
  );

  // --- Picker state ---
  const [elementType,  setElementType]  = useState('wall');
  const [region,       setRegion]       = useState(derivedRegion);
  const [ageBandMode,  setAgeBandMode]  = useState('band');   // 'band' | 'year'
  const [ageBand,      setAgeBand]      = useState('');
  const [buildYear,    setBuildYear]    = useState('');
  const [selectedRow,  setSelectedRow]  = useState(null);
  const [thicknessMm,  setThicknessMm]  = useState('');
  const [saveName,     setSaveName]     = useState('');
  const [saveSuccess,  setSaveSuccess]  = useState(false);

  // Resolve age band from year if in year mode
  const resolvedBand = ageBandMode === 'year'
    ? ageBandFromYear(parseInt(buildYear, 10))
    : ageBand;

  // --- Filtered library records ---
  const allRecords = useMemo(() => {
    const sections = {
      wall:          libraryData.walls          ?? [],
      roof:          libraryData.roofs          ?? [],
      floor_exposed: libraryData.floors_exposed ?? [],
    };
    return (sections[elementType] ?? []).filter(r => !('_comment' in r));
  }, [elementType]);

  const filteredRecords = useMemo(() => {
    if (!resolvedBand && elementType !== 'roof') return [];
    return allRecords.filter(r => {
      if (!r.regions?.includes(region)) return false;
      // Roof rows keyed by insulation_mm have null age_bands — always show them
      if (r.age_bands === null) return true;
      if (resolvedBand && !r.age_bands?.includes(resolvedBand)) return false;
      return true;
    });
  }, [allRecords, region, resolvedBand, elementType]);

  // Group wall records by wall_type for cleaner display
  const groupedWalls = useMemo(() => {
    if (elementType !== 'wall') return null;
    const groups = {};
    for (const r of filteredRecords) {
      const key = r.wall_type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [filteredRecords, elementType]);

  // Group roof records by roof_type
  const groupedRoofs = useMemo(() => {
    if (elementType !== 'roof') return null;
    const groups = {};
    for (const r of filteredRecords) {
      const key = r.roof_type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [filteredRecords, elementType]);

  const resolvedUValue = selectedRow
    ? resolveUValue(selectedRow, thicknessMm ? parseFloat(thicknessMm) : null)
    : null;

  const needsThickness = selectedRow?.formula_type != null;

  // Reset selection when filters change
  const resetSelection = () => {
    setSelectedRow(null);
    setThicknessMm('');
    setSaveName('');
    setSaveSuccess(false);
  };

  const handleElementTypeChange = (v) => { setElementType(v); resetSelection(); };
  const handleRegionChange      = (v) => { setRegion(v);      resetSelection(); };
  const handleAgeBandChange     = (v) => { setAgeBand(v);     resetSelection(); };
  const handleBuildYearChange   = (v) => { setBuildYear(v);   resetSelection(); };
  const handleSelectRow         = (r) => {
    setSelectedRow(r);
    setThicknessMm('');
    setSaveName(r.description);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!resolvedUValue || !saveName.trim()) return;
    await onSaveToLibrary({
      elementCategory: toElementCategory(selectedRow),
      name:    saveName.trim(),
      uValue:  parseFloat(resolvedUValue.toFixed(3)),
      notes:   `RdSAP10 ${selectedRow.source} · Band ${resolvedBand ?? '—'} · ${REGION_LABELS[region]}`,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const step1Done = true;
  const step2Done = !!resolvedBand || elementType === 'roof';
  const step3Done = !!selectedRow;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderWallOptions() {
    if (!groupedWalls) return null;
    if (Object.keys(groupedWalls).length === 0) {
      return (
        <p style={{ padding: 16, fontSize: 13, color: '#6b7280' }}>
          No records found for this region and age band.
        </p>
      );
    }
    return Object.entries(groupedWalls).map(([wallType, rows]) => (
      <div key={wallType} style={{ marginBottom: 8 }}>
        <div style={{ padding: '6px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
          {WALL_TYPE_LABELS[wallType] ?? wallType}
        </div>
        {rows.map((r, i) => {
          const isSelected = selectedRow === r;
          const displayU = r.formula_type ? null : r.u_value;
          return (
            <div
              key={i}
              onClick={() => handleSelectRow(r)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                background: isSelected ? '#eff6ff' : '#fff',
                borderLeft: isSelected ? '3px solid #1e3a5f' : '3px solid transparent',
                transition: 'all .1s',
              }}
            >
              <div style={{ fontSize: 13, color: '#374151', flex: 1 }}>
                {r.description}
                {r.notes && (
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>
                    {r.notes}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                {r.formula_type ? (
                  <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
                    enter thickness →
                  </span>
                ) : (
                  <>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color: '#1e3a5f' }}>
                      {displayU?.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>W/m²K</span>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: getUValueColour(displayU), flexShrink: 0 }} />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    ));
  }

  function renderRoofOptions() {
    if (!groupedRoofs) return null;

    // For roofs, age band is optional — show insulation-thickness rows always,
    // age-band default rows only when a band is selected.
    const thicknessRoofTypes = ['pitched_joists', 'pitched_rafters'];
    const defaultRoofTypes   = ['pitched_unknown', 'flat', 'room_in_roof'];

    const hasThicknessRows = Object.keys(groupedRoofs).some(k => thicknessRoofTypes.includes(k));
    const hasDefaultRows   = Object.keys(groupedRoofs).some(k => defaultRoofTypes.includes(k));

    if (!hasThicknessRows && !hasDefaultRows) {
      return <p style={{ padding: 16, fontSize: 13, color: '#6b7280' }}>Select an age band above to see default roof U-values, or browse the insulation-thickness tables below.</p>;
    }

    return Object.entries(groupedRoofs).map(([roofType, rows]) => (
      <div key={roofType} style={{ marginBottom: 8 }}>
        <div style={{ padding: '6px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
          {ROOF_TYPE_LABELS[roofType] ?? roofType}
        </div>
        {rows.map((r, i) => {
          const isSelected = selectedRow === r;
          return (
            <div
              key={i}
              onClick={() => handleSelectRow(r)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                background: isSelected ? '#eff6ff' : '#fff',
                borderLeft: isSelected ? '3px solid #1e3a5f' : '3px solid transparent',
                transition: 'all .1s',
              }}
            >
              <div style={{ fontSize: 13, color: '#374151', flex: 1 }}>
                {r.insulation_mm != null
                  ? `${r.insulation_mm}mm insulation`
                  : r.description}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color: '#1e3a5f' }}>
                  {r.u_value?.toFixed(2)}
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>W/m²K</span>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: getUValueColour(r.u_value), flexShrink: 0 }} />
              </div>
            </div>
          );
        })}
      </div>
    ));
  }

  function renderFloorOptions() {
    if (elementType !== 'floor_exposed') return null;
    if (filteredRecords.length === 0) {
      return <p style={{ padding: 16, fontSize: 13, color: '#6b7280' }}>No records found — select an age band above.</p>;
    }
    return filteredRecords.map((r, i) => {
      const isSelected = selectedRow === r;
      return (
        <div
          key={i}
          onClick={() => handleSelectRow(r)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
            background: isSelected ? '#eff6ff' : '#fff',
            borderLeft: isSelected ? '3px solid #1e3a5f' : '3px solid transparent',
            transition: 'all .1s',
          }}
        >
          <div style={{ fontSize: 13, color: '#374151' }}>{r.description}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color: '#1e3a5f' }}>
              {r.u_value?.toFixed(2)}
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>W/m²K</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: getUValueColour(r.u_value), flexShrink: 0 }} />
          </div>
        </div>
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Step 1: Element type + Region ── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <StepDot n={1} active={!step1Done} done={step1Done} />
          <span>Element type &amp; region</span>
        </div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Element type</label>
            <select style={selectStyle} value={elementType} onChange={e => handleElementTypeChange(e.target.value)}>
              {ELEMENT_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>
              Region
              {project?.customerPostcode && (
                <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, color: '#9ca3af' }}>
                  (from postcode: {project.customerPostcode.toUpperCase()})
                </span>
              )}
            </label>
            <select style={selectStyle} value={region} onChange={e => handleRegionChange(e.target.value)}>
              {Object.entries(REGION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Step 2: Age band ── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <StepDot n={2} active={!step2Done} done={step2Done} />
          <span>Age band</span>
          {elementType === 'roof' && (
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>
              — optional for roofs (insulation-thickness tables don't need it)
            </span>
          )}
        </div>
        <div style={{ padding: 16 }}>
          {/* Toggle: select by band or by year */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <span
              style={badgeStyle(ageBandMode === 'band')}
              onClick={() => setAgeBandMode('band')}
            >
              Select band
            </span>
            <span
              style={badgeStyle(ageBandMode === 'year')}
              onClick={() => setAgeBandMode('year')}
            >
              Enter build year
            </span>
          </div>

          {ageBandMode === 'year' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: '0 0 160px' }}>
                <label style={labelStyle}>Build year</label>
                <input
                  type="number"
                  min={1700} max={2030} step={1}
                  value={buildYear}
                  onChange={e => handleBuildYearChange(e.target.value)}
                  placeholder="e.g. 1967"
                  style={inputStyle}
                />
              </div>
              {resolvedBand && (
                <div style={{ paddingTop: 18, fontSize: 13, color: '#374151' }}>
                  → Age band <strong>{resolvedBand}</strong>
                  <span style={{ color: '#6b7280', marginLeft: 6 }}>
                    ({AGE_BANDS.find(b => b.band === resolvedBand)?.label})
                  </span>
                </div>
              )}
              {buildYear && !resolvedBand && (
                <div style={{ paddingTop: 18, fontSize: 13, color: '#ea580c' }}>
                  Year not recognised
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {AGE_BANDS.map(b => (
                <button
                  key={b.band}
                  onClick={() => handleAgeBandChange(b.band)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    border: ageBand === b.band ? '2px solid #1e3a5f' : '1px solid #d1d5db',
                    background: ageBand === b.band ? '#1e3a5f' : '#fff',
                    color: ageBand === b.band ? '#fff' : '#374151',
                    fontWeight: ageBand === b.band ? 700 : 400,
                    transition: 'all .1s',
                  }}
                >
                  <span style={{ fontWeight: 700, marginRight: 4 }}>{b.band}</span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>{b.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Step 3: Construction selection ── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <StepDot n={3} active={step2Done && !step3Done} done={step3Done} />
          <span>Select construction</span>
          {resolvedBand && (
            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 4 }}>
              Band {resolvedBand} · {REGION_LABELS[region]}
            </span>
          )}
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {elementType === 'wall'          && renderWallOptions()}
          {elementType === 'roof'          && renderRoofOptions()}
          {elementType === 'floor_exposed' && renderFloorOptions()}
        </div>
      </div>

      {/* ── Step 4: Thickness input (formula rows only) ── */}
      {needsThickness && selectedRow && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <StepDot n={4} active={!resolvedUValue} done={!!resolvedUValue} />
            <span>Wall thickness</span>
          </div>
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              {selectedRow.description_detail || 'Measure the wall thickness on site, including plaster on both sides.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: '0 0 160px' }}>
                <label style={labelStyle}>Wall thickness (mm)</label>
                <input
                  type="number"
                  min={100} max={800} step={10}
                  value={thicknessMm}
                  onChange={e => setThicknessMm(e.target.value)}
                  placeholder="e.g. 250"
                  style={inputStyle}
                />
              </div>
              {resolvedUValue != null && (
                <div style={{ paddingTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 28, color: '#1e3a5f' }}>
                    {resolvedUValue.toFixed(2)}
                  </span>
                  <div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>W/m²K</div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: getUValueColour(resolvedUValue), marginTop: 2 }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Result + Save ── */}
      {resolvedUValue != null && (
        <div style={{ background: '#fff', border: '2px solid #1e3a5f', borderRadius: 12, padding: 20, marginTop: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, alignItems: 'center' }}>
            {/* U-value display */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                U-Value
              </div>
              <div style={{ fontSize: 48, fontWeight: 700, color: '#1e3a5f', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                {resolvedUValue.toFixed(2)}
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>W/m²K</div>
              <div style={{ marginTop: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: getUValueColour(resolvedUValue), display: 'inline-block', marginRight: 6 }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>{selectedRow.source}</span>
              </div>
            </div>

            {/* Save panel */}
            <div>
              <label style={labelStyle}>Construction name (for your library)</label>
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="e.g. Cavity wall, unfilled, 1970s"
                style={{ ...inputStyle, marginBottom: 10, fontFamily: "'DM Mono', monospace" }}
              />
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                style={{
                  padding: '9px 24px', background: saveName.trim() ? '#1e3a5f' : '#9ca3af',
                  color: '#fff', border: 'none', borderRadius: 6, fontSize: 14,
                  fontWeight: 700, cursor: saveName.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background .15s',
                }}
              >
                {saveSuccess ? '✓ Saved to library!' : 'Save to library'}
              </button>
              {saveSuccess && (
                <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginLeft: 12 }}>
                  Scroll up to see it
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
        U-values per RdSAP10 Specification (9 June 2025) · Tables 6–10, 12–13, 16, 18, 20
      </div>
    </div>
  );
}
