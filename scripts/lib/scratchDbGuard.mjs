// scripts/lib/scratchDbGuard.mjs
//
// Safety guard shared by the B25 and B26 scripts. Refuses to run unless
// DATABASE_URL points at the local scratch database: ohl_b25_check by default
// (the B25 scripts call with no argument), or the name passed in (B26 passes
// ohl_b26_check). Checked twice:
//   1. Before connecting — parse the URL itself.
//   2. After connecting — ask Postgres which database we actually landed on,
//      so a libpq override (PGHOST, ?host=, service files) cannot redirect us.
//
// Never reads .env. DATABASE_URL must already be set in the environment.

import { createRequire } from 'node:module';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const pg = require('pg');

export const SCRATCH_DB = 'ohl_b25_check';

const refuse = (why, dbName) => {
  console.error(`REFUSING TO RUN: ${why}`);
  console.error(`This script only runs against postgres://localhost/${dbName}.`);
  process.exit(1);
};

export const assertScratchUrl = (dbName = SCRATCH_DB) => {
  const raw = process.env.DATABASE_URL;
  if (!raw) refuse('DATABASE_URL is not set.', dbName);

  let url;
  try { url = new URL(raw); } catch { refuse('DATABASE_URL is not a valid URL.', dbName); }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) refuse(`unexpected protocol ${url.protocol}`, dbName);
  if (url.hostname !== 'localhost') refuse(`host is "${url.hostname}", not localhost.`, dbName);
  if (decodeURIComponent(url.pathname) !== `/${dbName}`) refuse('database name is not ' + dbName + '.', dbName);
  // Query-string parameters can override host/dbname in node-postgres.
  for (const key of ['host', 'hostaddr', 'dbname', 'database', 'service']) {
    if (url.searchParams.has(key)) refuse(`DATABASE_URL carries an override parameter "${key}".`, dbName);
  }
  return raw;
};

// Connect and verify the server-side identity before returning the client.
export const connectScratch = async (dbName = SCRATCH_DB) => {
  const connectionString = assertScratchUrl(dbName);
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();

  const { rows } = await client.query(
    'SELECT current_database() AS db, inet_server_addr()::text AS addr'
  );
  const { db, addr } = rows[0];
  // addr is NULL over a Unix socket (which is local by definition).
  const loopback = addr === null || addr.startsWith('127.') || addr === '::1';
  if (db !== dbName || !loopback) {
    await client.end();
    refuse(`connected to database "${db}" at ${addr ?? 'unix socket'}.`, dbName);
  }
  return client;
};
