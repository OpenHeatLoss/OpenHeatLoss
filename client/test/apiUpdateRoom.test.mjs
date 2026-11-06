// client/test/apiUpdateRoom.test.mjs
//
// B26: api.updateRoom's return shape. Success is the parsed body as before;
// any non-OK status resolves with `error` + `status` (so `'error' in response`
// checks keep working), including a non-JSON error page. fetch is stubbed;
// nothing touches the network. Run with `npm test` in client/.

import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { api } from '../src/utils/api.js';

const realFetch = globalThis.fetch;
let warn;
beforeEach(() => { warn = mock.method(console, 'warn', () => {}); });   // keep test output quiet
afterEach(() => { globalThis.fetch = realFetch; mock.restoreAll(); });

const stub = (status, body, { json = true } = {}) => {
  globalThis.fetch = async () => new Response(
    json ? JSON.stringify(body) : body,
    { status, headers: { 'Content-Type': json ? 'application/json' : 'text/html' } },
  );
};

test('api.updateRoom: success returns the parsed body unchanged', async () => {
  stub(200, { id: 7, name: 'Lounge', mvhr_efficiency: 0.85 });
  assert.deepEqual(await api.updateRoom(7, {}), { id: 7, name: 'Lounge', mvhr_efficiency: 0.85 });
});

test('api.updateRoom: a JSON error keeps the server text and adds status', async () => {
  stub(400, { error: 'MVHR efficiency was not saved: …' });
  const r = await api.updateRoom(7, {});
  assert.deepEqual(r, { error: 'MVHR efficiency was not saved: …', status: 400 });
  assert.ok('error' in r);
});

test('api.updateRoom: 401 / 403 / 500 resolve with error and status', async () => {
  for (const [status, error] of [[401, 'Not authenticated'], [403, 'Not authorised'], [500, 'Failed to update room']]) {
    stub(status, { error });
    assert.deepEqual(await api.updateRoom(7, {}), { error, status });
  }
});

test('api.updateRoom: a non-JSON error page (502) resolves, not rejects', async () => {
  stub(502, '<html>Bad Gateway</html>', { json: false });
  assert.deepEqual(await api.updateRoom(7, {}), { error: 'Request failed (HTTP 502).', status: 502 });
});

test('api.updateRoom: an error body without usable error text still gets one', async () => {
  stub(500, { message: 'boom' });
  assert.deepEqual(await api.updateRoom(7, {}), { message: 'boom', error: 'Request failed (HTTP 500).', status: 500 });
  stub(400, { error: '   ' });
  assert.deepEqual(await api.updateRoom(7, {}), { error: 'Request failed (HTTP 400).', status: 400 });
});

test('api.updateRoom: a non-OK response logs method, url, status and error text, not the body', async () => {
  stub(403, { error: 'Not authorised' });
  await api.updateRoom(7, { name: 'secret-ish payload' });
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(warn.mock.calls[0].arguments, ['PUT /api/rooms/7 failed: HTTP 403:', 'Not authorised']);
  assert.doesNotMatch(JSON.stringify(warn.mock.calls[0].arguments), /secret-ish payload/);
});

test('api.updateRoom: success logs nothing', async () => {
  stub(200, { id: 7 });
  await api.updateRoom(7, {});
  assert.equal(warn.mock.callCount(), 0);
});

test('api.updateRoom: a network failure still rejects', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(api.updateRoom(7, {}), TypeError);
});
