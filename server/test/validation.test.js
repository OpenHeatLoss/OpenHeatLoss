// server/test/validation.test.js
//
// B26 commit 5: server-side backstop for MVHR efficiency (FRACTION units).
// Requires only ../validation.js, never server.js or database.js, so it
// loads no .env and opens no database connection. Run with `npm test` in server/.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mvhrEfficiencyError, MVHR_EFFICIENCY_MESSAGE } = require('../validation.js');

test('MVHR_EFFICIENCY_MESSAGE speaks in percent, not fractions', () => {
  assert.match(MVHR_EFFICIENCY_MESSAGE, /as a percentage, e\.g\. 85\./);
  assert.doesNotMatch(MVHR_EFFICIENCY_MESSAGE, /fraction/i);
});

test('mvhrEfficiencyError: numbers 0..1 inclusive are accepted', () => {
  for (const v of [0, 0.85, 1, 0.5]) {
    assert.equal(mvhrEfficiencyError({ mvhrEfficiency: v }), null, String(v));
  }
});

test('mvhrEfficiencyError: percentages and out-of-range numbers are rejected', () => {
  for (const v of [85, 80, 90, -0.1, 1.01, NaN, Infinity, -Infinity]) {
    assert.equal(mvhrEfficiencyError({ mvhrEfficiency: v }), MVHR_EFFICIENCY_MESSAGE, String(v));
  }
});

test('mvhrEfficiencyError: anything that is not a real number is rejected', () => {
  for (const v of ['abc', '0.85', '', ' ', true, false, [], [0.85], {}]) {
    assert.equal(mvhrEfficiencyError({ mvhrEfficiency: v }), MVHR_EFFICIENCY_MESSAGE, JSON.stringify(v));
  }
});

test('mvhrEfficiencyError: absent, undefined or null is ignored', () => {
  assert.equal(mvhrEfficiencyError({}), null);
  assert.equal(mvhrEfficiencyError({ mvhrEfficiency: undefined }), null);
  assert.equal(mvhrEfficiencyError({ mvhrEfficiency: null }), null);
  assert.equal(mvhrEfficiencyError(undefined), null);   // no body at all
});
