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
// MIGRATIONS
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
