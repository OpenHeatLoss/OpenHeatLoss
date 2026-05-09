// server/migrate.js
// Run this script once before starting the server, or as part of your
// Railway deploy command, to create/update the Postgres schema.
//
// Usage:
//   node migrate.js
//
// Railway deploy command (in Railway service settings):
//   node server/migrate.js && node server/server.js
//
// The script is idempotent — safe to run multiple times. All CREATE TABLE
// statements use IF NOT EXISTS, and ALTER TABLE statements check the
// information_schema before executing.
//
// Migration tracking: a schema_migrations table records applied migrations
// exactly as before. Each migration is a named async function. Add new
// migrations at the bottom of the MIGRATIONS array.

const { Pool } = require('pg');
const { readFileSync } = require('fs');
const path = require('path');
const { seedStelradClassicCompact } = require('./seedStelradClassicCompact');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

// ---------------------------------------------------------------------------
// HELPER — add a column only if it doesn't already exist
// Postgres doesn't support "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" until
// pg 9.6, but checking information_schema is universal and clear.
// ---------------------------------------------------------------------------
async function addColumnIfMissing(table, column, definition) {
  const res = await query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = $1 AND column_name = $2`, [table, column]
  );
  if (res.rowCount === 0) {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`  Added column ${table}.${column}`);
  }
}

// ---------------------------------------------------------------------------
// BASELINE SCHEMA
// Creates all tables from scratch on a fresh Postgres database.
// The schema reflects the current state after all SQLite migrations up to 022.
// Column types:
//   INTEGER → SERIAL (auto-increment PKs only) or INTEGER
//   REAL    → DOUBLE PRECISION
//   DATETIME / CURRENT_TIMESTAMP → TIMESTAMPTZ / NOW()
//   TEXT stays TEXT
//   JSON columns → JSONB
//   Boolean-ish columns → SMALLINT DEFAULT 0  (keeps 0/1 integer behaviour
//     the frontend expects — avoids type-coercion surprises)
// ---------------------------------------------------------------------------
async function baseline() {
  console.log('Running baseline schema...');

  // TIER 1: no foreign key dependencies

  await query(`
    CREATE TABLE IF NOT EXISTS companies (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      mcs_number   TEXT,
      recc_number  TEXT,
      address      TEXT,
      postcode     TEXT,
      email        TEXT,
      phone        TEXT,
      website      TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS addresses (
      id             SERIAL PRIMARY KEY,
      company_id     INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      address_line_1 TEXT,
      address_line_2 TEXT,
      town           TEXT,
      county         TEXT,
      postcode       TEXT,
      what3words     TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS radiator_specs (
      id           SERIAL PRIMARY KEY,
      manufacturer TEXT NOT NULL,
      model        TEXT NOT NULL,
      type         TEXT NOT NULL,
      height       INTEGER NOT NULL,
      length       INTEGER NOT NULL,
      output_dt50  DOUBLE PRECISION NOT NULL,
      water_volume DOUBLE PRECISION NOT NULL,
      notes        TEXT,
      source       TEXT DEFAULT 'library',
      scope        TEXT DEFAULT 'company',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // TIER 2: depend on companies

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      role          TEXT DEFAULT 'engineer',
      password_hash TEXT,
      is_active     SMALLINT DEFAULT 1,
      plan          TEXT NOT NULL DEFAULT 'free',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id         SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      title      TEXT,
      first_name TEXT NOT NULL DEFAULT '',
      surname    TEXT NOT NULL DEFAULT '',
      email      TEXT,
      telephone  TEXT,
      mobile     TEXT,
      notes      TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // TIER 3: junction tables

  await query(`
    CREATE TABLE IF NOT EXISTS client_addresses (
      id           SERIAL PRIMARY KEY,
      client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      address_id   INTEGER NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
      address_type TEXT DEFAULT 'contact',
      is_primary   SMALLINT DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // TIER 4: projects

  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id            SERIAL PRIMARY KEY,
      company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name          TEXT NOT NULL,
      status        TEXT DEFAULT 'enquiry',
      designer      TEXT,
      brief_notes   TEXT,
      session_token TEXT DEFAULT NULL,
      expires_at    TIMESTAMPTZ DEFAULT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS project_addresses (
      id           SERIAL PRIMARY KEY,
      project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      address_id   INTEGER NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
      address_type TEXT DEFAULT 'installation',
      is_primary   SMALLINT DEFAULT 1,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // TIER 5: everything that hangs off projects

  await query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id                        SERIAL PRIMARY KEY,
      project_id                INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name                      TEXT NOT NULL,
      internal_temp             DOUBLE PRECISION DEFAULT 21,
      volume                    DOUBLE PRECISION DEFAULT 0,
      floor_area                DOUBLE PRECISION DEFAULT 0,
      room_length               DOUBLE PRECISION DEFAULT 0,
      room_width                DOUBLE PRECISION DEFAULT 0,
      room_height               DOUBLE PRECISION DEFAULT 0,
      room_type                 TEXT DEFAULT 'living_room',
      has_manual_ach_override   SMALLINT DEFAULT 0,
      manual_ach                DOUBLE PRECISION DEFAULT 0,
      extract_fan_flow_rate     DOUBLE PRECISION DEFAULT 0,
      has_open_fire             SMALLINT DEFAULT 0,
      min_air_flow              DOUBLE PRECISION DEFAULT 0,
      infiltration_rate         DOUBLE PRECISION DEFAULT 0.5,
      mechanical_supply         DOUBLE PRECISION DEFAULT 0,
      mechanical_extract        DOUBLE PRECISION DEFAULT 0,
      radiator_schedule_complete SMALLINT DEFAULT 0,
      design_connection_type    TEXT DEFAULT 'TBSE',
      thermal_bridging_addition DOUBLE PRECISION NOT NULL DEFAULT 0.10,
      exposed_envelope_m2       DOUBLE PRECISION NOT NULL DEFAULT 0,
      has_suspended_floor       SMALLINT NOT NULL DEFAULT 0,
      is_top_storey             SMALLINT NOT NULL DEFAULT 0,
      bg_vent_count             INTEGER NOT NULL DEFAULT 0,
      bg_fan_count              INTEGER NOT NULL DEFAULT 0,
      bg_flue_small_count       INTEGER NOT NULL DEFAULT 0,
      bg_flue_large_count       INTEGER NOT NULL DEFAULT 0,
      bg_open_fire_count        INTEGER NOT NULL DEFAULT 0,
      continuous_vent_type      TEXT NOT NULL DEFAULT 'none',
      continuous_vent_rate_m3h  DOUBLE PRECISION NOT NULL DEFAULT 0,
      mvhr_efficiency           DOUBLE PRECISION NOT NULL DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS elements (
      id                       SERIAL PRIMARY KEY,
      room_id                  INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      element_type             TEXT NOT NULL,
      description              TEXT,
      length                   DOUBLE PRECISION DEFAULT 0,
      height                   DOUBLE PRECISION DEFAULT 0,
      area                     DOUBLE PRECISION DEFAULT 0,
      u_value                  DOUBLE PRECISION DEFAULT 0,
      temp_factor              DOUBLE PRECISION DEFAULT 1.0,
      custom_delta_t           DOUBLE PRECISION DEFAULT NULL,
      subtract_from_element_id INTEGER DEFAULT NULL
                                 REFERENCES elements(id) ON DELETE SET NULL,
      include_in_envelope      SMALLINT DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS u_value_library (
      id               SERIAL PRIMARY KEY,
      project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      element_category TEXT NOT NULL,
      name             TEXT NOT NULL,
      u_value          DOUBLE PRECISION NOT NULL,
      notes            TEXT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS room_emitters (
      id               SERIAL PRIMARY KEY,
      room_id          INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      emitter_type     TEXT NOT NULL,
      radiator_spec_id INTEGER REFERENCES radiator_specs(id) ON DELETE SET NULL,
      connection_type  TEXT,
      quantity         INTEGER DEFAULT 1,
      notes            TEXT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS radiator_schedule (
      id               SERIAL PRIMARY KEY,
      room_id          INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      radiator_spec_id INTEGER REFERENCES radiator_specs(id) ON DELETE CASCADE,
      connection_type  TEXT DEFAULT 'BOE',
      quantity         INTEGER DEFAULT 1,
      notes            TEXT,
      is_existing      SMALLINT DEFAULT 0,
      emitter_status   TEXT DEFAULT 'new',
      display_order    INTEGER DEFAULT 0,
      no_trv           SMALLINT DEFAULT 0,
      enclosure_factor DOUBLE PRECISION DEFAULT 1.00,
      finish_factor    DOUBLE PRECISION DEFAULT 1.00,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS room_ufh_specs (
      id                        SERIAL PRIMARY KEY,
      room_id                   INTEGER NOT NULL UNIQUE
                                  REFERENCES rooms(id) ON DELETE CASCADE,
      floor_construction        TEXT DEFAULT 'screed',
      pipe_spacing_mm           INTEGER DEFAULT 150,
      pipe_od_m                 DOUBLE PRECISION DEFAULT 0.016,
      screed_depth_above_pipe_m DOUBLE PRECISION DEFAULT 0.045,
      lambda_screed             DOUBLE PRECISION DEFAULT 1.2,
      floor_covering            TEXT DEFAULT 'tiles',
      r_lambda                  DOUBLE PRECISION DEFAULT 0.00,
      active_area_factor        DOUBLE PRECISION DEFAULT 1.00,
      zone_type                 TEXT DEFAULT 'occupied',
      notes                     TEXT,
      ufh_flow_temp             DOUBLE PRECISION DEFAULT 45,
      ufh_return_temp           DOUBLE PRECISION DEFAULT 40,
      has_actuator              SMALLINT DEFAULT 0,
      created_at                TIMESTAMPTZ DEFAULT NOW(),
      updated_at                TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS design_params (
      id                          SERIAL PRIMARY KEY,
      project_id                  INTEGER NOT NULL UNIQUE
                                    REFERENCES projects(id) ON DELETE CASCADE,
      external_temp               DOUBLE PRECISION DEFAULT -3,
      annual_avg_temp             DOUBLE PRECISION DEFAULT 7,
      design_flow_temp            DOUBLE PRECISION DEFAULT 50,
      design_return_temp          DOUBLE PRECISION DEFAULT 40,
      air_density                 DOUBLE PRECISION DEFAULT 1.2,
      specific_heat               DOUBLE PRECISION DEFAULT 0.34,
      mcs_postcode_prefix         TEXT,
      mcs_degree_days             DOUBLE PRECISION DEFAULT 0,
      mcs_outdoor_low_temp        DOUBLE PRECISION DEFAULT 0,
      use_sap_ventilation         SMALLINT DEFAULT 0,
      building_category           TEXT DEFAULT 'B',
      dwelling_type               TEXT DEFAULT 'semi_detached',
      number_of_storeys           INTEGER DEFAULT 2,
      shelter_factor              TEXT DEFAULT 'normal',
      number_of_bedrooms          INTEGER DEFAULT 0,
      has_blower_test             SMALLINT DEFAULT 0,
      sap_age_band                TEXT DEFAULT 'H',
      air_permeability_q50        DOUBLE PRECISION DEFAULT 10,
      number_of_chimneys          INTEGER DEFAULT 0,
      number_of_open_flues        INTEGER DEFAULT 0,
      number_of_intermittent_fans INTEGER DEFAULT 0,
      number_of_passive_vents     INTEGER DEFAULT 0,
      ventilation_system_type     TEXT DEFAULT 'natural',
      mvhr_efficiency             INTEGER DEFAULT 0,
      heat_pump_manufacturer      TEXT,
      heat_pump_model             TEXT,
      heat_pump_rated_output      DOUBLE PRECISION DEFAULT 0,
      heat_pump_min_modulation    DOUBLE PRECISION DEFAULT 0,
      heat_pump_flow_temp         DOUBLE PRECISION DEFAULT 50,
      heat_pump_return_temp       DOUBLE PRECISION DEFAULT 40,
      mcs_heat_pump_type          TEXT DEFAULT 'ASHP',
      mcs_emitter_type            TEXT DEFAULT 'existing_radiators',
      mcs_ufh_type                TEXT DEFAULT 'screed',
      mcs_system_provides         TEXT DEFAULT 'space_and_hw',
      mcs_bedrooms                INTEGER DEFAULT 0,
      mcs_occupants               INTEGER DEFAULT 0,
      mcs_cylinder_volume         DOUBLE PRECISION DEFAULT 0,
      mcs_pasteurization_freq     INTEGER DEFAULT 0,
      mcs_heat_pump_sound_power   DOUBLE PRECISION DEFAULT 0,
      mcs_sound_assessments       JSONB DEFAULT NULL,
      mcs_sound_snapshot          JSONB DEFAULT NULL,
      mcs_calculation_snapshot    JSONB DEFAULT NULL,
      circuits                    JSONB DEFAULT NULL,
      pipe_sections               JSONB DEFAULT NULL,
      epc_space_heating_demand    DOUBLE PRECISION DEFAULT 0,
      epc_hot_water_demand        DOUBLE PRECISION DEFAULT 0,
      epc_total_floor_area        DOUBLE PRECISION DEFAULT 0,
      heat_pump_internal_volume   DOUBLE PRECISION DEFAULT 0,
      buffer_vessel_volume        DOUBLE PRECISION DEFAULT 0,
      en14511_test_points         JSONB DEFAULT NULL,
      defrost_pct                 DOUBLE PRECISION DEFAULT 5,
      ventilation_method          TEXT NOT NULL DEFAULT 'en12831_cibse2026',
      air_permeability_method     TEXT NOT NULL DEFAULT 'estimated',
      q50                         DOUBLE PRECISION NOT NULL DEFAULT 12.0,
      sap_structural              TEXT NOT NULL DEFAULT 'masonry',
      sap_floor                   TEXT NOT NULL DEFAULT 'other',
      sap_window_draught_pct      INTEGER NOT NULL DEFAULT 100,
      sap_draught_lobby           SMALLINT NOT NULL DEFAULT 0,
      building_storeys            INTEGER NOT NULL DEFAULT 2,
      building_shielding          TEXT NOT NULL DEFAULT 'normal',
      reference_temp              DOUBLE PRECISION NOT NULL DEFAULT 10.6,
      created_at                  TIMESTAMPTZ DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id             SERIAL PRIMARY KEY,
      project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      reference      TEXT,
      version        INTEGER DEFAULT 1,
      status         TEXT DEFAULT 'draft',
      survey_basis   TEXT,
      total_ex_vat   DOUBLE PRECISION DEFAULT 0,
      vat_amount     DOUBLE PRECISION DEFAULT 0,
      total_inc_vat  DOUBLE PRECISION DEFAULT 0,
      bus_grant      DOUBLE PRECISION DEFAULT 0,
      client_pays    DOUBLE PRECISION DEFAULT 0,
      deposit_amount DOUBLE PRECISION DEFAULT 0,
      hourly_rate    DOUBLE PRECISION DEFAULT 0,
      valid_days     INTEGER DEFAULT 30,
      issued_at      TIMESTAMPTZ,
      expires_at     TIMESTAMPTZ,
      accepted_at    TIMESTAMPTZ,
      prepared_by    TEXT,
      notes          TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id            SERIAL PRIMARY KEY,
      quote_id      INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      item_type     TEXT DEFAULT 'labour',
      description   TEXT NOT NULL,
      quantity      DOUBLE PRECISION DEFAULT 1,
      unit_price    DOUBLE PRECISION DEFAULT 0,
      total_price   DOUBLE PRECISION DEFAULT 0,
      is_optional   SMALLINT DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS documents (
      id         SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      doc_type   TEXT NOT NULL,
      filename   TEXT,
      status     TEXT DEFAULT 'pending',
      sent_at    TIMESTAMPTZ,
      signed_at  TIMESTAMPTZ,
      notes      TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS project_notes (
      id         SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      note       TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS commissioning (
      id                     SERIAL PRIMARY KEY,
      project_id             INTEGER NOT NULL UNIQUE
                               REFERENCES projects(id) ON DELETE CASCADE,
      mcs_certificate_number TEXT,
      commissioned_at        TIMESTAMPTZ,
      engineer_name          TEXT,
      engineer_signed_at     TIMESTAMPTZ,
      client_signed_at       TIMESTAMPTZ,
      notes                  TEXT,
      created_at             TIMESTAMPTZ DEFAULT NOW(),
      updated_at             TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS survey_checklists (
      id         SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL UNIQUE
                   REFERENCES projects(id) ON DELETE CASCADE,
      data       TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL PRIMARY KEY,
      version     TEXT NOT NULL UNIQUE,
      description TEXT,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed company record (id=1 is Mysa Heating Ltd).
  // INSERT ... ON CONFLICT DO NOTHING is idempotent.
  await query(`
    INSERT INTO companies (id, name, mcs_number, recc_number)
    VALUES (1, 'My Company Name', Null, Null)
    ON CONFLICT (id) DO NOTHING
  `);

  // Advance the sequence so the next company insert gets id=2, not a collision.
  // Safe to call even if already set higher.
  await query(`SELECT setval('companies_id_seq', GREATEST(1, (SELECT MAX(id) FROM companies)))`);

  // Record the baseline as migration 002 (matching the SQLite history).
  await query(`
    INSERT INTO schema_migrations (version, description)
    VALUES ('002', 'Postgres baseline schema — all columns from SQLite migrations 001–022')
    ON CONFLICT (version) DO NOTHING
  `);

  console.log('Baseline schema complete.');
}

// ---------------------------------------------------------------------------
// VIEWS
// Recreated on every migrate run — DROP IF EXISTS + CREATE.
// The SQLite-specific string concatenation (||) works identically in Postgres.
// ---------------------------------------------------------------------------
async function recreateViews() {
  console.log('Recreating views...');

  await query(`DROP VIEW IF EXISTS v_project_dashboard`);
  await query(`
    CREATE VIEW v_project_dashboard AS
    SELECT
      p.id                                          AS project_id,
      p.name                                        AS project_name,
      p.status,
      p.company_id,
      p.client_id,
      p.created_at,
      p.updated_at,
      c.first_name || ' ' || c.surname              AS client_name,
      c.email,
      c.telephone,
      a.postcode,
      a.address_line_1,
      a.town,
      dp.heat_pump_manufacturer || ' ' ||
        COALESCE(dp.heat_pump_model, '')             AS heat_pump,
      dp.design_flow_temp,
      dp.heat_pump_rated_output,
      (SELECT COUNT(*) FROM rooms r
       WHERE r.project_id = p.id)                   AS room_count,
      (SELECT q.reference FROM quotes q
       WHERE q.project_id = p.id
       ORDER BY q.created_at DESC LIMIT 1)          AS latest_quote_ref,
      (SELECT q.status FROM quotes q
       WHERE q.project_id = p.id
       ORDER BY q.created_at DESC LIMIT 1)          AS latest_quote_status,
      (SELECT q.client_pays FROM quotes q
       WHERE q.project_id = p.id
       ORDER BY q.created_at DESC LIMIT 1)          AS latest_quote_value,
      CASE WHEN com.id IS NOT NULL THEN 1 ELSE 0
      END                                           AS is_commissioned,
      com.mcs_certificate_number
    FROM projects p
    LEFT JOIN clients c          ON c.id = p.client_id
    LEFT JOIN client_addresses ca ON ca.client_id = c.id
                                   AND ca.is_primary = 1
    LEFT JOIN addresses a         ON a.id = ca.address_id
    LEFT JOIN design_params dp    ON dp.project_id = p.id
    LEFT JOIN commissioning com   ON com.project_id = p.id
    ORDER BY p.updated_at DESC
  `);

  await query(`DROP VIEW IF EXISTS v_quote_summary`);
  await query(`
    CREATE VIEW v_quote_summary AS
    SELECT
      q.id                AS quote_id,
      q.project_id,
      p.name              AS project_name,
      c.first_name || ' ' || c.surname AS client_name,
      a.postcode,
      q.reference,
      q.version,
      q.status,
      q.total_ex_vat,
      q.vat_amount,
      q.total_inc_vat,
      q.bus_grant,
      q.client_pays,
      q.deposit_amount,
      q.issued_at,
      q.expires_at,
      q.accepted_at,
      q.prepared_by,
      COUNT(qi.id)        AS line_item_count
    FROM quotes q
    LEFT JOIN projects p       ON p.id = q.project_id
    LEFT JOIN clients c        ON c.id = p.client_id
    LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_primary = 1
    LEFT JOIN addresses a      ON a.id = ca.address_id
    LEFT JOIN quote_items qi   ON qi.quote_id = q.id
    GROUP BY q.id, p.name, c.first_name, c.surname, a.postcode
  `);

  console.log('Views recreated.');
}

// ---------------------------------------------------------------------------
// SEED — construction_library
// Called from within migration 003. Idempotent — skips if rows exist.
// Expands the JSON seed file's age_bands[] and regions[] arrays into
// individual rows (one row per age_band × region combination).
// ---------------------------------------------------------------------------
async function seedConstructionLibrary() {
  const { rowCount } = await query('SELECT 1 FROM construction_library LIMIT 1');
  if (rowCount > 0) {
    console.log('  construction_library already seeded — skipping.');
    return;
  }

  const seedPath = path.join(__dirname, 'seeds', 'construction_library.json');
  const data = JSON.parse(readFileSync(seedPath, 'utf8'));

  const INSERT_SQL = `
    INSERT INTO construction_library (
      element_type, wall_type, roof_type, insulation_type, insulation_mm,
      age_band, region, u_value, formula_type,
      description, description_detail, source, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `;

  const sections = [
    { records: data.walls        ?? [], elementType: 'wall' },
    { records: data.roofs        ?? [], elementType: 'roof' },
    { records: data.floors_exposed ?? [], elementType: 'floor_exposed' },
  ];

  let inserted = 0;
  for (const { records, elementType } of sections) {
    for (const record of records) {
      if ('_comment' in record) continue;

      const regions  = record.regions   ?? [];
      const ageBands = record.age_bands ?? [null];

      for (const region of regions) {
        for (const ageBand of ageBands) {
          await query(INSERT_SQL, [
            elementType,
            record.wall_type          ?? null,
            record.roof_type          ?? null,
            record.insulation_type    ?? null,
            record.insulation_mm      ?? null,
            ageBand,
            region,
            record.u_value            ?? null,
            record.formula_type       ?? null,
            record.description,
            record.description_detail ?? null,
            record.source,
            record.notes              ?? null,
          ]);
          inserted++;
        }
      }
    }
  }

  console.log(`  Seeded ${inserted} rows into construction_library.`);
}

// ---------------------------------------------------------------------------
// SEED — windows and doors (migration 006)
// Reads windows_and_doors.json and inserts into construction_library.
// Idempotent — skips if window/door rows already exist.
// ---------------------------------------------------------------------------
async function seedWindowsAndDoors() {
  const { rowCount } = await query(
    `SELECT 1 FROM construction_library WHERE element_type IN ('window', 'door') LIMIT 1`
  );
  if (rowCount > 0) {
    console.log('  Windows and doors already seeded — skipping.');
    return;
  }

  const seedPath = path.join(__dirname, 'seeds', 'windows_and_doors.json');
  const data = JSON.parse(readFileSync(seedPath, 'utf8'));

  const INSERT_SQL = `
    INSERT INTO construction_library (
      element_type, region, age_band, u_value, description, source, notes,
      glazing_type, frame_type, gap_mm, is_roof_window, g_value,
      door_type, opens_to, period
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
  `;

  let inserted = 0;

  // Windows — expand regions array
  for (const record of (data.windows ?? [])) {
    for (const region of (record.regions ?? [])) {
      await query(INSERT_SQL, [
        'window', region, null,
        record.u_value, record.description, record.source, record.notes ?? null,
        record.glazing_type, record.frame_type, record.gap_mm ?? null,
        record.is_roof_window ?? false, record.g_value ?? null,
        null, null, record.period,
      ]);
      inserted++;
    }
  }

  // Doors — expand regions × age_bands
  for (const record of (data.doors ?? [])) {
    for (const region of (record.regions ?? [])) {
      for (const ageBand of (record.age_bands ?? [null])) {
        await query(INSERT_SQL, [
          'door', region, ageBand,
          record.u_value, record.description, record.source, record.notes ?? null,
          null, null, null, false, null,
          record.door_type, record.opens_to, null,
        ]);
        inserted++;
      }
    }
  }

  console.log(`  Seeded ${inserted} window and door rows into construction_library.`);
}

// ---------------------------------------------------------------------------
// Each entry is { version, description, run: async fn }.
// New migrations go at the bottom. Migrations already recorded in
// schema_migrations are skipped automatically.
//
// Note: the SQLite migration history (001–022) is NOT replicated here because
// the Postgres baseline schema already incorporates all those columns.
// The Postgres baseline is recorded as version '002'. Future migrations
// start from '003'.
// ---------------------------------------------------------------------------
const MIGRATIONS = [
  {
    version: '003',
    description: 'construction_library table — RdSAP10 U-value reference data',
    run: async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS construction_library (
          id                 SERIAL PRIMARY KEY,
          element_type       TEXT    NOT NULL,
          wall_type          TEXT,
          roof_type          TEXT,
          insulation_type    TEXT,
          insulation_mm      INTEGER,
          age_band           TEXT,
          region             TEXT    NOT NULL,
          u_value            DOUBLE PRECISION,
          formula_type       TEXT,
          description        TEXT    NOT NULL,
          description_detail TEXT,
          source             TEXT    NOT NULL,
          notes              TEXT
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_construction_library_lookup
          ON construction_library (element_type, region, age_band)
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_construction_library_wall_type
          ON construction_library (wall_type) WHERE wall_type IS NOT NULL
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_construction_library_insulation_mm
          ON construction_library (insulation_mm) WHERE insulation_mm IS NOT NULL
      `);

      // Seed immediately after table creation — within the same migration
      // so the table is never left empty after a successful deploy.
      await seedConstructionLibrary();
    },
  },
  {
    version: '004',
    description: 'Seed Stelrad Classic Compact radiator library',
    run: async () => {
      // radiator_specs table already exists in the baseline schema.
      // scope='library' marks these as global reference data, distinct
      // from company-specific entries (scope='company').
      await seedStelradClassicCompact(query);
    },
  },
  {
    version: '005',
    description: 'Normalise radiator_specs scope: library → global',
    run: async () => {
      // Migration 004 seeded Stelrad data with scope='library'.
      // The established convention in database.js is scope='global' for
      // manufacturer reference data visible to all users.
      // Normalise so a single scope value covers all seeded library data.
      await query(`
        UPDATE radiator_specs
        SET scope = 'global'
        WHERE scope = 'library'
      `);
      console.log('  Normalised radiator_specs scope: library → global');
    },
  },
  {
    version: '006',
    description: 'Add window/door columns to construction_library and seed Table 24/26 data',
    run: async () => {
      await query(`ALTER TABLE construction_library ADD COLUMN IF NOT EXISTS glazing_type   TEXT`);
      await query(`ALTER TABLE construction_library ADD COLUMN IF NOT EXISTS frame_type     TEXT`);
      await query(`ALTER TABLE construction_library ADD COLUMN IF NOT EXISTS gap_mm         INTEGER`);
      await query(`ALTER TABLE construction_library ADD COLUMN IF NOT EXISTS is_roof_window BOOLEAN DEFAULT FALSE`);
      await query(`ALTER TABLE construction_library ADD COLUMN IF NOT EXISTS g_value        DOUBLE PRECISION`);
      await query(`ALTER TABLE construction_library ADD COLUMN IF NOT EXISTS door_type      TEXT`);
      await query(`ALTER TABLE construction_library ADD COLUMN IF NOT EXISTS opens_to       TEXT`);
      await query(`ALTER TABLE construction_library ADD COLUMN IF NOT EXISTS period         TEXT`);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_construction_library_glazing
          ON construction_library (glazing_type) WHERE glazing_type IS NOT NULL
      `);
      await seedWindowsAndDoors();
    },
  },
  {
    version: '007',
    description: 'Seed Stelrad Classic Compact K3 radiator data',
    run: async () => {
      // K1/P+/K2 were seeded in migration 004.
      // K3 is a separate datasheet and gets its own migration so
      // existing deployments pick it up without re-seeding everything.
      const { rowCount } = await query(`
        SELECT 1 FROM radiator_specs
        WHERE manufacturer = 'Stelrad' AND model = 'Classic Compact' AND type = 'K3'
        LIMIT 1
      `);
      if (rowCount > 0) {
        console.log('  K3 data already present — skipping.');
        return;
      }

      const { readFileSync } = require('fs');
      const path = require('path');
      const seedPath = path.join(__dirname, 'seeds', 'stelrad_classic_compact_k3.json');
      const { radiators } = JSON.parse(readFileSync(seedPath, 'utf8'));

      const INSERT_SQL = `
        INSERT INTO radiator_specs
          (manufacturer, model, type, height, length, output_dt50, water_volume,
           source, notes, scope)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'global')
      `;

      for (const r of radiators) {
        await query(INSERT_SQL, [
          r.manufacturer, r.model, r.type,
          r.height, r.length, r.output_dt50,
          r.water_volume, r.source, r.notes ?? null,
        ]);
      }
      console.log(`  Seeded ${radiators.length} Stelrad Classic Compact K3 records.`);
    },
  },
  {
    version: '008',
    description: 'Seed K-Rad Kompact radiator library (Types 11, 21, 22, 33)',
    run: async () => {
      const { rowCount } = await query(`
        SELECT 1 FROM radiator_specs
        WHERE manufacturer = 'K-Rad (Kartell)'
        LIMIT 1
      `);
      if (rowCount > 0) {
        console.log('  K-Rad Kompact data already present — skipping.');
        return;
      }

      const { readFileSync } = require('fs');
      const path = require('path');
      const seedPath = path.join(__dirname, 'seeds', 'k_rad_kompact.json');
      const { radiators } = JSON.parse(readFileSync(seedPath, 'utf8'));

      const INSERT_SQL = `
        INSERT INTO radiator_specs
          (manufacturer, model, type, height, length, output_dt50, water_volume,
           source, notes, scope)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'global')
      `;

      for (const r of radiators) {
        await query(INSERT_SQL, [
          r.manufacturer, r.model, r.type,
          r.height, r.length, r.output_dt50,
          r.water_volume, r.source, r.notes ?? null,
        ]);
      }
      console.log(`  Seeded ${radiators.length} K-Rad Kompact records (Types 11, 21, 22, 33).`);
    },
  },
  {
    version: '009',
    description: 'Add is_admin to users; create password_reset_tokens table',
    run: async () => {
      // is_admin flag — used to gate the /admin panel and requireAdmin middleware.
      // Set manually via SQL for the platform owner: UPDATE users SET is_admin = true WHERE email = '...';
      await addColumnIfMissing('users', 'is_admin', 'BOOLEAN NOT NULL DEFAULT false');

      // Password reset tokens — one-time use, 1-hour expiry.
      // token is a 32-byte hex string generated server-side via crypto.randomBytes.
      // used_at is set when the token is consumed so it can never be replayed.
      await query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id         SERIAL PRIMARY KEY,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token      TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at    TIMESTAMPTZ DEFAULT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
          ON password_reset_tokens (token)
      `);

      console.log('  Added users.is_admin and password_reset_tokens table');
    },
  },
  {
    version: '010',
    description: 'Pipe materials/fittings library; normalise pipe_sections out of design_params JSON blob',
    run: async () => {

      // ── 1. PIPE MATERIALS ────────────────────────────────────────────────
      // Company-level pipe material library. scope='global' rows are seeded here
      // and are read-only in the UI. scope='company' rows are user-created.
      await query(`
        CREATE TABLE IF NOT EXISTS pipe_materials (
          id             SERIAL PRIMARY KEY,
          company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          scope          TEXT NOT NULL DEFAULT 'global',
          material_key   TEXT NOT NULL,
          name           TEXT NOT NULL,
          description    TEXT,
          roughness_mm   REAL NOT NULL DEFAULT 0.0015,
          max_velocity   REAL NOT NULL DEFAULT 1.5,
          display_order  INTEGER NOT NULL DEFAULT 0,
          created_at     TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(company_id, material_key)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS pipe_material_sizes (
          id               SERIAL PRIMARY KEY,
          pipe_material_id INTEGER NOT NULL REFERENCES pipe_materials(id) ON DELETE CASCADE,
          nominal_size     TEXT NOT NULL,
          external_diameter REAL NOT NULL,
          internal_diameter REAL NOT NULL,
          wall_thickness    REAL NOT NULL,
          display_order     INTEGER NOT NULL DEFAULT 0
        )
      `);

      // ── 2. FITTINGS ──────────────────────────────────────────────────────
      // Company-level fittings library. scope='global' rows seeded here.
      // unit_cost defaults to 0 — engineer sets prices in Settings.
      await query(`
        CREATE TABLE IF NOT EXISTS fittings (
          id           SERIAL PRIMARY KEY,
          company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          scope        TEXT NOT NULL DEFAULT 'global',
          fitting_key  TEXT NOT NULL,
          name         TEXT NOT NULL,
          k_value      REAL NOT NULL DEFAULT 0,
          description  TEXT,
          unit_cost    REAL NOT NULL DEFAULT 0,
          display_order INTEGER NOT NULL DEFAULT 0,
          created_at   TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(company_id, fitting_key)
        )
      `);

      // ── 3. PIPE SECTIONS (normalised) ────────────────────────────────────
      // Replaces the pipe_sections JSONB blob on design_params.
      // pipe_material_id references the company's pipe_materials table.
      // connected_rooms stays JSONB — small array, never queried individually.
      await query(`
        CREATE TABLE IF NOT EXISTS pipe_sections (
          id                          SERIAL PRIMARY KEY,
          project_id                  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          pipe_material_id            INTEGER REFERENCES pipe_materials(id),
          name                        TEXT,
          nominal_size                TEXT,
          length_m                    REAL NOT NULL DEFAULT 0,
          flow_rate                   REAL NOT NULL DEFAULT 0,
          heat_load                   REAL NOT NULL DEFAULT 0,
          velocity                    REAL NOT NULL DEFAULT 0,
          pressure_drop               REAL NOT NULL DEFAULT 0,
          straight_pipe_pressure_drop REAL NOT NULL DEFAULT 0,
          fittings_pressure_drop      REAL NOT NULL DEFAULT 0,
          fittings_method             TEXT NOT NULL DEFAULT 'percentage',
          fitting_percentage          REAL NOT NULL DEFAULT 20,
          water_temperature           REAL NOT NULL DEFAULT 50,
          use_whole_property          BOOLEAN NOT NULL DEFAULT false,
          include_in_index_circuit    BOOLEAN NOT NULL DEFAULT false,
          connected_rooms             JSONB,
          display_order               INTEGER NOT NULL DEFAULT 0,
          created_at                  TIMESTAMPTZ DEFAULT NOW(),
          updated_at                  TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_pipe_sections_project
          ON pipe_sections (project_id)
      `);

      // ── 4. PIPE SECTION FITTINGS ─────────────────────────────────────────
      // Child rows per pipe section. References fittings table for K-value
      // and unit_cost lookups. quantity stored here.
      await query(`
        CREATE TABLE IF NOT EXISTS pipe_section_fittings (
          id              SERIAL PRIMARY KEY,
          pipe_section_id INTEGER NOT NULL REFERENCES pipe_sections(id) ON DELETE CASCADE,
          fitting_id      INTEGER NOT NULL REFERENCES fittings(id),
          quantity        INTEGER NOT NULL DEFAULT 1,
          created_at      TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // ── 5. SEED GLOBAL PIPE MATERIALS for company_id = 1 ────────────────
      // Seeds from the static pipeMaterialData.js data.
      // Other companies get their global rows when they first load pipe sizing
      // (server-side ensureCompanyLibraries helper — see server.js).
      const pipeMaterialSeed = [
        {
          key: 'copper_tableX', name: 'Copper (Table X)',
          description: 'Half-hard copper to BS EN 1057',
          roughness: 0.0015, maxVel: 1.5, order: 1,
          sizes: [
            { nom: '10mm', od: 10, id: 8.0,  wt: 1.0 },
            { nom: '15mm', od: 15, id: 13.0, wt: 1.0 },
            { nom: '22mm', od: 22, id: 20.0, wt: 1.0 },
            { nom: '28mm', od: 28, id: 26.0, wt: 1.0 },
            { nom: '35mm', od: 35, id: 33.0, wt: 1.0 },
            { nom: '42mm', od: 42, id: 40.0, wt: 1.0 },
            { nom: '54mm', od: 54, id: 52.0, wt: 1.0 },
          ],
        },
        {
          key: 'copper_tableY', name: 'Copper (Table Y)',
          description: 'Thin wall copper to BS EN 1057',
          roughness: 0.0015, maxVel: 1.5, order: 2,
          sizes: [
            { nom: '10mm', od: 10, id: 8.8,  wt: 0.6 },
            { nom: '15mm', od: 15, id: 13.6, wt: 0.7 },
            { nom: '22mm', od: 22, id: 20.2, wt: 0.9 },
            { nom: '28mm', od: 28, id: 26.2, wt: 0.9 },
            { nom: '35mm', od: 35, id: 33.2, wt: 0.9 },
            { nom: '42mm', od: 42, id: 40.0, wt: 1.0 },
            { nom: '54mm', od: 54, id: 51.6, wt: 1.2 },
          ],
        },
        {
          key: 'polybutylene', name: 'Polybutylene (Pipelife)',
          description: 'Polybutylene barrier pipe',
          roughness: 0.0007, maxVel: 1.5, order: 3,
          sizes: [
            { nom: '10mm', od: 10, id: 6.7,  wt: 1.65 },
            { nom: '15mm', od: 15, id: 11.7, wt: 1.65 },
            { nom: '22mm', od: 22, id: 17.7, wt: 2.15 },
            { nom: '28mm', od: 28, id: 22.5, wt: 2.75 },
          ],
        },
        {
          key: 'mlcp', name: 'MLCP (Multi-Layer Composite)',
          description: 'PEX/AL/PEX multilayer composite pipe',
          roughness: 0.0007, maxVel: 1.2, order: 4,
          sizes: [
            { nom: '16mm', od: 16, id: 12.0, wt: 2.0 },
            { nom: '20mm', od: 20, id: 16.0, wt: 2.0 },
            { nom: '26mm', od: 26, id: 20.0, wt: 3.0 },
            { nom: '32mm', od: 32, id: 26.0, wt: 3.0 },
          ],
        },
        {
          key: 'pex', name: 'PEX (Cross-linked Polyethylene)',
          description: 'PEX barrier pipe',
          roughness: 0.0007, maxVel: 1.0, order: 5,
          sizes: [
            { nom: '16mm', od: 16, id: 12.0, wt: 2.0 },
            { nom: '20mm', od: 20, id: 16.0, wt: 2.0 },
            { nom: '25mm', od: 25, id: 20.4, wt: 2.3 },
            { nom: '32mm', od: 32, id: 26.0, wt: 3.0 },
          ],
        },
      ];

      for (const mat of pipeMaterialSeed) {
        const existing = await query(
          `SELECT id FROM pipe_materials WHERE company_id = 1 AND material_key = $1`,
          [mat.key]
        );
        let matId;
        if (existing.rows.length > 0) {
          matId = existing.rows[0].id;
        } else {
          const ins = await query(
            `INSERT INTO pipe_materials
               (company_id, scope, material_key, name, description, roughness_mm, max_velocity, display_order)
             VALUES (1, 'global', $1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [mat.key, mat.name, mat.description, mat.roughness, mat.maxVel, mat.order]
          );
          matId = ins.rows[0].id;
        }
        // Seed sizes if not already present
        const sizeCount = await query(
          `SELECT COUNT(*) FROM pipe_material_sizes WHERE pipe_material_id = $1`, [matId]
        );
        if (parseInt(sizeCount.rows[0].count) === 0) {
          for (let i = 0; i < mat.sizes.length; i++) {
            const s = mat.sizes[i];
            await query(
              `INSERT INTO pipe_material_sizes
                 (pipe_material_id, nominal_size, external_diameter, internal_diameter, wall_thickness, display_order)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [matId, s.nom, s.od, s.id, s.wt, i]
            );
          }
        }
      }
      console.log('  Seeded global pipe materials for company_id = 1');

      // ── 6. SEED GLOBAL FITTINGS for company_id = 1 ──────────────────────
      const fittingSeed = [
        { key: 'elbow_90',                  name: '90° Elbow',                        k: 0.9,  desc: 'Standard 90° bend',             order: 1  },
        { key: 'elbow_45',                  name: '45° Elbow',                        k: 0.4,  desc: 'Standard 45° bend',             order: 2  },
        { key: 'tee_through',               name: 'Tee (Straight Through)',            k: 0.6,  desc: 'Flow straight through tee',     order: 3  },
        { key: 'tee_branch',                name: 'Tee (Branch)',                      k: 1.8,  desc: 'Flow through branch of tee',    order: 4  },
        { key: 'gate_valve',                name: 'Gate Valve (Fully Open)',           k: 0.2,  desc: 'Fully open gate valve',         order: 5  },
        { key: 'ball_valve',                name: 'Ball Valve (Fully Open)',           k: 0.05, desc: 'Fully open ball valve',         order: 6  },
        { key: 'check_valve',               name: 'Check Valve',                       k: 2.0,  desc: 'Spring-loaded check valve',     order: 7  },
        { key: 'reducer',                   name: 'Reducer',                           k: 0.5,  desc: 'Gradual reducer',               order: 8  },
        { key: 'coupling',                  name: 'Coupling',                          k: 0.08, desc: 'Straight coupling',             order: 9  },
        { key: 'radiator_valve_trv',        name: 'TRV (Thermostatic Radiator Valve)', k: 1.7,  desc: 'TRV fully open',               order: 10 },
        { key: 'radiator_valve_lockshield', name: 'Lockshield Valve',                  k: 0.5,  desc: 'Lockshield valve fully open',  order: 11 },
        { key: 'manifold_port',             name: 'Manifold Port',                     k: 1.2,  desc: 'Single manifold outlet',       order: 12 },
        { key: 'y_strainer',                name: 'Y-Strainer',                        k: 1.5,  desc: 'Clean Y-strainer',             order: 13 },
      ];

      for (const f of fittingSeed) {
        await query(
          `INSERT INTO fittings (company_id, scope, fitting_key, name, k_value, description, display_order)
           VALUES (1, 'global', $1, $2, $3, $4, $5)
           ON CONFLICT (company_id, fitting_key) DO NOTHING`,
          [f.key, f.name, f.k, f.desc, f.order]
        );
      }
      console.log('  Seeded global fittings for company_id = 1');

      // ── 7. MIGRATE EXISTING PIPE SECTIONS FROM JSON BLOB ────────────────
      // Read pipe_sections JSON from design_params for every project.
      // Resolve material key → pipe_material_id (via company's library).
      // Resolve fitting type → fitting_id (via company's library).
      // Legacy aliases: mlcp_riifo, mlcp_maincor → mlcp.
      // If a material key cannot be resolved, default to copper_tableX and log.

      const LEGACY_MATERIAL_MAP = {
        mlcp_riifo:   'mlcp',
        mlcp_maincor: 'mlcp',
      };

      const projects = await query(`
        SELECT p.id AS project_id, p.company_id, dp.pipe_sections
        FROM projects p
        JOIN design_params dp ON dp.project_id = p.id
        WHERE dp.pipe_sections IS NOT NULL
          AND dp.pipe_sections != 'null'
          AND dp.pipe_sections != '[]'
      `);

      let migratedProjects = 0;
      let migratedSections = 0;
      let warnings = 0;

      for (const proj of projects.rows) {
        let sections = proj.pipe_sections;
        if (typeof sections === 'string') {
          try { sections = JSON.parse(sections); } catch { continue; }
        }
        if (!Array.isArray(sections) || sections.length === 0) continue;

        const companyId = proj.company_id;

        for (let i = 0; i < sections.length; i++) {
          const sec = sections[i];

          // Resolve material key → pipe_material_id
          let materialKey = sec.material || 'copper_tableX';
          if (LEGACY_MATERIAL_MAP[materialKey]) materialKey = LEGACY_MATERIAL_MAP[materialKey];

          const matRow = await query(
            `SELECT id FROM pipe_materials WHERE company_id = $1 AND material_key = $2`,
            [companyId, materialKey]
          );

          let pipeMaterialId = null;
          if (matRow.rows.length > 0) {
            pipeMaterialId = matRow.rows[0].id;
          } else {
            // Fall back to company_id=1 global library (in case company libs not yet seeded)
            const fallback = await query(
              `SELECT id FROM pipe_materials WHERE company_id = 1 AND material_key = $1`,
              [materialKey]
            );
            if (fallback.rows.length > 0) {
              pipeMaterialId = fallback.rows[0].id;
            } else {
              // Last resort: copper_tableX from company 1
              const copper = await query(
                `SELECT id FROM pipe_materials WHERE company_id = 1 AND material_key = 'copper_tableX'`
              );
              pipeMaterialId = copper.rows[0]?.id ?? null;
              console.warn(`    ⚠ Project ${proj.project_id} section "${sec.name}": material "${sec.material}" not found, defaulted to copper_tableX`);
              warnings++;
            }
          }

          // Insert pipe section
          const secIns = await query(
            `INSERT INTO pipe_sections (
              project_id, pipe_material_id, name, nominal_size, length_m,
              flow_rate, heat_load, velocity, pressure_drop,
              straight_pipe_pressure_drop, fittings_pressure_drop,
              fittings_method, fitting_percentage, water_temperature,
              use_whole_property, include_in_index_circuit,
              connected_rooms, display_order
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
            ) RETURNING id`,
            [
              proj.project_id,
              pipeMaterialId,
              sec.name || null,
              sec.diameter || null,
              sec.length || 0,
              sec.flowRate || 0,
              sec.heatLoad || 0,
              sec.velocity || 0,
              sec.pressureDrop || 0,
              sec.straightPipePressureDrop || 0,
              sec.fittingsPressureDrop || 0,
              sec.fittingsMethod || 'percentage',
              sec.fittingPercentage || 20,
              sec.waterTemperature || 50,
              sec.useWholeProperty ? true : false,
              sec.includeInIndexCircuit ? true : false,
              sec.connectedRooms ? JSON.stringify(sec.connectedRooms) : null,
              i,
            ]
          );

          const pipeSectionId = secIns.rows[0].id;

          // Migrate fittings (only if fittingsMethod === 'detailed')
          if (sec.fittingsMethod === 'detailed' && Array.isArray(sec.fittings)) {
            for (const fitting of sec.fittings) {
              const fRow = await query(
                `SELECT id FROM fittings WHERE company_id = $1 AND fitting_key = $2`,
                [companyId, fitting.type]
              );
              let fittingId = fRow.rows[0]?.id;
              if (!fittingId) {
                // Try global (company 1)
                const fGlobal = await query(
                  `SELECT id FROM fittings WHERE company_id = 1 AND fitting_key = $1`,
                  [fitting.type]
                );
                fittingId = fGlobal.rows[0]?.id;
              }
              if (fittingId && fitting.quantity > 0) {
                await query(
                  `INSERT INTO pipe_section_fittings (pipe_section_id, fitting_id, quantity)
                   VALUES ($1, $2, $3)`,
                  [pipeSectionId, fittingId, fitting.quantity]
                );
              }
            }
          }

          migratedSections++;
        }

        // Null out the blob — keep column for one release as safety net
        await query(
          `UPDATE design_params SET pipe_sections = NULL WHERE project_id = $1`,
          [proj.project_id]
        );

        migratedProjects++;
      }

      console.log(`  Migrated ${migratedSections} pipe sections from ${migratedProjects} projects`);
      if (warnings > 0) console.warn(`  ⚠ ${warnings} sections had unresolved materials — defaulted to copper_tableX`);
    },
  },
];

async function runMigrations() {
  for (const migration of MIGRATIONS) {
    const existing = await query(
      `SELECT 1 FROM schema_migrations WHERE version = $1`, [migration.version]
    );
    if (existing.rowCount > 0) {
      console.log(`  Migration ${migration.version} already applied — skipping`);
      continue;
    }
    console.log(`  Applying migration ${migration.version}: ${migration.description}`);
    await migration.run();
    await query(
      `INSERT INTO schema_migrations (version, description) VALUES ($1, $2)`,
      [migration.version, migration.description]
    );
    console.log(`  Migration ${migration.version} complete`);
  }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Mysa Heating Platform — Postgres migration ===');
  
  // Retry connection up to 10 times with 2s delay — Postgres may not be
  // ready immediately on Railway, especially on first deploy.
  const MAX_RETRIES = 10;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await pool.query('SELECT 1');
      break; // connected
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error('Could not connect to Postgres after', MAX_RETRIES, 'attempts');
        process.exit(1);
      }
      console.log(`Waiting for Postgres... (attempt ${attempt}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  try {
    await baseline();
    await recreateViews();
    await runMigrations();
    console.log('=== Migration complete ===');
  } catch (err) {
    console.error('Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
