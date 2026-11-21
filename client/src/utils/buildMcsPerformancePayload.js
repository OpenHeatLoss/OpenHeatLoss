// client/src/utils/buildMcsPerformancePayload.js
//
// Payload for generate_mcs_performance_pdf.py — the MCS 031 Heat Pump System
// Performance Estimate. ONE builder for the three places that print it: the
// MCS 031 tab's "Export PDF", Emitter Sizing's customer pack and the quote
// pack. They used to build it separately and had drifted apart (the quote
// pack read systemProvides/emitterType from the live project fields and sent
// no calculation date; the customer pack sent only address line 1).
//
// Source of truth: the SAVED snapshot (project.mcsCalculationSnapshot). Every
// calculated figure and every input that produced it comes from the snapshot,
// so the document always shows what was calculated, never a mix of saved
// results and inputs edited since. Only identity fields (customer, address,
// designer) come from the live project.
//
// Returns null when there is no usable snapshot (no calculation saved, or no
// SPF) — callers leave the document out.

import { getPostcodePrefix } from './mcsData';

// 'hybrid' was removed from the MCS 031 tab (Simon, 21 Nov): a hybrid is
// outside the grant scheme and doesn't need MCS 031. It stays here only so an
// estimate saved before then prints what it was calculated as; the pack
// pre-flight check asks for it to be recalculated.
const SYSTEM_PROVIDES = {
  space_and_hw: 'Space heat and hot water',
  space_only:   'Space heating only',
  hybrid:       'Hybrid',
};

const EMITTER_TYPES = {
  existing_radiators: 'Existing radiators',
  upgraded_radiators: 'Mostly upgraded radiators',
  mostly_ufh:         'Mostly underfloor',
};

export function hasMcsPerformanceSnapshot(project) {
  const s = project?.mcsCalculationSnapshot;
  return !!(s && Number(s.spf) > 0);
}

export function buildMcsPerformancePayload(project) {
  if (!hasMcsPerformanceSnapshot(project)) return null;
  const s = project.mcsCalculationSnapshot;

  const calculatedAt = s.calculatedAt
    ? new Date(s.calculatedAt).toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';

  // Installation address. `project.location` was a legacy free-text field —
  // new projects set it to '' and nothing edits it — so the Location line
  // printed blank. Use the address, as the heat loss report and emitter
  // schedule do.
  const location = [project.customerAddressLine1, project.customerAddressLine2,
                    project.customerTown, project.customerPostcode].filter(Boolean).join(', ');

  return {
    projectName:       project.name              || 'Untitled Project',
    location,
    designer:          project.designer          || '',
    customerTitle:     project.customerTitle     || '',
    customerFirstName: project.customerFirstName || '',
    customerSurname:   project.customerSurname   || '',
    customerAddress:   [project.customerAddressLine1, project.customerAddressLine2,
                        project.customerTown, project.customerCounty, project.customerPostcode]
                         .filter(Boolean).join(', '),
    customerPostcode:  project.customerPostcode  || '',
    // The letters MCS 031 looks up degree days by — same rule as the calculation
    postcodePrefix:    getPostcodePrefix(project.customerPostcode) || '',
    customerTelephone: project.customerTelephone || '',
    customerEmail:     project.customerEmail     || '',
    calculatedAt,
    spaceHeatingDemand: s.spaceHeatingDemand,
    hotWaterDemand:     s.hotWaterDemand,
    totalFloorArea:     s.totalFloorArea,
    wattsPerM2:         s.wattsPerM2,
    heatPumpCapacity:   s.heatPumpCapacity,
    heatPumpType:       s.heatPumpType,
    systemProvides:     SYSTEM_PROVIDES[s.systemProvides] || '\u2014',
    emitterType:        EMITTER_TYPES[s.emitterType]      || '50% radiators, 50% UFH',
    flowTempBand:       s.flowTempBand,
    spf:                s.spf,
    lowEstimate:        s.lowEstimate,
    highEstimate:       s.highEstimate,
    stars:              s.stars,
    warningNotes:       s.warningNotes,
    // Where the annual demand came from. 'epc' for snapshots saved before
    // the no-EPC route existed. Appendix A carries its method statement,
    // which MCS 031 requires to be described and justified on the estimate.
    demandRoute:        s.demandRoute === 'appendix_a' ? 'appendix_a' : 'epc',
    appendixA:          s.demandRoute === 'appendix_a' ? (s.appendixA || null) : null,
  };
}
