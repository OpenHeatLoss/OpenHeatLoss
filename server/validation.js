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

module.exports = { mvhrEfficiencyError, MVHR_EFFICIENCY_MESSAGE };
