// server/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'heatloss.db');
console.log('===========================================');
console.log('DATABASE PATH:', dbPath);
console.log('===========================================');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    db.run('PRAGMA foreign_keys = ON');
    initializeDatabase();
  }
});

// Promisified helpers — all database operations use these
// rather than raw callbacks, keeping the rest of the code clean.
const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ id: this.lastID, changes: this.changes });
  });
});

const getQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const allQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

// ---------------------------------------------------------------------------
// SCHEMA INITIALISATION
// Creates all tables in dependency order (parents before children).
// Safe to call on an empty database — uses IF NOT EXISTS throughout.
// ---------------------------------------------------------------------------
function initializeDatabase() {
  db.serialize(() => {

    // -- TIER 1: no foreign key dependencies ----------------------------------

    db.run(`
      CREATE TABLE IF NOT EXISTS companies (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        name              TEXT NOT NULL,
        mcs_number        TEXT,
        recc_number       TEXT,
        address           TEXT,
        postcode          TEXT,
        email             TEXT,
        phone             TEXT,
        website           TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS addresses (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id        INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        address_line_1    TEXT,
        address_line_2    TEXT,
        town              TEXT,
        county            TEXT,
        postcode          TEXT,
        what3words        TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS radiator_specs (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        manufacturer      TEXT NOT NULL,
        model             TEXT NOT NULL,
        type              TEXT NOT NULL,
        height            INTEGER NOT NULL,
        length            INTEGER NOT NULL,
        output_dt50       REAL NOT NULL,
        water_volume      REAL NOT NULL,
        notes             TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // -- TIER 2: depend on companies or addresses ----------------------------

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id        INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        email             TEXT NOT NULL UNIQUE,
        name              TEXT NOT NULL,
        role              TEXT DEFAULT 'engineer',
        password_hash     TEXT,
        is_active         INTEGER DEFAULT 1,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id        INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        title             TEXT,
        first_name        TEXT NOT NULL DEFAULT '',
        surname           TEXT NOT NULL DEFAULT '',
        email             TEXT,
        telephone         TEXT,
        mobile            TEXT,
        notes             TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // -- TIER 3: junction tables for addresses --------------------------------
    // client_addresses and project_addresses are created after their
    // parent tables. address_type values: 'contact' | 'billing' | 'other'
    // for clients; 'installation' | 'billing' | 'other' for projects.

    db.run(`
      CREATE TABLE IF NOT EXISTS client_addresses (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id         INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        address_id        INTEGER NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
        address_type      TEXT DEFAULT 'contact',
        is_primary        INTEGER DEFAULT 0,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // -- TIER 4: projects (depends on companies + clients) -------------------

    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id        INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        client_id         INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        name              TEXT NOT NULL,
        status            TEXT DEFAULT 'enquiry',
        designer          TEXT,
        brief_notes       TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS project_addresses (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        address_id        INTEGER NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
        address_type      TEXT DEFAULT 'installation',
        is_primary        INTEGER DEFAULT 1,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // -- TIER 5: everything that hangs off projects --------------------------

    db.run(`
      CREATE TABLE IF NOT EXISTS rooms (
        id                        INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id                INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name                      TEXT NOT NULL,
        internal_temp             REAL DEFAULT 21,
        volume                    REAL DEFAULT 0,
        floor_area                REAL DEFAULT 0,
        room_length               REAL DEFAULT 0,
        room_width                REAL DEFAULT 0,
        room_height               REAL DEFAULT 0,
        room_type                 TEXT DEFAULT 'living_room',
        has_manual_ach_override   INTEGER DEFAULT 0,
        manual_ach                REAL DEFAULT 0,
        extract_fan_flow_rate     REAL DEFAULT 0,
        has_open_fire             INTEGER DEFAULT 0,
        min_air_flow              REAL DEFAULT 0,
        infiltration_rate         REAL DEFAULT 0.5,
        mechanical_supply         REAL DEFAULT 0,
        mechanical_extract        REAL DEFAULT 0,
        radiator_schedule_complete INTEGER DEFAULT 0
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS elements (
        id                        INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id                   INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        element_type              TEXT NOT NULL,
        description               TEXT,
        length                    REAL DEFAULT 0,
        height                    REAL DEFAULT 0,
        area                      REAL DEFAULT 0,
        u_value                   REAL DEFAULT 0,
        temp_factor               REAL DEFAULT 1.0,
        custom_delta_t            REAL DEFAULT NULL,
        subtract_from_element_id  INTEGER DEFAULT NULL
          REFERENCES elements(id) ON DELETE SET NULL,
        include_in_envelope       INTEGER DEFAULT 0
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS u_value_library (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        element_category  TEXT NOT NULL,
        name              TEXT NOT NULL,
        u_value           REAL NOT NULL,
        notes             TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS room_emitters (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id           INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        emitter_type      TEXT NOT NULL,
        radiator_spec_id  INTEGER REFERENCES radiator_specs(id) ON DELETE SET NULL,
        connection_type   TEXT,
        quantity          INTEGER DEFAULT 1,
        notes             TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS radiator_schedule (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id           INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        radiator_spec_id  INTEGER REFERENCES radiator_specs(id) ON DELETE CASCADE,
        connection_type   TEXT DEFAULT 'BOE',
        quantity          INTEGER DEFAULT 1,
        notes             TEXT,
        is_existing       INTEGER DEFAULT 0,
        display_order     INTEGER DEFAULT 0,
        no_trv            INTEGER DEFAULT 0,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS design_params (
        id                          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id                  INTEGER NOT NULL UNIQUE
                                      REFERENCES projects(id) ON DELETE CASCADE,
        external_temp               REAL DEFAULT -3,
        annual_avg_temp             REAL DEFAULT 7,
        design_flow_temp            REAL DEFAULT 50,
        design_return_temp          REAL DEFAULT 40,
        air_density                 REAL DEFAULT 1.2,
        specific_heat               REAL DEFAULT 0.34,
        mcs_postcode_prefix         TEXT,
        mcs_degree_days             REAL DEFAULT 0,
        mcs_outdoor_low_temp        REAL DEFAULT 0,
        use_sap_ventilation         INTEGER DEFAULT 0,
        building_category           TEXT DEFAULT 'B',
        dwelling_type               TEXT DEFAULT 'semi_detached',
        number_of_storeys           INTEGER DEFAULT 2,
        shelter_factor              TEXT DEFAULT 'normal',
        number_of_bedrooms          INTEGER DEFAULT 0,
        has_blower_test             INTEGER DEFAULT 0,
        sap_age_band                TEXT DEFAULT 'H',
        air_permeability_q50        REAL DEFAULT 10,
        number_of_chimneys          INTEGER DEFAULT 0,
        number_of_open_flues        INTEGER DEFAULT 0,
        number_of_intermittent_fans INTEGER DEFAULT 0,
        number_of_passive_vents     INTEGER DEFAULT 0,
        ventilation_system_type     TEXT DEFAULT 'natural',
        mvhr_efficiency             INTEGER DEFAULT 0,
        heat_pump_manufacturer      TEXT,
        heat_pump_model             TEXT,
        heat_pump_rated_output      REAL DEFAULT 0,
        heat_pump_min_modulation    REAL DEFAULT 0,
        heat_pump_flow_temp         REAL DEFAULT 50,
        heat_pump_return_temp       REAL DEFAULT 40,
        mcs_heat_pump_type          TEXT DEFAULT 'ASHP',
        mcs_emitter_type            TEXT DEFAULT 'existing_radiators',
        mcs_ufh_type                TEXT DEFAULT 'screed',
        mcs_system_provides         TEXT DEFAULT 'space_and_hw',
        mcs_bedrooms                INTEGER DEFAULT 0,
        mcs_occupants               INTEGER DEFAULT 0,
        mcs_cylinder_volume         REAL DEFAULT 0,
        mcs_pasteurization_freq     INTEGER DEFAULT 0,
        mcs_heat_pump_sound_power   REAL DEFAULT 0,
        mcs_sound_assessments       TEXT DEFAULT NULL,
        mcs_sound_snapshot          TEXT DEFAULT NULL,
        mcs_calculation_snapshot    TEXT DEFAULT NULL,
        circuits                    TEXT DEFAULT NULL,
        pipe_sections               TEXT DEFAULT NULL,
        epc_space_heating_demand    REAL DEFAULT 0,
        epc_hot_water_demand        REAL DEFAULT 0,
        epc_total_floor_area        REAL DEFAULT 0,
        heat_pump_internal_volume   REAL DEFAULT 0,
        buffer_vessel_volume        REAL DEFAULT 0,
        en14511_test_points         TEXT DEFAULT NULL,
        defrost_pct                 REAL DEFAULT 5,
        -- EN 12831-1:2017 / CIBSE DHDG 2026 ventilation fields (migration 010)
        ventilation_method          TEXT DEFAULT 'en12831_cibse2026',
        air_permeability_method     TEXT DEFAULT 'estimated',
        q50                         REAL DEFAULT 12.0,
        sap_structural              TEXT DEFAULT 'masonry',
        sap_floor                   TEXT DEFAULT 'other',
        sap_window_draught_pct      INTEGER DEFAULT 100,
        sap_draught_lobby           INTEGER DEFAULT 0,
        building_storeys            INTEGER DEFAULT 2,
        building_shielding          TEXT DEFAULT 'normal',
        reference_temp              REAL DEFAULT 10.6,
        created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at                  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS quotes (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        reference         TEXT,
        version           INTEGER DEFAULT 1,
        status            TEXT DEFAULT 'draft',
        survey_basis      TEXT,
        total_ex_vat      REAL DEFAULT 0,
        vat_amount        REAL DEFAULT 0,
        total_inc_vat     REAL DEFAULT 0,
        bus_grant         REAL DEFAULT 0,
        client_pays       REAL DEFAULT 0,
        deposit_amount    REAL DEFAULT 0,
        hourly_rate       REAL DEFAULT 0,
        valid_days        INTEGER DEFAULT 30,
        issued_at         DATETIME,
        expires_at        DATETIME,
        accepted_at       DATETIME,
        prepared_by       TEXT,
        notes             TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS quote_items (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id          INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        item_type         TEXT DEFAULT 'labour',
        description       TEXT NOT NULL,
        quantity          REAL DEFAULT 1,
        unit_price        REAL DEFAULT 0,
        total_price       REAL DEFAULT 0,
        is_optional       INTEGER DEFAULT 0,
        display_order     INTEGER DEFAULT 0,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        doc_type          TEXT NOT NULL,
        filename          TEXT,
        status            TEXT DEFAULT 'pending',
        sent_at           DATETIME,
        signed_at         DATETIME,
        notes             TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS project_notes (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        note              TEXT NOT NULL,
        created_by        TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS commissioning (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id              INTEGER NOT NULL UNIQUE
                                  REFERENCES projects(id) ON DELETE CASCADE,
        mcs_certificate_number  TEXT,
        commissioned_at         DATETIME,
        engineer_name           TEXT,
        engineer_signed_at      DATETIME,
        client_signed_at        DATETIME,
        notes                   TEXT,
        created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS survey_checklists (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id        INTEGER NOT NULL UNIQUE
                                  REFERENCES projects(id) ON DELETE CASCADE,
        data              TEXT,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        version     TEXT NOT NULL UNIQUE,
        description TEXT,
        applied_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // -- VIEWS ---------------------------------------------------------------
    // Dropped and recreated so they always reflect the current schema.

    db.run(`DROP VIEW IF EXISTS v_project_dashboard`);
    db.run(`
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
      LEFT JOIN clients c         ON c.id = p.client_id
      LEFT JOIN client_addresses  ca ON ca.client_id = c.id
                                     AND ca.is_primary = 1
      LEFT JOIN addresses a        ON a.id = ca.address_id
      LEFT JOIN design_params dp   ON dp.project_id = p.id
      LEFT JOIN commissioning com  ON com.project_id = p.id
      ORDER BY p.updated_at DESC
    `);

    db.run(`DROP VIEW IF EXISTS v_quote_summary`);
    db.run(`
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
      LEFT JOIN projects p     ON p.id = q.project_id
      LEFT JOIN clients c      ON c.id = p.client_id
      LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_primary = 1
      LEFT JOIN addresses a    ON a.id = ca.address_id
      LEFT JOIN quote_items qi ON qi.quote_id = q.id
      GROUP BY q.id
    `);

    // Seed company record (Mysa Heating Ltd = company_id 1).
    // INSERT OR IGNORE means this only runs once even if server restarts.
    db.run(`
      INSERT OR IGNORE INTO companies (id, name, mcs_number, recc_number)
      VALUES (1, 'Mysa Heating Ltd', 'OFT-502073', '00080008')
    `);

    // Seed schema_migrations record for the clean-slate build.
    db.run(`
      INSERT OR IGNORE INTO schema_migrations (version, description)
      VALUES ('002', 'Clean-slate schema with companies, users, addresses, junction tables')
    `);

    // -- MIGRATION 012 --------------------------------------------------------
    // Add EN 12831-1:2017 / CIBSE DHDG 2026 ventilation fields to design_params
    // and all migration 010/011 room fields to rooms.
    // These were added to live DBs via prior migration runs but were missing from
    // the CREATE TABLE definition and from designParams.update(), causing all
    // ventilation settings (storeys, draught pct, shielding, q50, etc.) to
    // revert to JS defaults on every project reload.
    // ALTER TABLE ADD COLUMN is idempotent here — duplicate column errors are
    // silently ignored so re-running on an already-migrated DB is safe.
    // -------------------------------------------------------------------------
    db.get("SELECT COUNT(*) as count FROM schema_migrations WHERE version = '012'", (err, row) => {
      if (row && row.count > 0) return; // already applied

      const alterColumns = [
        // design_params — EN 12831 ventilation fields (migration 010)
        `ALTER TABLE design_params ADD COLUMN ventilation_method       TEXT    DEFAULT 'en12831_cibse2026'`,
        `ALTER TABLE design_params ADD COLUMN air_permeability_method  TEXT    DEFAULT 'estimated'`,
        `ALTER TABLE design_params ADD COLUMN q50                      REAL    DEFAULT 12.0`,
        `ALTER TABLE design_params ADD COLUMN sap_structural           TEXT    DEFAULT 'masonry'`,
        `ALTER TABLE design_params ADD COLUMN sap_floor                TEXT    DEFAULT 'other'`,
        `ALTER TABLE design_params ADD COLUMN sap_window_draught_pct   INTEGER DEFAULT 100`,
        `ALTER TABLE design_params ADD COLUMN sap_draught_lobby        INTEGER DEFAULT 0`,
        `ALTER TABLE design_params ADD COLUMN building_storeys         INTEGER DEFAULT 2`,
        `ALTER TABLE design_params ADD COLUMN building_shielding       TEXT    DEFAULT 'normal'`,
        `ALTER TABLE design_params ADD COLUMN reference_temp           REAL    DEFAULT 10.6`,
        // rooms — thermal bridging (migration 011)
        `ALTER TABLE rooms ADD COLUMN thermal_bridging_addition        REAL    NOT NULL DEFAULT 0.10`,
        // rooms — EN 12831 ventilation fields (migration 010)
        `ALTER TABLE rooms ADD COLUMN exposed_envelope_m2              REAL    DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN has_suspended_floor              INTEGER DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN is_top_storey                    INTEGER DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN bg_vent_count                    INTEGER DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN bg_fan_count                     INTEGER DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN bg_flue_small_count              INTEGER DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN bg_flue_large_count              INTEGER DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN bg_open_fire_count               INTEGER DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN continuous_vent_type             TEXT    DEFAULT 'none'`,
        `ALTER TABLE rooms ADD COLUMN continuous_vent_rate_m3h         REAL    DEFAULT 0`,
        `ALTER TABLE rooms ADD COLUMN mvhr_efficiency                  REAL    DEFAULT 0`,
      ];

      let completed = 0;
      alterColumns.forEach(sql => {
        db.run(sql, (alterErr) => {
          // Ignore "duplicate column name" — column already exists from a prior run
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error('Migration 012 error:', alterErr.message, '\n  SQL:', sql);
          }
          completed++;
          if (completed === alterColumns.length) {
            db.run(`
              INSERT OR IGNORE INTO schema_migrations (version, description)
              VALUES ('012', 'Add EN 12831-1 ventilation and thermal bridging fields')
            `);
            console.log('Migration 012 complete — EN 12831 fields added to design_params and rooms');
          }
        });
      });
    });

    // -- MIGRATION 013 --------------------------------------------------------
    // Add include_in_envelope to elements.
    // When ticked on an element row, that element's area is automatically summed
    // to compute exposedEnvelopeM2 — replacing the manual entry and the broken
    // hasSuspendedFloor / isTopStorey checkboxes.
    // Back-fills External Wall, Ground Floor (Suspended) and Roof to 1 so
    // existing projects get sensible defaults without manual re-entry.
    // -------------------------------------------------------------------------
    db.get("SELECT COUNT(*) as count FROM schema_migrations WHERE version = '013'", (err, row) => {
      if (row && row.count > 0) return;

      db.run(
        `ALTER TABLE elements ADD COLUMN include_in_envelope INTEGER DEFAULT 0`,
        (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error('Migration 013 error:', alterErr.message);
            return;
          }
          // Back-fill sensible defaults for element types that are almost always exposed
          db.run(`
            UPDATE elements
            SET include_in_envelope = 1
            WHERE element_type IN ('External Wall', 'Ground Floor (Suspended)', 'Roof')
          `, (updateErr) => {
            if (updateErr) console.error('Migration 013 back-fill error:', updateErr.message);
            db.run(`
              INSERT OR IGNORE INTO schema_migrations (version, description)
              VALUES ('013', 'Add include_in_envelope to elements')
            `);
            console.log('Migration 013 complete — include_in_envelope added to elements');
          });
        }
      );
    });

    // -- MIGRATION 014 --------------------------------------------------------
    // Add heat_pump_min_modulation to design_params.
    // Stores the heat pump's minimum modulation output (kW) from the datasheet.
    // Used in the Summary to calculate the outdoor temperature at which minimum
    // modulation is reached, giving an early warning of short-cycling risk.
    // -------------------------------------------------------------------------
    db.get("SELECT COUNT(*) as count FROM schema_migrations WHERE version = '014'", (err, row) => {
      if (row && row.count > 0) return;

      db.run(
        `ALTER TABLE design_params ADD COLUMN heat_pump_min_modulation REAL DEFAULT 0`,
        (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error('Migration 014 error:', alterErr.message);
            return;
          }
          db.run(`
            INSERT OR IGNORE INTO schema_migrations (version, description)
            VALUES ('014', 'Add heat_pump_min_modulation to design_params')
          `);
          console.log('Migration 014 complete — heat_pump_min_modulation added to design_params');
        }
      );
    });

    // -- MIGRATION 015 --------------------------------------------------------
    // Add system volume inputs to design_params.
    // heat_pump_internal_volume: from heat pump datasheet (L)
    // buffer_vessel_volume: 0 if no buffer, otherwise vessel size (L)
    // -------------------------------------------------------------------------
    db.get("SELECT COUNT(*) as count FROM schema_migrations WHERE version = '015'", (err, row) => {
      if (row && row.count > 0) return;

      const cols = [
        `ALTER TABLE design_params ADD COLUMN heat_pump_internal_volume REAL DEFAULT 0`,
        `ALTER TABLE design_params ADD COLUMN buffer_vessel_volume REAL DEFAULT 0`,
      ];
      let done = 0;
      cols.forEach(sql => {
        db.run(sql, (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error('Migration 015 error:', alterErr.message);
          }
          done++;
          if (done === cols.length) {
            db.run(`
              INSERT OR IGNORE INTO schema_migrations (version, description)
              VALUES ('015', 'Add system volume fields to design_params')
            `);
            console.log('Migration 015 complete — system volume fields added to design_params');
          }
        });
      });
    });

    // -- MIGRATION 016 --------------------------------------------------------
    // Add no_trv to radiator_schedule.
    // Marks a radiator as having no TRV (always open). Used to calculate the
    // minimum effective system volume for the 20 L/kW modulation check.
    // Default 0 (has TRV) is safe — existing radiators keep current behaviour.
    // -------------------------------------------------------------------------
    db.get("SELECT COUNT(*) as count FROM schema_migrations WHERE version = '016'", (err, row) => {
      if (row && row.count > 0) return;
      db.run(`ALTER TABLE radiator_schedule ADD COLUMN no_trv INTEGER DEFAULT 0`, (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column name')) {
          console.error('Migration 016 error:', alterErr.message);
          return;
        }
        db.run(`
          INSERT OR IGNORE INTO schema_migrations (version, description)
          VALUES ('016', 'Add no_trv to radiator_schedule')
        `);
        console.log('Migration 016 complete — no_trv added to radiator_schedule');
      });
    });

    // -- MIGRATION 017 --------------------------------------------------------
    // Add has_actuator to room_ufh_specs.
    // When false (default), the UFH circuit is always open and contributes to
    // the minimum effective system volume for the 20 L/kW modulation check.
    // Default 0 (no actuator = always open) is the safer assumption for most
    // retrofits where UFH is not individually zone-controlled.
    // -------------------------------------------------------------------------
    db.get("SELECT COUNT(*) as count FROM schema_migrations WHERE version = '017'", (err, row) => {
      if (row && row.count > 0) return;
      db.run(`ALTER TABLE room_ufh_specs ADD COLUMN has_actuator INTEGER DEFAULT 0`, (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column name')) {
          console.error('Migration 017 error:', alterErr.message);
          return;
        }
        db.run(`
          INSERT OR IGNORE INTO schema_migrations (version, description)
          VALUES ('017', 'Add has_actuator to room_ufh_specs')
        `);
        console.log('Migration 017 complete — has_actuator added to room_ufh_specs');
      });
    });

    // -- MIGRATION 018 --------------------------------------------------------
    // Add EN 14511 test points and defrost penalty to design_params.
    // en14511_test_points: JSON array of {tAir, tFlow, cop} from datasheet
    // defrost_pct: nominal defrost penalty % (default 5%)
    // -------------------------------------------------------------------------
    db.get("SELECT COUNT(*) as count FROM schema_migrations WHERE version = '018'", (err, row) => {
      if (row && row.count > 0) return;
      const cols = [
        `ALTER TABLE design_params ADD COLUMN en14511_test_points TEXT DEFAULT NULL`,
        `ALTER TABLE design_params ADD COLUMN defrost_pct REAL DEFAULT 5`,
      ];
      let done = 0;
      cols.forEach(sql => {
        db.run(sql, (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error('Migration 018 error:', alterErr.message);
          }
          done++;
          if (done === cols.length) {
            db.run(`
              INSERT OR IGNORE INTO schema_migrations (version, description)
              VALUES ('018', 'Add EN 14511 test points and defrost_pct to design_params')
            `);
            console.log('Migration 018 complete — SCOP estimator fields added');
          }
        });
      });
    });

    // -- MIGRATION 019 --------------------------------------------------------
    // Add anonymous session support to projects.
    // session_token: a UUID set when an anonymous user first visits. Used to
    //   look up their ephemeral project on return visits (same browser/cookie).
    // expires_at: projects with a session_token are deleted after 48 h of
    //   inactivity. Cleaned up on server startup. NULL for registered projects.
    // On registration the session_token and expires_at are both set to NULL and
    // a user_id / company_id are attached — the project becomes permanent.
    // -------------------------------------------------------------------------
    db.get("SELECT COUNT(*) as count FROM schema_migrations WHERE version = '019'", (err, row) => {
      if (row && row.count > 0) return;
      const cols = [
        `ALTER TABLE projects ADD COLUMN session_token TEXT    DEFAULT NULL`,
        `ALTER TABLE projects ADD COLUMN expires_at    DATETIME DEFAULT NULL`,
      ];
      let done = 0;
      cols.forEach(sql => {
        db.run(sql, (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error('Migration 019 error:', alterErr.message);
          }
          done++;
          if (done === cols.length) {
            db.run(`
              INSERT OR IGNORE INTO schema_migrations (version, description)
              VALUES ('019', 'Add session_token and expires_at to projects for anonymous sessions')
            `);
            console.log('Migration 019 complete — anonymous session columns added to projects');
          }
        });
      });
    });

    console.log('Database schema initialised');
  });
}

// ---------------------------------------------------------------------------
// COMPANIES
// ---------------------------------------------------------------------------
const companies = {
  getById: (id) => getQuery('SELECT * FROM companies WHERE id = ?', [id]),

  update: (id, data) => runQuery(`
    UPDATE companies
    SET name = ?, mcs_number = ?, recc_number = ?,
        address = ?, postcode = ?, email = ?, phone = ?, website = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [data.name, data.mcsNumber, data.reccNumber,
     data.address, data.postcode, data.email, data.phone, data.website, id]
  ),
};

// ---------------------------------------------------------------------------
// ADDRESSES
// ---------------------------------------------------------------------------
const addresses = {
  getById: (id) =>
    getQuery('SELECT * FROM addresses WHERE id = ?', [id]),

  getByClientId: (clientId) => allQuery(`
    SELECT a.*, ca.address_type, ca.is_primary
    FROM addresses a
    JOIN client_addresses ca ON ca.address_id = a.id
    WHERE ca.client_id = ?
    ORDER BY ca.is_primary DESC, a.id ASC`, [clientId]
  ),

  getByProjectId: (projectId) => allQuery(`
    SELECT a.*, pa.address_type, pa.is_primary
    FROM addresses a
    JOIN project_addresses pa ON pa.address_id = a.id
    WHERE pa.project_id = ?
    ORDER BY pa.is_primary DESC, a.id ASC`, [projectId]
  ),

  create: (data) => runQuery(`
    INSERT INTO addresses
      (company_id, address_line_1, address_line_2, town, county, postcode, what3words)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.companyId || 1, data.addressLine1, data.addressLine2,
     data.town, data.county, data.postcode, data.what3words]
  ),

  update: (id, data) => runQuery(`
    UPDATE addresses
    SET address_line_1 = ?, address_line_2 = ?, town = ?, county = ?,
        postcode = ?, what3words = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [data.addressLine1, data.addressLine2, data.town,
     data.county, data.postcode, data.what3words, id]
  ),

  delete: (id) => runQuery('DELETE FROM addresses WHERE id = ?', [id]),

  // Link an address to a client
  linkToClient: (clientId, addressId, addressType = 'contact', isPrimary = 0) =>
    runQuery(`
      INSERT INTO client_addresses (client_id, address_id, address_type, is_primary)
      VALUES (?, ?, ?, ?)`,
      [clientId, addressId, addressType, isPrimary ? 1 : 0]
    ),

  // Link an address to a project
  linkToProject: (projectId, addressId, addressType = 'installation', isPrimary = 1) =>
    runQuery(`
      INSERT INTO project_addresses (project_id, address_id, address_type, is_primary)
      VALUES (?, ?, ?, ?)`,
      [projectId, addressId, addressType, isPrimary ? 1 : 0]
    ),

  // Set a different address as primary for a client (clears existing primary first)
  setClientPrimary: async (clientId, addressId) => {
    await runQuery(
      'UPDATE client_addresses SET is_primary = 0 WHERE client_id = ?', [clientId]
    );
    return runQuery(
      'UPDATE client_addresses SET is_primary = 1 WHERE client_id = ? AND address_id = ?',
      [clientId, addressId]
    );
  },

  // Set a different address as primary for a project
  setProjectPrimary: async (projectId, addressId) => {
    await runQuery(
      'UPDATE project_addresses SET is_primary = 0 WHERE project_id = ?', [projectId]
    );
    return runQuery(
      'UPDATE project_addresses SET is_primary = 1 WHERE project_id = ? AND address_id = ?',
      [projectId, addressId]
    );
  },
};

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------
const clients = {
  getAll: (companyId = 1) =>
    allQuery(`
      SELECT c.*,
        a.address_line_1, a.address_line_2, a.town, a.county,
        a.postcode, a.what3words
      FROM clients c
      LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_primary = 1
      LEFT JOIN addresses a ON a.id = ca.address_id
      WHERE c.company_id = ?
      ORDER BY c.surname, c.first_name`, [companyId]
    ),

  getById: (id) =>
    getQuery(`
      SELECT c.*,
        a.id AS address_id,
        a.address_line_1, a.address_line_2, a.town, a.county,
        a.postcode, a.what3words
      FROM clients c
      LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_primary = 1
      LEFT JOIN addresses a ON a.id = ca.address_id
      WHERE c.id = ?`, [id]
    ),

  // Search by name or postcode — used by the new project modal
  search: (query, companyId = 1) => {
    const term = `%${query}%`;
    return allQuery(`
      SELECT c.*,
        a.address_line_1, a.town, a.postcode
      FROM clients c
      LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_primary = 1
      LEFT JOIN addresses a ON a.id = ca.address_id
      WHERE c.company_id = ?
        AND (
          c.first_name LIKE ?
          OR c.surname LIKE ?
          OR a.postcode LIKE ?
          OR (c.first_name || ' ' || c.surname) LIKE ?
        )
      ORDER BY c.surname, c.first_name
      LIMIT 10`, [companyId, term, term, term, term]
    );
  },

  create: (data) => runQuery(`
    INSERT INTO clients
      (company_id, title, first_name, surname, email, telephone, mobile, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.companyId || 1, data.title, data.firstName, data.surname,
     data.email, data.telephone, data.mobile, data.notes]
  ),

  update: (id, data) => runQuery(`
    UPDATE clients
    SET title = ?, first_name = ?, surname = ?, email = ?,
        telephone = ?, mobile = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [data.title, data.firstName, data.surname, data.email,
     data.telephone, data.mobile, data.notes, id]
  ),

  delete: (id) => runQuery('DELETE FROM clients WHERE id = ?', [id]),
};

// ---------------------------------------------------------------------------
// PROJECTS
// ---------------------------------------------------------------------------
const projects = {
  getAll: (companyId = 1) =>
    allQuery('SELECT * FROM projects WHERE company_id = ? ORDER BY updated_at DESC', [companyId]),

  getById: (id) =>
    getQuery('SELECT * FROM projects WHERE id = ?', [id]),

  create: (data) => runQuery(`
    INSERT INTO projects (company_id, client_id, name, status, designer, brief_notes)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [data.companyId || 1, data.clientId || null,
     data.name, data.status || 'enquiry', data.designer || '', data.briefNotes || '']
  ),

  // Create an anonymous project scoped to a session token.
  // company_id is NULL — anonymous projects are not owned by any company.
  // expires_at is 48 hours from now. Cleaned up on server startup.
  createAnonymous: (sessionToken) => runQuery(`
    INSERT INTO projects
      (company_id, client_id, name, status, session_token, expires_at)
    VALUES (NULL, NULL, 'My Project', 'enquiry', ?,
            datetime('now', '+48 hours'))`,
    [sessionToken]
  ),

  // Find an anonymous project by session token that hasn't expired yet.
  getBySessionToken: (sessionToken) =>
    getQuery(`
      SELECT * FROM projects
      WHERE session_token = ?
        AND expires_at > datetime('now')`,
      [sessionToken]
    ),

  // Touch expires_at to reset the 48-hour window on active anonymous sessions.
  refreshAnonymousExpiry: (sessionToken) =>
    runQuery(`
      UPDATE projects
      SET expires_at = datetime('now', '+48 hours')
      WHERE session_token = ?`,
      [sessionToken]
    ),

  update: (id, data) => runQuery(`
    UPDATE projects
    SET name = ?, status = ?, designer = ?, brief_notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [data.name, data.status, data.designer, data.briefNotes, id]
  ),

  delete: (id) => runQuery('DELETE FROM projects WHERE id = ?', [id]),
};

// ---------------------------------------------------------------------------
// ANONYMOUS SESSION CLEANUP
// Deletes all anonymous projects (session_token IS NOT NULL) whose expires_at
// has passed. Called once on server startup — keeps the DB clean without
// needing a separate cron job.
// ---------------------------------------------------------------------------
function cleanupAnonymousProjects() {
  return runQuery(`
    DELETE FROM projects
    WHERE session_token IS NOT NULL
      AND expires_at < datetime('now')
  `).then(result => {
    if (result.changes > 0) {
      console.log(`Startup cleanup: removed ${result.changes} expired anonymous project(s)`);
    }
  }).catch(err => {
    console.error('Anonymous project cleanup error:', err.message);
  });
}

// ---------------------------------------------------------------------------
// DESIGN PARAMS
// One row per project. Created automatically when a project is created.
// ---------------------------------------------------------------------------
const designParams = {
  getByProjectId: (projectId) =>
    getQuery('SELECT * FROM design_params WHERE project_id = ?', [projectId]),

  // Called immediately after project creation to seed the defaults row
  createForProject: (projectId) => runQuery(`
    INSERT OR IGNORE INTO design_params (project_id) VALUES (?)`, [projectId]
  ),

  update: (projectId, data) => runQuery(`
    UPDATE design_params SET
      external_temp = ?, annual_avg_temp = ?, design_flow_temp = ?,
      design_return_temp = ?, air_density = ?, specific_heat = ?,
      mcs_postcode_prefix = ?, mcs_degree_days = ?, mcs_outdoor_low_temp = ?,
      use_sap_ventilation = ?, building_category = ?, dwelling_type = ?,
      number_of_storeys = ?, shelter_factor = ?, number_of_bedrooms = ?,
      has_blower_test = ?, sap_age_band = ?, air_permeability_q50 = ?,
      number_of_chimneys = ?, number_of_open_flues = ?,
      number_of_intermittent_fans = ?, number_of_passive_vents = ?,
      ventilation_system_type = ?, mvhr_efficiency = ?,
      heat_pump_manufacturer = ?, heat_pump_model = ?,
      heat_pump_rated_output = ?, heat_pump_min_modulation = ?, heat_pump_flow_temp = ?, heat_pump_return_temp = ?,
      mcs_heat_pump_type = ?, mcs_emitter_type = ?, mcs_ufh_type = ?,
      mcs_system_provides = ?, mcs_bedrooms = ?, mcs_occupants = ?,
      mcs_cylinder_volume = ?, mcs_pasteurization_freq = ?,
      mcs_heat_pump_sound_power = ?,
      mcs_sound_assessments = ?, mcs_sound_snapshot = ?,
      mcs_calculation_snapshot = ?,
      circuits = ?, pipe_sections = ?,
      epc_space_heating_demand = ?, epc_hot_water_demand = ?, epc_total_floor_area = ?,
      heat_pump_internal_volume = ?, buffer_vessel_volume = ?,
      en14511_test_points = ?, defrost_pct = ?,
      ventilation_method = ?, air_permeability_method = ?,
      q50 = ?, sap_structural = ?, sap_floor = ?,
      sap_window_draught_pct = ?, sap_draught_lobby = ?,
      building_storeys = ?, building_shielding = ?, reference_temp = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE project_id = ?`,
    [
      data.externalTemp, data.annualAvgTemp, data.designFlowTemp,
      data.designReturnTemp, data.airDensity, data.specificHeat,
      data.mcsPostcodePrefix, data.mcsDegreeDays, data.mcsOutdoorLowTemp,
      data.useSAPVentilation ? 1 : 0, data.buildingCategory, data.dwellingType,
      data.numberOfStoreys, data.shelterFactor, data.numberOfBedrooms,
      data.hasBlowerTest ? 1 : 0, data.sapAgeBand, data.airPermeabilityQ50,
      data.numberOfChimneys, data.numberOfOpenFlues,
      data.numberOfIntermittentFans, data.numberOfPassiveVents,
      data.ventilationSystemType, data.mvhrEfficiency,
      data.heatPumpManufacturer, data.heatPumpModel,
      data.heatPumpRatedOutput, data.heatPumpMinModulation ?? 0, data.heatPumpFlowTemp, data.heatPumpReturnTemp,
      data.mcsHeatPumpType, data.mcsEmitterType, data.mcsUFHType,
      data.mcsSystemProvides, data.mcsBedrooms, data.mcsOccupants,
      data.mcsCylinderVolume, data.mcsPasteurizationFreq,
      data.mcsHeatPumpSoundPower,
      JSON.stringify(data.mcsSoundAssessments || []),
      data.mcsSoundSnapshot ? JSON.stringify(data.mcsSoundSnapshot) : null,
      data.mcsCalculationSnapshot ? JSON.stringify(data.mcsCalculationSnapshot) : null,
      data.circuits ? JSON.stringify(data.circuits) : null,
      data.pipeSections ? JSON.stringify(data.pipeSections) : null,
      data.epcSpaceHeatingDemand, data.epcHotWaterDemand, data.epcTotalFloorArea,
      data.heatPumpInternalVolume ?? 0,
      data.bufferVesselVolume     ?? 0,
      data.en14511TestPoints ? JSON.stringify(data.en14511TestPoints) : null,
      data.defrostPct             ?? 5,
      // EN 12831-1:2017 / CIBSE DHDG 2026 ventilation fields (migration 010/012)
      data.ventilationMethod      || 'en12831_cibse2026',
      data.airPermeabilityMethod  || 'estimated',
      data.q50                    ?? 12.0,
      data.sapStructural          || 'masonry',
      data.sapFloor               || 'other',
      data.sapWindowDraughtPct    ?? 100,
      data.sapDraughtLobby        ?? 0,
      data.buildingStoreys        ?? 2,
      data.buildingShielding      || 'normal',
      data.referenceTemp          ?? 10.6,
      projectId
    ]
  ),
};

// ---------------------------------------------------------------------------
// ROOMS
// ---------------------------------------------------------------------------
const rooms = {
  getByProjectId: (projectId) =>
    allQuery('SELECT * FROM rooms WHERE project_id = ? ORDER BY id', [projectId]),

  getById: (id) =>
    getQuery('SELECT * FROM rooms WHERE id = ?', [id]),

  create: (data) => runQuery(`
    INSERT INTO rooms
      (project_id, name, internal_temp, volume, floor_area,
      room_length, room_width, room_height,
      room_type, has_manual_ach_override, manual_ach,
      extract_fan_flow_rate, has_open_fire,
      min_air_flow, infiltration_rate, mechanical_supply, mechanical_extract,
      design_connection_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.projectId, data.name, data.internalTemp || 21,
    data.volume || 0, data.floorArea || 0,
    data.roomLength || 0, data.roomWidth || 0, data.roomHeight || 0,
    data.roomType || 'living_room',
    data.hasManualACHOverride ? 1 : 0, data.manualACH || 0,
    data.extractFanFlowRate || 0, data.hasOpenFire ? 1 : 0,
    data.minAirFlow || 0, data.infiltrationRate || 0.5,
    data.mechanicalSupply || 0, data.mechanicalExtract || 0,
    data.designConnectionType || 'BOE']
  ),

  update: (id, data) => runQuery(`
  UPDATE rooms SET
    name = ?, internal_temp = ?, volume = ?, floor_area = ?,
    room_length = ?, room_width = ?, room_height = ?,
    room_type = ?, has_manual_ach_override = ?, manual_ach = ?,
    extract_fan_flow_rate = ?, has_open_fire = ?,
    min_air_flow = ?, infiltration_rate = ?,
    mechanical_supply = ?, mechanical_extract = ?,
    design_connection_type = ?,
    thermal_bridging_addition = ?,
    exposed_envelope_m2 = ?, has_suspended_floor = ?, is_top_storey = ?,
    bg_vent_count = ?, bg_fan_count = ?,
    bg_flue_small_count = ?, bg_flue_large_count = ?, bg_open_fire_count = ?,
    continuous_vent_type = ?, continuous_vent_rate_m3h = ?, mvhr_efficiency = ?
  WHERE id = ?`,
  [data.name, data.internalTemp, data.volume, data.floorArea,
   data.roomLength, data.roomWidth, data.roomHeight,
   data.roomType || 'living_room',
   data.hasManualACHOverride ? 1 : 0, data.manualACH || 0,
   data.extractFanFlowRate || 0, data.hasOpenFire ? 1 : 0,
   data.minAirFlow, data.infiltrationRate,
   data.mechanicalSupply, data.mechanicalExtract,
   data.designConnectionType || 'BOE',
   // Thermal bridging addition (CIBSE DHDG 2026 Table 2-9, migration 011)
   data.thermalBridgingAddition ?? 0.10,
   // EN 12831-1:2017 ventilation fields (migration 010)
   data.exposedEnvelopeM2     ?? 0,
   data.hasSuspendedFloor     ?? 0,
   data.isTopStorey           ?? 0,
   data.bgVentCount           ?? 0,
   data.bgFanCount            ?? 0,
   data.bgFlueSmallCount      ?? 0,
   data.bgFlueLargeCount      ?? 0,
   data.bgOpenFireCount       ?? 0,
   data.continuousVentType    || 'none',
   data.continuousVentRateM3h ?? 0,
   data.mvhrEfficiency        ?? 0,
   id]
),

  delete: (id) => runQuery('DELETE FROM rooms WHERE id = ?', [id]),
};

// ---------------------------------------------------------------------------
// ELEMENTS
// ---------------------------------------------------------------------------
const elements = {
  getByRoomId: (roomId) =>
    allQuery('SELECT * FROM elements WHERE room_id = ? ORDER BY id', [roomId]),

  getById: (id) =>
    getQuery('SELECT * FROM elements WHERE id = ?', [id]),

  create: (data) => runQuery(`
    INSERT INTO elements
      (room_id, element_type, description, length, height, area,
       u_value, temp_factor, custom_delta_t, subtract_from_element_id,
       include_in_envelope)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.roomId, data.elementType, data.description,
     data.length, data.height, data.area, data.uValue, data.tempFactor,
     data.customDeltaT || null, data.subtractFromElementId || null,
     data.includeInEnvelope ?? 0]
  ),

  update: (id, data) => runQuery(`
    UPDATE elements SET
      element_type = ?, description = ?, length = ?, height = ?, area = ?,
      u_value = ?, temp_factor = ?, custom_delta_t = ?, subtract_from_element_id = ?,
      include_in_envelope = ?
    WHERE id = ?`,
    [data.elementType, data.description, data.length, data.height, data.area,
     data.uValue, data.tempFactor, data.customDeltaT || null,
     data.subtractFromElementId || null,
     data.includeInEnvelope ?? 0,
     id]
  ),

  delete: (id) => runQuery('DELETE FROM elements WHERE id = ?', [id]),
};

// ---------------------------------------------------------------------------
// U-VALUE LIBRARY
// ---------------------------------------------------------------------------
const uValueLibrary = {
  getByProjectId: (projectId) =>
    allQuery(
      'SELECT * FROM u_value_library WHERE project_id = ? ORDER BY element_category, name',
      [projectId]
    ),

  create: (data) => runQuery(`
    INSERT INTO u_value_library (project_id, element_category, name, u_value, notes)
    VALUES (?, ?, ?, ?, ?)`,
    [data.projectId, data.elementCategory, data.name, data.uValue, data.notes || '']
  ),

  update: (id, data) => runQuery(`
    UPDATE u_value_library
    SET element_category = ?, name = ?, u_value = ?, notes = ?
    WHERE id = ?`,
    [data.elementCategory, data.name, data.uValue, data.notes || '', id]
  ),

  delete: (id) => runQuery('DELETE FROM u_value_library WHERE id = ?', [id]),
};

// ---------------------------------------------------------------------------
// RADIATOR SPECS
// ---------------------------------------------------------------------------
const radiatorSpecs = {
  getAll: () =>
    allQuery('SELECT * FROM radiator_specs ORDER BY manufacturer, type, height, length'),

  getById: (id) =>
    getQuery('SELECT * FROM radiator_specs WHERE id = ?', [id]),

  create: (data) => runQuery(`
    INSERT INTO radiator_specs
      (manufacturer, model, type, height, length,
      output_dt50, water_volume, notes, source, scope)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.manufacturer, data.model, data.type,
    data.height, data.length, data.outputDt50,
    data.waterVolume, data.notes || '',
    data.source || 'library',
    data.scope  || 'company']
  ),

  update: (id, data) => runQuery(`
    UPDATE radiator_specs SET
      manufacturer = ?, model = ?, type = ?, height = ?, length = ?,
      output_dt50 = ?, water_volume = ?, notes = ?, source = ?, scope = ?
    WHERE id = ?`,
    [data.manufacturer, data.model, data.type,
    data.height, data.length, data.outputDt50,
    data.waterVolume, data.notes || '',
    data.source || 'library',
    data.scope  || 'company',
    id]
  ),

  delete: (id) => runQuery('DELETE FROM radiator_specs WHERE id = ?', [id]),
};

// ---------------------------------------------------------------------------
// ROOM EMITTERS
// ---------------------------------------------------------------------------
const roomEmitters = {
  getByRoomId: (roomId) =>
    allQuery('SELECT * FROM room_emitters WHERE room_id = ?', [roomId]),

  getById: (id) =>
    getQuery('SELECT * FROM room_emitters WHERE id = ?', [id]),

  create: (data) => runQuery(`
    INSERT INTO room_emitters
      (room_id, emitter_type, radiator_spec_id, connection_type, quantity, notes)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [data.roomId, data.emitterType, data.radiatorSpecId || null,
     data.connectionType || null, data.quantity || 1, data.notes || '']
  ),

  update: (id, data) => runQuery(`
    UPDATE room_emitters SET
      emitter_type = ?, radiator_spec_id = ?, connection_type = ?,
      quantity = ?, notes = ?
    WHERE id = ?`,
    [data.emitterType, data.radiatorSpecId || null, data.connectionType || null,
     data.quantity || 1, data.notes || '', id]
  ),

  delete: (id) => runQuery('DELETE FROM room_emitters WHERE id = ?', [id]),
};

// ---------------------------------------------------------------------------
// UFH SPECS — per room, created when UFH emitter is first added
// ---------------------------------------------------------------------------
const ufhSpecs = {
  getByRoomId: (roomId) =>
    getQuery('SELECT * FROM room_ufh_specs WHERE room_id = ?', [roomId]),

  upsert: (roomId, data) => runQuery(`
  INSERT INTO room_ufh_specs
    (room_id, floor_construction, pipe_spacing_mm, pipe_od_m,
     screed_depth_above_pipe_m, lambda_screed,
     floor_covering, r_lambda, active_area_factor,
     zone_type, notes, ufh_flow_temp, ufh_return_temp, has_actuator, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(room_id) DO UPDATE SET
    floor_construction          = excluded.floor_construction,
    pipe_spacing_mm             = excluded.pipe_spacing_mm,
    pipe_od_m                   = excluded.pipe_od_m,
    screed_depth_above_pipe_m   = excluded.screed_depth_above_pipe_m,
    lambda_screed               = excluded.lambda_screed,
    floor_covering              = excluded.floor_covering,
    r_lambda                    = excluded.r_lambda,
    active_area_factor          = excluded.active_area_factor,
    zone_type                   = excluded.zone_type,
    notes                       = excluded.notes,
    ufh_flow_temp               = excluded.ufh_flow_temp,
    ufh_return_temp             = excluded.ufh_return_temp,
    has_actuator                = excluded.has_actuator,
    updated_at                  = CURRENT_TIMESTAMP`,
  [roomId,
   data.floorConstruction    || 'screed',
   data.pipeSpacingMm        || 150,
   data.pipeOdM              ?? 0.016,
   data.screedDepthAbovePipeM ?? 0.045,
   data.lambdaScreed         ?? 1.2,
   data.floorCovering        || 'tiles',
   data.rLambda              ?? 0.00,
   data.activeAreaFactor     ?? 1.00,
   data.zoneType             || 'occupied',
   data.notes                || '',
   data.ufhFlowTemp          ?? 45,
   data.ufhReturnTemp        ?? 40,
   data.hasActuator          ? 1 : 0]
),

  delete: (roomId) =>
    runQuery('DELETE FROM room_ufh_specs WHERE room_id = ?', [roomId]),
};

// ---------------------------------------------------------------------------
// RADIATOR SCHEDULE
// ---------------------------------------------------------------------------
const radiatorSchedule = {
  getByRoomId: (roomId) =>
    allQuery(
      'SELECT * FROM radiator_schedule WHERE room_id = ? ORDER BY display_order, id',
      [roomId]
    ),

  create: (data) => runQuery(`
    INSERT INTO radiator_schedule
      (room_id, radiator_spec_id, connection_type, quantity,
      notes, is_existing, emitter_status, display_order,
      enclosure_factor, finish_factor, no_trv)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.roomId, data.radiatorSpecId, data.connectionType || 'BOE',
    data.quantity || 1, data.notes || '',
    data.isExisting ? 1 : 0,
    data.emitterStatus || 'new',
    data.displayOrder || 0,
    data.enclosureFactor ?? 1.00,
    data.finishFactor   ?? 1.00,
    data.noTrv ? 1 : 0]
  ),

  update: (id, data) => runQuery(`
    UPDATE radiator_schedule SET
      radiator_spec_id = ?, connection_type = ?, quantity = ?,
      notes = ?, is_existing = ?, emitter_status = ?, display_order = ?,
      enclosure_factor = ?, finish_factor = ?, no_trv = ?
    WHERE id = ?`,
    [data.radiatorSpecId, data.connectionType || 'BOE', data.quantity || 1,
    data.notes || '',
    data.isExisting ? 1 : 0,
    data.emitterStatus || 'new',
    data.displayOrder || 0,
    data.enclosureFactor ?? 1.00,
    data.finishFactor   ?? 1.00,
    data.noTrv ? 1 : 0,
    id]
  ),

  delete: (id) => runQuery('DELETE FROM radiator_schedule WHERE id = ?', [id]),

  markRoomComplete: (roomId, isComplete) =>
    runQuery(
      'UPDATE rooms SET radiator_schedule_complete = ? WHERE id = ?',
      [isComplete ? 1 : 0, roomId]
    ),
};

// ---------------------------------------------------------------------------
// GET COMPLETE PROJECT
// Single function that assembles everything the frontend needs for the
// project editor. Returns project + client + addresses + design_params
// + rooms (with elements, emitters, schedule) + library data.
// ---------------------------------------------------------------------------
async function getCompleteProject(projectId) {
  const project = await projects.getById(projectId);
  if (!project) return null;

  // Client and their addresses
  const client = project.client_id
    ? await clients.getById(project.client_id)
    : null;
  const clientAddresses = project.client_id
    ? await addresses.getByClientId(project.client_id)
    : [];

  // Installation address for this project
  const projectAddressList = await addresses.getByProjectId(projectId);

  // Design params (may not exist yet for brand new projects)
  const dp = await designParams.getByProjectId(projectId);

  // Rooms with all their children
  const projectRooms = await rooms.getByProjectId(projectId);
  for (const room of projectRooms) {
    room.elements        = await elements.getByRoomId(room.id);
    room.emitters        = await roomEmitters.getByRoomId(room.id);
    room.radiatorSchedule = await radiatorSchedule.getByRoomId(room.id);
    room.ufhSpecs         = await ufhSpecs.getByRoomId(room.id) || null;
  }

  // Library data
  const uValues      = await uValueLibrary.getByProjectId(projectId);
  const radSpecs     = await radiatorSpecs.getAll();

  return {
    ...project,
    client,
    clientAddresses,
    projectAddresses: projectAddressList,
    designParams: dp || null,
    rooms: projectRooms,
    uValueLibrary: uValues,
    radiatorSpecs: radSpecs,
  };
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
module.exports = {
  db,
  companies,
  addresses,
  clients,
  projects,
  designParams,
  rooms,
  elements,
  uValueLibrary,
  radiatorSpecs,
  roomEmitters,
  radiatorSchedule,
  ufhSpecs,
  getCompleteProject,
  cleanupAnonymousProjects,
};