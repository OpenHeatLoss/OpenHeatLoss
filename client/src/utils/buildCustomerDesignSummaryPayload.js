// client/src/utils/buildCustomerDesignSummaryPayload.js
//
// Payload for generate_customer_design_summary_pdf.py — the one-page(ish)
// "Your heating system design" document that gives the customer the
// information MIS 3005-D 5.9.2 (a)–(g) requires in writing before
// installation.
//
// Used by: the Summary panel's download button, Emitter Sizing's customer
// pack and the quote pack. All three call this, so the document is the same
// wherever it is printed. The items come straight from buildCustomerDesignInfo
// — the same result the on-screen checklist shows.
//
// opts.system — live { flowTemp, returnTemp } (see buildCustomerDesignInfo).

import { buildCustomerDesignInfo } from './customerDesignInfo';
import {
  MCS_DESIGN_STANDARD, designStandardLabel, CUSTOMER_DESIGN_INFO_CLAUSE, MCS031_CALCULATOR,
} from './mcsClauses';

export function buildCustomerDesignSummaryPayload(project, opts = {}) {
  const { items, counts } = buildCustomerDesignInfo(project, opts);
  return {
    projectName:       project.name              || 'Untitled Project',
    designer:          project.designer          || '',
    customerTitle:     project.customerTitle     || '',
    customerFirstName: project.customerFirstName || '',
    customerSurname:   project.customerSurname   || '',
    // customerAddress omits postcode — shown separately, as in the other PDFs
    customerAddress:  [project.customerAddressLine1, project.customerAddressLine2,
                       project.customerTown].filter(Boolean).join(', '),
    customerPostcode:  project.customerPostcode  || '',
    externalTemp:      project.externalTemp      ?? -3,
    standard: {
      label:     designStandardLabel(),
      title:     MCS_DESIGN_STANDARD.title,
      published: MCS_DESIGN_STANDARD.published,
      clause:    CUSTOMER_DESIGN_INFO_CLAUSE,
    },
    mcs031Calculator: MCS031_CALCULATOR,
    counts,
    items,
  };
}

// For callers that print it inside a pack: true when every item is complete.
// Otherwise the caller asks the designer before printing "To be confirmed".
export const designSummaryIncomplete = (payload) =>
  payload.counts.missing + payload.counts.warning > 0;
