// server/validation.js
//
// Pure request-body checks, kept out of server.js so they can be tested
// without loading the server, .env or the database.

// Client-facing. Engineers type a percentage, so this must not talk about
// fractions; the received value goes to the server log instead (see the
// routes in server.js).
const MVHR_EFFICIENCY_MESSAGE =
  'MVHR efficiency was not saved: the value received was not valid. ' +
  'Reload the page and enter the efficiency as a percentage, e.g. 85.';

/**
 * B26 backstop: MVHR efficiency is stored as a FRACTION (0.85, not 85).
 * The client converts from the percentage the engineer types and always sends
 * a JSON number; this rejects anything else (strings, booleans, arrays) and
 * any number outside 0..1 inclusive.
 *
 * Returns MVHR_EFFICIENCY_MESSAGE, or null when the value is acceptable or absent.
 */
const mvhrEfficiencyError = (body) => {
  const value = body?.mvhrEfficiency;
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return MVHR_EFFICIENCY_MESSAGE;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Design flow/return temperatures (2026-11)
//
// A flow/return ΔT of zero or less is physically impossible for a heating
// circuit, but the emitter maths still returns numbers (equal temps give
// MWT = flow; a return above the flow raises the MWT above the flow), so a
// bad pair silently overstates radiator output. Production had 18 such rows
// (mostly a lowered flow left against the default 40 °C return).
//
// MIN must match MIN_DT in client RadiatorSizing.jsx.
// ---------------------------------------------------------------------------
const FLOW_RETURN_MIN_DT = 1; // K

const FLOW_RETURN_MESSAGE =
  'Design flow and return temperatures were not saved: the return must be at ' +
  `least ${FLOW_RETURN_MIN_DT} K below the flow. Reload the page and correct them ` +
  'on the Emitter Sizing tab.';

const isValidFlowReturnPair = (flow, ret) =>
  typeof flow === 'number' && Number.isFinite(flow) &&
  typeof ret  === 'number' && Number.isFinite(ret)  &&
  flow - ret >= FLOW_RETURN_MIN_DT;

/**
 * Backstop for PUT design-params. Rejects an INVALID pair only when it is
 * NEW, i.e. differs from what is already stored.
 *
 * Why not reject every invalid pair: every design-params save (Summary, MCS,
 * SCOP, ventilation…) sends the whole record via buildDesignParamsPayload,
 * including the stored flow/return. Rejecting existing bad rows would block
 * those projects from saving anything until the pair is fixed — the same trap
 * B26 avoided by fixing data first. Bad rows are left to the engineer to
 * correct (the client shows a red error on the Emitter Sizing tab).
 *
 * @param body   request body (camelCase, from buildDesignParamsPayload)
 * @param stored the current design_params row (snake_case) or null
 * @returns FLOW_RETURN_MESSAGE, or null when acceptable or absent
 */
const flowReturnError = (body, stored) => {
  const flow = body?.designFlowTemp;
  const ret  = body?.designReturnTemp;
  // Absent from the body: nothing to check. (Note: designParams.update would
  // write NULL for an absent field — see BACKLOG "replace the whole record".)
  if (flow === undefined && ret === undefined) return null;

  if (isValidFlowReturnPair(flow, ret)) return null;

  // Invalid — allowed only if unchanged from the stored pair. JSON null and
  // DB NULL compare equal here; numbers compare exactly (both come from the
  // same stored double, round-tripped through JSON).
  const same = (a, b) => (a ?? null) === (b ?? null);
  if (stored && same(flow, stored.design_flow_temp) && same(ret, stored.design_return_temp)) {
    return null;
  }
  return FLOW_RETURN_MESSAGE;
};

module.exports = {
  mvhrEfficiencyError, MVHR_EFFICIENCY_MESSAGE,
  flowReturnError, FLOW_RETURN_MESSAGE, FLOW_RETURN_MIN_DT,
};
