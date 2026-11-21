// client/src/utils/designTemp.js
//
// External design temperature: where the figure came from, and when the
// postcode lookup may change it.
//
// The external design temperature is a design decision, not a property of the
// postcode. MCS 031's postcode table is one acceptable basis; CIBSE design
// temperatures for the nearest location are another (often less severe — e.g.
// Bath: MCS −4.6 °C vs CIBSE around −3 °C). So the basis is recorded with the
// figure (migration 031) and printed on the heat loss report, and the postcode
// lookup only drives the figure while the basis is the lookup.
//
// The lookup's own figures (mcsOutdoorLowTemp, mcsDegreeDays) are always kept
// up to date from the postcode — degree days feed MCS 031 whatever the design
// temperature basis is.

import { getMCSDataFromPostcode, getPostcodePrefix } from './mcsData';

export const EXTERNAL_TEMP_BASES = ['mcs031', 'cibse', 'other'];

export const EXTERNAL_TEMP_BASIS_LABELS = {
  mcs031: 'MCS 031 postcode lookup',
  cibse:  'CIBSE design temperature',
  other:  'Other',
};

// Value the project row is created with (App.jsx createNewProject, server
// default). A project still on it with no lookup and no basis has never had
// a design temperature chosen.
export const SEED_EXTERNAL_TEMP = -3;

// Postcode lookup applied? No MCS postcode area has a low temperature of 0,
// and 0 / null is what the column holds before the first lookup.
export function hasPostcodeLookup(project) {
  const t = project?.mcsOutdoorLowTemp;
  return t != null && t !== 0 && Number.isFinite(Number(t));
}

// The basis as recorded, or — for projects saved before migration 031 —
// inferred: a figure equal to the stored lookup value came from the lookup.
// Anything else unrecorded is null ("not recorded"), never guessed as CIBSE.
export function externalTempBasisOf(project) {
  const b = project?.externalTempBasis;
  if (EXTERNAL_TEMP_BASES.includes(b)) return b;
  if (hasPostcodeLookup(project)
      && Number(project.externalTemp) === Number(project.mcsOutdoorLowTemp)) {
    return 'mcs031';
  }
  return null;
}

// Fields to save after the installation postcode is set or changed.
// Always refreshes the lookup figures; changes the design temperature only
// when the lookup is its basis, or the project has never had one chosen.
// Returns null when the postcode is not in the MCS table.
export function postcodeLookupFields(project, postcode) {
  const mcs    = getMCSDataFromPostcode(postcode);
  const prefix = getPostcodePrefix(postcode);
  if (!mcs) return null;

  const fields = {
    mcsDegreeDays:     mcs.degreeDays,
    mcsOutdoorLowTemp: mcs.lowTemp,
    mcsPostcodePrefix: prefix,
  };

  const basis = externalTempBasisOf(project);
  const neverChosen = basis === null
    && !hasPostcodeLookup(project)
    && Number(project?.externalTemp ?? SEED_EXTERNAL_TEMP) === SEED_EXTERNAL_TEMP;

  if (basis === 'mcs031' || neverChosen) {
    Object.assign(fields, mcsBasisFields(mcs.lowTemp, prefix));
  }
  return fields;
}

// The fields that make the lookup the basis (also used by the basis select).
export function mcsBasisFields(lowTemp, prefix) {
  return {
    externalTemp:       lowTemp,
    externalTempBasis:  'mcs031',
    externalTempSource: prefix ? `Postcode area ${prefix}` : null,
  };
}

// One line for reports, e.g.
//   "MCS 031 postcode lookup — Postcode area BA"
//   "CIBSE design temperature — CIBSE DHDG 2026, Bath"
//   "Basis not recorded"
export function externalTempBasisText(project) {
  const basis  = externalTempBasisOf(project);
  const source = String(project?.externalTempSource ?? '').trim();
  if (!basis) return source ? source : 'Basis not recorded';
  const label = EXTERNAL_TEMP_BASIS_LABELS[basis];
  // Inferred legacy lookup with no stored source: name the area if known.
  if (basis === 'mcs031' && !source && project?.mcsPostcodePrefix) {
    return `${label} — Postcode area ${project.mcsPostcodePrefix}`;
  }
  return source ? `${label} — ${source}` : label;
}
