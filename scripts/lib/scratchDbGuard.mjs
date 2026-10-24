// scripts/lib/scratchDbGuard.mjs
//
// Safety guard shared by every B25 script. Refuses to run unless DATABASE_URL
// points at the local scratch database ohl_b25_check. Checked twice:
//   1. Before connecting — parse the URL itself.
//   2. After connecting — ask Postgres which database we actually landed on,
//      so a libpq override (PGHOST, ?host=, service files) cannot redirect us.
//
// Never reads .env. DATABASE_URL must already be set in the environment.

import { createRequire } from 'node:module';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const pg = require('pg');

export const SCRATCH_DB = 'ohl_b25_check';

const refuse = (why) => {
  console.error(`REFUSING TO RUN: ${why}`);
  console.error(`This script only runs against postgres://localhost/${SCRATCH_DB}.`);
  process.exit(1);
};

export const assertScratchUrl = () => {
  const raw = process.env.DATABASE_URL;
  if (!raw) refuse('DATABASE_URL is not set.');

  let url;
  try { url = new URL(raw); } catch { refuse('DATABASE_URL is not a valid URL.'); }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) refuse(`unexpected protocol ${url.protocol}`);
  if (url.hostname !== 'localhost') refuse(`host is "${url.hostname}", not localhost.`);
  if (decodeURIComponent(url.pathname) !== `/${SCRATCH_DB}`) refuse('database name is not ' + SCRATCH_DB + '.');
  // Query-string parameters can override host/dbname in node-postgres.
  for (const key of ['host', 'hostaddr', 'dbname', 'database', 'service']) {
    if (url.searchParams.has(key)) refuse(`DATABASE_URL carries an override parameter "${key}".`);
  }
  return raw;
};

// Connect and verify the server-side identity before returning the client.
export const connectScratch = async () => {
  const connectionString = assertScratchUrl();
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();

  const { rows } = await client.query(
    'SELECT current_database() AS db, inet_server_addr()::text AS addr'
  );
  const { db, addr } = rows[0];
  // addr is NULL over a Unix socket (which is local by definition).
  const loopback = addr === null || addr.startsWith('127.') || addr === '::1';
  if (db !== SCRATCH_DB || !loopback) {
    await client.end();
    refuse(`connected to database "${db}" at ${addr ?? 'unix socket'}.`);
  }
  return client;
};
