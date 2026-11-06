// client/test/mvhrEfficiency.test.mjs
//
// B26 commit 2: the shared MVHR efficiency percent helper. Engineers type a
// percentage; the app stores and calculates with a fraction. Run with
// `npm test` in client/.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MVHR_EFF_WARN_LOW, MVHR_EFF_WARN_HIGH,
  parseEfficiencyPercentInput, fractionToPercentText, shouldSaveEfficiency,
} from '../src/utils/mvhrEfficiency.js';

const ERR_BLANK    = 'Enter the heat recovery efficiency as a percentage, e.g. 85.';
const ERR_NAN      = 'Enter a number, e.g. 85.';
const ERR_FRACTION = 'This looks like a fraction. Enter as a percentage, e.g. 85 for 0.85.';
const ERR_RANGE    = 'Efficiency must be between 0 and 100 %.';
const WARN         = "Unusual value: most MVHR units are 75-90 %. Check the manufacturer's data.";

// ---------------------------------------------------------------------------
// parseEfficiencyPercentInput
// ---------------------------------------------------------------------------

test('warning thresholds', () => {
  assert.equal(MVHR_EFF_WARN_LOW, 50);
  assert.equal(MVHR_EFF_WARN_HIGH, 95);
});

test('parse: "85" is 0.85 with no warning; surrounding whitespace ignored', () => {
  assert.deepEqual(parseEfficiencyPercentInput('85'),     { ok: true, fraction: 0.85, warning: null });
  assert.deepEqual(parseEfficiencyPercentInput('  85 '),  { ok: true, fraction: 0.85, warning: null });
  assert.deepEqual(parseEfficiencyPercentInput('82.5'),   { ok: true, fraction: 0.825, warning: null });
  assert.deepEqual(parseEfficiencyPercentInput(85),       { ok: true, fraction: 0.85, warning: null });
});

test('parse: round trip 0.85 → "85" → 0.85', () => {
  const text = fractionToPercentText(0.85);
  assert.equal(text, '85');
  assert.deepEqual(parseEfficiencyPercentInput(text), { ok: true, fraction: 0.85, warning: null });
});

test('parse: values between 0 and 1 are rejected as fractions', () => {
  assert.deepEqual(parseEfficiencyPercentInput('0.85'), { ok: false, error: ERR_FRACTION });
  assert.deepEqual(parseEfficiencyPercentInput('0.5'),  { ok: false, error: ERR_FRACTION });
  assert.deepEqual(parseEfficiencyPercentInput('0.99'), { ok: false, error: ERR_FRACTION });
});

test('parse: "1" is accepted as 0.01 with the low warning', () => {
  assert.deepEqual(parseEfficiencyPercentInput('1'), { ok: true, fraction: 0.01, warning: WARN });
});

test('parse: "0" is accepted with no warning (MVHR with no recovery)', () => {
  assert.deepEqual(parseEfficiencyPercentInput('0'),  { ok: true, fraction: 0, warning: null });
  const negZero = parseEfficiencyPercentInput('-0');
  assert.deepEqual(negZero, { ok: true, fraction: 0, warning: null });
  assert.ok(Object.is(negZero.fraction, 0), '-0 must store 0, not -0');
});

test('parse: "100" is accepted with the high warning', () => {
  assert.deepEqual(parseEfficiencyPercentInput('100'), { ok: true, fraction: 1, warning: WARN });
});

test('parse: warning boundaries are exclusive (50 and 95 are not unusual)', () => {
  assert.equal(parseEfficiencyPercentInput('49.9').warning, WARN);
  assert.equal(parseEfficiencyPercentInput('50').warning, null);
  assert.equal(parseEfficiencyPercentInput('95').warning, null);
  assert.equal(parseEfficiencyPercentInput('95.1').warning, WARN);
});

test('parse: over 100 or negative is rejected', () => {
  assert.deepEqual(parseEfficiencyPercentInput('101'),    { ok: false, error: ERR_RANGE });
  assert.deepEqual(parseEfficiencyPercentInput('100.01'), { ok: false, error: ERR_RANGE });
  assert.deepEqual(parseEfficiencyPercentInput('-5'),     { ok: false, error: ERR_RANGE });
  assert.deepEqual(parseEfficiencyPercentInput('-0.5'),   { ok: false, error: ERR_RANGE });
});

test('parse: blank and non-numbers are rejected', () => {
  assert.deepEqual(parseEfficiencyPercentInput(''),        { ok: false, error: ERR_BLANK });
  assert.deepEqual(parseEfficiencyPercentInput('   '),     { ok: false, error: ERR_BLANK });
  assert.deepEqual(parseEfficiencyPercentInput(null),      { ok: false, error: ERR_BLANK });
  assert.deepEqual(parseEfficiencyPercentInput(undefined), { ok: false, error: ERR_BLANK });
  assert.deepEqual(parseEfficiencyPercentInput('abc'),     { ok: false, error: ERR_NAN });
  assert.deepEqual(parseEfficiencyPercentInput('85%'),     { ok: false, error: ERR_NAN });
  assert.deepEqual(parseEfficiencyPercentInput('Infinity'),{ ok: false, error: ERR_NAN });
});

// ---------------------------------------------------------------------------
// fractionToPercentText
// ---------------------------------------------------------------------------

test('fractionToPercentText: 1 dp, trailing ".0" dropped, no float noise', () => {
  assert.equal(fractionToPercentText(0.85),   '85');
  assert.equal(fractionToPercentText(0.825),  '82.5');
  assert.equal(fractionToPercentText(0.8333), '83.3');
  assert.equal(fractionToPercentText(0.82),   '82');
  assert.equal(fractionToPercentText(0.07),   '7');      // 0.07 * 100 = 7.000000000000001
  assert.equal(fractionToPercentText(0.29),   '29');     // 0.29 * 100 = 28.999999999999996
  assert.equal(fractionToPercentText(1),      '100');
  assert.equal(fractionToPercentText(0),      '0');
  assert.equal(fractionToPercentText(-0),     '0');
});

test('fractionToPercentText: null/undefined (and non-finite) display as blank', () => {
  assert.equal(fractionToPercentText(null),      '');
  assert.equal(fractionToPercentText(undefined), '');
  assert.equal(fractionToPercentText(NaN),       '');
});

test('fractionToPercentText: a B26 bad row (85 stored) shows as an obviously wrong "8500"', () => {
  assert.equal(fractionToPercentText(85), '8500');
});

// ---------------------------------------------------------------------------
// shouldSaveEfficiency
// ---------------------------------------------------------------------------

test('shouldSaveEfficiency: unchanged display text does not save', () => {
  assert.equal(shouldSaveEfficiency('83.3', 0.8333), false);   // 0.8333 is not rewritten as 0.833
  assert.equal(shouldSaveEfficiency(' 83.3 ', 0.8333), false);
  assert.equal(shouldSaveEfficiency('85', 0.85), false);
  assert.equal(shouldSaveEfficiency('', null), false);
});

test('shouldSaveEfficiency: changed text saves', () => {
  assert.equal(shouldSaveEfficiency('85', 0.8333), true);
  assert.equal(shouldSaveEfficiency('85', null), true);
  assert.equal(shouldSaveEfficiency('', 0.85), true);
});
