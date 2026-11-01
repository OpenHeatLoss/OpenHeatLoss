// client/src/utils/mvhrEfficiency.js
//
// B26: the ONE place MVHR heat recovery efficiency is converted between what
// the engineer types (a percentage, e.g. 85) and what is stored and used by
// en12831Calculations.js (a fraction, e.g. 0.85). Nothing else in the app may
// multiply or divide efficiency by 100.

export const MVHR_EFF_WARN_LOW = 50;    // percent
export const MVHR_EFF_WARN_HIGH = 95;   // percent

const UNUSUAL_WARNING = "Unusual value: most MVHR units are 75-90 %. Check the manufacturer's data.";

/**
 * Parse a typed efficiency percentage.
 * Returns { ok: true, fraction, warning } (warning is a string or null)
 * or { ok: false, error }.
 */
export const parseEfficiencyPercentInput = (text) => {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter the heat recovery efficiency as a percentage, e.g. 85.' };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Enter a number, e.g. 85.' };
  }
  // MVHR with no recovery is allowed. Literal 0 so "-0" never stores -0.
  if (value === 0) {
    return { ok: true, fraction: 0, warning: null };
  }
  if (value > 0 && value < 1) {
    return { ok: false, error: 'This looks like a fraction. Enter as a percentage, e.g. 85 for 0.85.' };
  }
  if (value < 0 || value > 100) {
    return { ok: false, error: 'Efficiency must be between 0 and 100 %.' };
  }
  const warning = (value < MVHR_EFF_WARN_LOW || value > MVHR_EFF_WARN_HIGH) ? UNUSUAL_WARNING : null;
  return { ok: true, fraction: value / 100, warning };
};

/**
 * Format a stored fraction as percentage text, for DISPLAY only; never feed
 * the result back into a save. 1 dp, trailing ".0" dropped:
 * 0.85 → "85", 0.825 → "82.5", 0.8333 → "83.3", 0 → "0".
 * null/undefined (and anything non-finite) → ''.
 */
export const fractionToPercentText = (fraction) => {
  if (fraction === null || fraction === undefined) return '';
  const n = Number(fraction);
  if (!Number.isFinite(n)) return '';
  // Round to an integer number of tenths, then divide: n/10 for an integer
  // prints as its shortest form, so no 82.00000000000001 noise.
  const tenths = Math.round(n * 1000);
  return String(tenths / 10 || 0);   // `|| 0` turns -0 into 0
};

/**
 * False when the field still shows exactly what fractionToPercentText
 * displayed for the stored value, i.e. the engineer didn't change it. Stops a
 * stored 0.8333 being rewritten as 0.833 on focus and blur.
 */
export const shouldSaveEfficiency = (text, storedFraction) =>
  String(text ?? '').trim() !== fractionToPercentText(storedFraction);
