// server/database.js  — PostgreSQL version
// Replaces the SQLite/sqlite3 implementation.
// Uses node-postgres (pg) connection pool.
//
// BOOLEAN columns: kept as SMALLINT (0/1) throughout to avoid type-coercion
// surprises in the React frontend, which reads booleans as 0/1 integers.
// The pg driver returns SMALLINT as JS numbers, matching prior SQLite behaviour.
//
// JSON columns: JSONB in Postgres. The CRUD layer serialises on write and
// deserialises on read so server.js and the frontend see no change.
//
// RETURNING id: Postgres does not expose lastID. INSERT queries that need the
// new row's id use RETURNING id and the helper extracts it.

const { Pool } = require('pg');

// Railway injects DATABASE_URL automatically when a Postgres service is
// attached to the project. Locally, set it in .env or export it in your shell.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway Postgres uses SSL; allow self-signed certs in hosted environments.
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err.message);
});

// ---------------------------------------------------------------------------
// QUERY HELPERS
// All CRUD functions use these three wrappers. Signatures mirror the old
// SQLite helpers so the rest of the file needs minimal changes.
// ---------------------------------------------------------------------------

// For INSERT/UPDATE/DELETE. Returns { id, changes } where id is the RETURNING
// id value (if the query has RETURNING id) and changes is the row count.
const runQuery = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return {
    id:      result.rows[0]?.id ?? null,
    changes: result.rowCount,
  };
};

// For SELECT that returns a single row (or null).
const getQuery = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return result.rows[0] ?? null;
};

// For SELECT that returns multiple rows.
const allQuery = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return result.rows;
};

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------
const users = {
  getById: (id) =>
    getQuery('SELECT * FROM users WHERE id = $1', [id]),

  getByEmail: (email) =>
    getQuery('SELECT * FROM users WHERE email = $1', [email]),

  create: (data) => runQuery(`
    INSERT INTO users (company_id, email, name, password_hash, role)
    VALUES ($1, $2, $3, $4, 'engineer')
    RETURNING id`,
    [data.companyId, data.email, data.name, data.passwordHash]
  ),
};

// ---------------------------------------------------------------------------
// COMPANIES
// ---------------------------------------------------------------------------
const companies = {
  getById: (id) => getQuery('SELECT * FROM companies WHERE id = $1', [id]),

  update: (id, data) => runQuery(`
    UPDATE companies
    SET name = $1, mcs_number = $2, recc_number = $3,
        address = $4, postcode = $5, email = $6, phone = $7, website = $8,
        updated_at = NOW()
    WHERE id = $9`,
    [data.name, data.mcsNumber, data.reccNumber,
     data.address, data.postcode, data.email, data.phone, data.website, id]
  ),
};

// ---------------------------------------------------------------------------
// ADDRESSES
// ---------------------------------------------------------------------------
const addresses = {
  getById: (id) =>
    getQuery('SELECT * FROM addresses WHERE id = $1', [id]),

  getByClientId: (clientId) => allQuery(`
    SELECT a.*, ca.address_type, ca.is_primary
    FROM addresses a
    JOIN client_addresses ca ON ca.address_id = a.id
    WHERE ca.client_id = $1
    ORDER BY ca.is_primary DESC, a.id ASC`, [clientId]
  ),

  getByProjectId: (projectId) => allQuery(`
    SELECT a.*, pa.address_type, pa.is_primary
    FROM addresses a
    JOIN project_addresses pa ON pa.address_id = a.id
    WHERE pa.project_id = $1
    ORDER BY pa.is_primary DESC, a.id ASC`, [projectId]
  ),

  create: (data) => runQuery(`
    INSERT INTO addresses
      (company_id, address_line_1, address_line_2, town, county, postcode, what3words)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id`,
    [data.companyId || null, data.addressLine1, data.addressLine2,
     data.town, data.county, data.postcode, data.what3words]
  ),

  update: (id, data) => runQuery(`
    UPDATE addresses
    SET address_line_1 = $1, address_line_2 = $2, town = $3, county = $4,
        postcode = $5, what3words = $6, updated_at = NOW()
    WHERE id = $7`,
    [data.addressLine1, data.addressLine2, data.town,
     data.county, data.postcode, data.what3words, id]
  ),

  delete: (id) => runQuery('DELETE FROM addresses WHERE id = $1', [id]),

  linkToClient: (clientId, addressId, addressType = 'contact', isPrimary = 0) =>
    runQuery(`
      INSERT INTO client_addresses (client_id, address_id, address_type, is_primary)
      VALUES ($1, $2, $3, $4)`,
      [clientId, addressId, addressType, isPrimary ? 1 : 0]
    ),

  linkToProject: (projectId, addressId, addressType = 'installation', isPrimary = 1) =>
    runQuery(`
      INSERT INTO project_addresses (project_id, address_id, address_type, is_primary)
      VALUES ($1, $2, $3, $4)`,
      [projectId, addressId, addressType, isPrimary ? 1 : 0]
    ),

  setClientPrimary: async (clientId, addressId) => {
    await runQuery(
      'UPDATE client_addresses SET is_primary = 0 WHERE client_id = $1', [clientId]
    );
    return runQuery(
      'UPDATE client_addresses SET is_primary = 1 WHERE client_id = $1 AND address_id = $2',
      [clientId, addressId]
    );
  },

  setProjectPrimary: async (projectId, addressId) => {
    await runQuery(
      'UPDATE project_addresses SET is_primary = 0 WHERE project_id = $1', [projectId]
    );
    return runQuery(
      'UPDATE project_addresses SET is_primary = 1 WHERE project_id = $1 AND address_id = $2',
      [projectId, addressId]
    );
  },
};

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------
const clients = {
  getAll: (companyId) =>
    allQuery(`
      SELECT c.*,
        a.address_line_1, a.address_line_2, a.town, a.county,
        a.postcode, a.what3words
      FROM clients c
      LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_primary = 1
      LEFT JOIN addresses a ON a.id = ca.address_id
      WHERE c.company_id = $1
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
      WHERE c.id = $1`, [id]
    ),

  search: (query, companyId) => {
    const term = `%${query}%`;
    return allQuery(`
      SELECT c.*,
        a.address_line_1, a.town, a.postcode
      FROM clients c
      LEFT JOIN client_addresses ca ON ca.client_id = c.id AND ca.is_primary = 1
      LEFT JOIN addresses a ON a.id = ca.address_id
      WHERE c.company_id = $1
        AND (
          c.first_name ILIKE $2
          OR c.surname ILIKE $3
          OR a.postcode ILIKE $4
          OR (c.first_name || ' ' || c.surname) ILIKE $5
        )
      ORDER BY c.surname, c.first_name
      LIMIT 10`, [companyId, term, term, term, term]
    );
  },

  create: (data) => runQuery(`
    INSERT INTO clients
      (company_id, title, first_name, surname, email, telephone, mobile, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [data.companyId, data.title, data.firstName, data.surname,
     data.email, data.telephone, data.mobile, data.notes]
  ),

  update: (id, data) => runQuery(`
    UPDATE clients
    SET title = $1, first_name = $2, surname = $3, email = $4,
        telephone = $5, mobile = $6, notes = $7,
        updated_at = NOW()
    WHERE id = $8`,
    [data.title, data.firstName, data.surname, data.email,
     data.telephone, data.mobile, data.notes, id]
  ),

  delete: (id) => runQuery('DELETE FROM clients WHERE id = $1', [id]),
};

// ---------------------------------------------------------------------------
// PROJECTS
// ---------------------------------------------------------------------------
const projects = {
  getAll: (companyId) =>
    allQuery('SELECT * FROM projects WHERE company_id = $1 ORDER BY updated_at DESC', [companyId]),

  getById: (id) =>
    getQuery('SELECT * FROM projects WHERE id = $1', [id]),

  create: (data) => runQuery(`
    INSERT INTO projects (company_id, client_id, name, status, designer, brief_notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id`,
    [data.companyId || null, data.clientId || null,
     data.name, data.status || 'enquiry', data.designer || '', data.briefNotes || '']
  ),

  // Anonymous project — company_id NULL, expires 48 hours from now.
  createAnonymous: (sessionToken) => runQuery(`
    INSERT INTO projects
      (company_id, client_id, name, status, session_token, expires_at)
    VALUES (NULL, NULL, 'My Project', 'enquiry', $1, NOW() + INTERVAL '48 hours')
    RETURNING id`,
    [sessionToken]
  ),

  // Find a live anonymous project by session token.
  getBySessionToken: (sessionToken) =>
    getQuery(`
      SELECT * FROM projects
      WHERE session_token = $1
        AND expires_at > NOW()`,
      [sessionToken]
    ),

  // Extend the 48-hour window on activity.
  refreshAnonymousExpiry: (sessionToken) =>
    runQuery(`
      UPDATE projects
      SET expires_at = NOW() + INTERVAL '48 hours'
      WHERE session_token = $1`,
      [sessionToken]
    ),

  getByUserId: (userId) =>
    allQuery(`
      SELECT * FROM projects
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
      [userId]
    ),

  // Claim an anonymous project for a newly registered user.
  // Also migrates any radiator specs added during the anonymous session so
  // the user doesn't lose library entries they created before registering.
  // Both updates run in a single transaction — either both commit or neither does.
  claimForUser: async (sessionToken, userId, companyId) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const projectResult = await client.query(`
        UPDATE projects
        SET user_id       = $1,
            company_id    = $2,
            session_token = NULL,
            expires_at    = NULL,
            updated_at    = NOW()
        WHERE session_token = $3`,
        [userId, companyId, sessionToken]
      );

      // Migrate any radiator specs created during this anonymous session.
      // Moves them from scope='anonymous'/session_token to scope='company'/company_id
      // so they appear in the user's library immediately after registration.
      await client.query(`
        UPDATE radiator_specs
        SET scope         = 'company',
            company_id    = $1,
            session_token = NULL
        WHERE scope         = 'anonymous'
          AND session_token = $2`,
        [companyId, sessionToken]
      );

      await client.query('COMMIT');
      return { id: null, changes: projectResult.rowCount };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  update: (id, data) => runQuery(`
    UPDATE projects
    SET name = $1, status = $2, designer = $3, brief_notes = $4,
        updated_at = NOW()
    WHERE id = $5`,
    [data.name, data.status, data.designer, data.briefNotes, id]
  ),

  delete: (id) => runQuery('DELETE FROM projects WHERE id = $1', [id]),
};

// ---------------------------------------------------------------------------
// ANONYMOUS SESSION CLEANUP
// Deletes expired anonymous projects. Called once at server startup.
// ---------------------------------------------------------------------------
function cleanupAnonymousProjects() {
  return pool.query(`
    DELETE FROM projects
    WHERE session_token IS NOT NULL
      AND expires_at < NOW()
  `).then(result => {
    if (result.rowCount > 0) {
      console.log(`Startup cleanup: removed ${result.rowCount} expired anonymous project(s)`);
    }
    // Also remove anonymous radiator specs with no live matching project.
    // A spec is orphaned when its session_token no longer exists in projects.
    return pool.query(`
      DELETE FROM radiator_specs
      WHERE scope = 'anonymous'
        AND session_token NOT IN (
          SELECT session_token FROM projects
          WHERE session_token IS NOT NULL
        )
    `);
  }).then(result => {
    if (result.rowCount > 0) {
      console.log(`Startup cleanup: removed ${result.rowCount} orphaned anonymous radiator spec(s)`);
    }
  }).catch(err => {
    console.error('Anonymous cleanup error:', err.message);
  });
}

// ---------------------------------------------------------------------------
// DESIGN PARAMS
// One row per project. Created automatically when a project is first saved.
// ---------------------------------------------------------------------------
const designParams = {
  getByProjectId: (projectId) =>
    getQuery('SELECT * FROM design_params WHERE project_id = $1', [projectId]),

  // Seed the defaults row immediately after project creation.
  createForProject: (projectId) => runQuery(`
    INSERT INTO design_params (project_id) VALUES ($1)
    ON CONFLICT (project_id) DO NOTHING`,
    [projectId]
  ),

  update: (projectId, data) => runQuery(`
    UPDATE design_params SET
      external_temp = $1, annual_avg_temp = $2, design_flow_temp = $3,
      design_return_temp = $4, air_density = $5, specific_heat = $6,
      mcs_postcode_prefix = $7, mcs_degree_days = $8, mcs_outdoor_low_temp = $9,
      use_sap_ventilation = $10, building_category = $11, dwelling_type = $12,
      number_of_storeys = $13, shelter_factor = $14, number_of_bedrooms = $15,
      has_blower_test = $16, sap_age_band = $17, air_permeability_q50 = $18,
      number_of_chimneys = $19, number_of_open_flues = $20,
      number_of_intermittent_fans = $21, number_of_passive_vents = $22,
      ventilation_system_type = $23, mvhr_efficiency = $24,
      heat_pump_manufacturer = $25, heat_pump_model = $26,
      heat_pump_rated_output = $27, heat_pump_min_modulation = $28,
      heat_pump_flow_temp = $29, heat_pump_return_temp = $30,
      mcs_heat_pump_type = $31, mcs_emitter_type = $32, mcs_ufh_type = $33,
      mcs_system_provides = $34, mcs_bedrooms = $35, mcs_occupants = $36,
      mcs_cylinder_volume = $37, mcs_pasteurization_freq = $38,
      mcs_heat_pump_sound_power = $39,
      mcs_sound_assessments = $40, mcs_sound_snapshot = $41,
      mcs_calculation_snapshot = $42,
      circuits = $43, pipe_sections = $44,
      epc_space_heating_demand = $45, epc_hot_water_demand = $46,
      epc_total_floor_area = $47,
      heat_pump_internal_volume = $48, buffer_vessel_volume = $49,
      en14511_test_points = $50, defrost_pct = $51,
      ventilation_method = $52, air_permeability_method = $53,
      q50 = $54, sap_structural = $55, sap_floor = $56,
      sap_window_draught_pct = $57, sap_draught_lobby = $58,
      building_storeys = $59, building_shielding = $60, reference_temp = $61,
      updated_at = NOW()
    WHERE project_id = $62`,
    [
      data.externalTemp,          data.annualAvgTemp,         data.designFlowTemp,
      data.designReturnTemp,      data.airDensity,            data.specificHeat,
      data.mcsPostcodePrefix,     data.mcsDegreeDays,         data.mcsOutdoorLowTemp,
      data.useSAPVentilation ? 1 : 0,
      data.buildingCategory,      data.dwellingType,
      data.numberOfStoreys,       data.shelterFactor,         data.numberOfBedrooms,
      data.hasBlowerTest ? 1 : 0, data.sapAgeBand,            data.airPermeabilityQ50,
      data.numberOfChimneys,      data.numberOfOpenFlues,
      data.numberOfIntermittentFans, data.numberOfPassiveVents,
      data.ventilationSystemType, data.mvhrEfficiency,
      data.heatPumpManufacturer,  data.heatPumpModel,
      data.heatPumpRatedOutput,   data.heatPumpMinModulation ?? 0,
      data.heatPumpFlowTemp,      data.heatPumpReturnTemp,
      data.mcsHeatPumpType,       data.mcsEmitterType,        data.mcsUFHType,
      data.mcsSystemProvides,     data.mcsBedrooms,           data.mcsOccupants,
      data.mcsCylinderVolume,     data.mcsPasteurizationFreq,
      data.mcsHeatPumpSoundPower,
      // JSONB columns — serialise on write; pg will deserialise on read
      JSON.stringify(data.mcsSoundAssessments || []),
      data.mcsSoundSnapshot      ? JSON.stringify(data.mcsSoundSnapshot)      : null,
      data.mcsCalculationSnapshot ? JSON.stringify(data.mcsCalculationSnapshot) : null,
      data.circuits              ? JSON.stringify(data.circuits)              : null,
      data.pipeSections          ? JSON.stringify(data.pipeSections)          : null,
      data.epcSpaceHeatingDemand, data.epcHotWaterDemand,     data.epcTotalFloorArea,
      data.heatPumpInternalVolume ?? 0,
      data.bufferVesselVolume     ?? 0,
      data.en14511TestPoints     ? JSON.stringify(data.en14511TestPoints)     : null,
      data.defrostPct            ?? 5,
      data.ventilationMethod     || 'en12831_cibse2026',
      data.airPermeabilityMethod || 'estimated',
      data.q50                   ?? 12.0,
      data.sapStructural         || 'masonry',
      data.sapFloor              || 'other',
      data.sapWindowDraughtPct   ?? 100,
      data.sapDraughtLobby       ?? 0,
      data.buildingStoreys       ?? 2,
      data.buildingShielding     || 'normal',
      data.referenceTemp         ?? 10.6,
      projectId,
    ]
  ),
};

// ---------------------------------------------------------------------------
// ROOMS
// ---------------------------------------------------------------------------
const rooms = {
  getByProjectId: (projectId) =>
    allQuery('SELECT * FROM rooms WHERE project_id = $1 ORDER BY id', [projectId]),

  getById: (id) =>
    getQuery('SELECT * FROM rooms WHERE id = $1', [id]),

  create: (data) => runQuery(`
    INSERT INTO rooms
      (project_id, name, internal_temp, volume, floor_area,
       room_length, room_width, room_height,
       room_type, has_manual_ach_override, manual_ach,
       extract_fan_flow_rate, has_open_fire,
       min_air_flow, infiltration_rate, mechanical_supply, mechanical_extract,
       design_connection_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18)
    RETURNING id`,
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
      name = $1, internal_temp = $2, volume = $3, floor_area = $4,
      room_length = $5, room_width = $6, room_height = $7,
      room_type = $8, has_manual_ach_override = $9, manual_ach = $10,
      extract_fan_flow_rate = $11, has_open_fire = $12,
      min_air_flow = $13, infiltration_rate = $14,
      mechanical_supply = $15, mechanical_extract = $16,
      design_connection_type = $17,
      thermal_bridging_addition = $18,
      exposed_envelope_m2 = $19, has_suspended_floor = $20, is_top_storey = $21,
      bg_vent_count = $22, bg_fan_count = $23,
      bg_flue_small_count = $24, bg_flue_large_count = $25, bg_open_fire_count = $26,
      continuous_vent_type = $27, continuous_vent_rate_m3h = $28, mvhr_efficiency = $29
    WHERE id = $30`,
    [data.name, data.internalTemp, data.volume, data.floorArea,
     data.roomLength, data.roomWidth, data.roomHeight,
     data.roomType || 'living_room',
     data.hasManualACHOverride ? 1 : 0, data.manualACH || 0,
     data.extractFanFlowRate || 0, data.hasOpenFire ? 1 : 0,
     data.minAirFlow, data.infiltrationRate,
     data.mechanicalSupply, data.mechanicalExtract,
     data.designConnectionType || 'BOE',
     data.thermalBridgingAddition ?? 0.10,
     data.exposedEnvelopeM2      ?? 0,
     data.hasSuspendedFloor      ?? 0,
     data.isTopStorey            ?? 0,
     data.bgVentCount            ?? 0,
     data.bgFanCount             ?? 0,
     data.bgFlueSmallCount       ?? 0,
     data.bgFlueLargeCount       ?? 0,
     data.bgOpenFireCount        ?? 0,
     data.continuousVentType     || 'none',
     data.continuousVentRateM3h  ?? 0,
     data.mvhrEfficiency         ?? 0,
     id]
  ),

  delete: (id) => runQuery('DELETE FROM rooms WHERE id = $1', [id]),
};

// ---------------------------------------------------------------------------
// ELEMENTS
// ---------------------------------------------------------------------------
const elements = {
  getByRoomId: (roomId) =>
    allQuery('SELECT * FROM elements WHERE room_id = $1 ORDER BY id', [roomId]),

  getById: (id) =>
    getQuery('SELECT * FROM elements WHERE id = $1', [id]),

  create: (data) => runQuery(`
    INSERT INTO elements
      (room_id, element_type, description, length, height, area,
       u_value, temp_factor, custom_delta_t, subtract_from_element_id,
       include_in_envelope)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id`,
    [data.roomId, data.elementType, data.description,
     data.length, data.height, data.area, data.uValue, data.tempFactor,
     data.customDeltaT ?? null, data.subtractFromElementId ?? null,
     data.includeInEnvelope ?? 0]
  ),

  update: (id, data) => runQuery(`
    UPDATE elements SET
      element_type = $1, description = $2, length = $3, height = $4, area = $5,
      u_value = $6, temp_factor = $7, custom_delta_t = $8,
      subtract_from_element_id = $9, include_in_envelope = $10
    WHERE id = $11`,
    [data.elementType, data.description, data.length, data.height, data.area,
     data.uValue, data.tempFactor, data.customDeltaT ?? null,
     data.subtractFromElementId || null,
     data.includeInEnvelope ?? 0,
     id]
  ),

  delete: (id) => runQuery('DELETE FROM elements WHERE id = $1', [id]),
};

// ---------------------------------------------------------------------------
// U-VALUE LIBRARY
// ---------------------------------------------------------------------------
const uValueLibrary = {
  getByProjectId: (projectId) =>
    allQuery(
      'SELECT * FROM u_value_library WHERE project_id = $1 ORDER BY element_category, name',
      [projectId]
    ),

  create: (data) => runQuery(`
    INSERT INTO u_value_library (project_id, element_category, name, u_value, notes)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id`,
    [data.projectId, data.elementCategory, data.name, data.uValue, data.notes || '']
  ),

  update: (id, data) => runQuery(`
    UPDATE u_value_library
    SET element_category = $1, name = $2, u_value = $3, notes = $4
    WHERE id = $5`,
    [data.elementCategory, data.name, data.uValue, data.notes || '', id]
  ),

  delete: (id) => runQuery('DELETE FROM u_value_library WHERE id = $1', [id]),
};

// ---------------------------------------------------------------------------
// RADIATOR SPECS
// Three visibility tiers:
//   scope = 'global'    — seeded manufacturer data, visible to everyone
//   scope = 'company'   — engineer's own library, scoped to their company_id
//   scope = 'anonymous' — added during an anonymous session, scoped to
//                         session_token, cleaned up with the session
// ---------------------------------------------------------------------------
const radiatorSpecs = {
  // Returns global specs + the caller's own specs (company or anonymous).
  // companyId and sessionToken are both optional — pass whichever applies.
  // The WHERE clause safely ignores NULL values (NULL = x is always false).
  getAll: ({ companyId = null, sessionToken = null } = {}) =>
    allQuery(`
      SELECT * FROM radiator_specs
      WHERE scope IN ('global', 'library')
         OR (scope = 'company'   AND company_id    = $1)
         OR (scope = 'anonymous' AND session_token = $2)
      ORDER BY manufacturer, model, type, height, length`,
      [companyId, sessionToken]
    ),

  getById: (id) =>
    getQuery('SELECT * FROM radiator_specs WHERE id = $1', [id]),

  create: (data) => runQuery(`
    INSERT INTO radiator_specs
      (manufacturer, model, type, height, length,
       output_dt50, water_volume, notes, source, scope,
       company_id, session_token)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id`,
    [data.manufacturer, data.model, data.type,
     data.height, data.length, data.outputDt50,
     data.waterVolume, data.notes || '',
     data.source || 'library',
     data.scope || 'company',
     data.companyId    || null,
     data.sessionToken || null]
  ),

  update: (id, data) => runQuery(`
    UPDATE radiator_specs SET
      manufacturer = $1, model = $2, type = $3, height = $4, length = $5,
      output_dt50 = $6, water_volume = $7, notes = $8, source = $9, scope = $10,
      company_id = $11, session_token = $12
    WHERE id = $13`,
    [data.manufacturer, data.model, data.type,
     data.height, data.length, data.outputDt50,
     data.waterVolume, data.notes || '',
     data.source || 'library',
     data.scope || 'company',
     data.companyId    || null,
     data.sessionToken || null,
     id]
  ),

  // Only allow deletion of non-global specs, and only by the owner.
  // server.js enforces this at the route level — this is a belt-and-braces guard.
  delete: (id) =>
    runQuery(`DELETE FROM radiator_specs WHERE id = $1 AND scope NOT IN ('global', 'library')`, [id]),
};

// ---------------------------------------------------------------------------
// ROOM EMITTERS
// ---------------------------------------------------------------------------
const roomEmitters = {
  getByRoomId: (roomId) =>
    allQuery('SELECT * FROM room_emitters WHERE room_id = $1', [roomId]),

  getById: (id) =>
    getQuery('SELECT * FROM room_emitters WHERE id = $1', [id]),

  create: (data) => runQuery(`
    INSERT INTO room_emitters
      (room_id, emitter_type, radiator_spec_id, connection_type, quantity, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id`,
    [data.roomId, data.emitterType, data.radiatorSpecId || null,
     data.connectionType || null, data.quantity || 1, data.notes || '']
  ),

  update: (id, data) => runQuery(`
    UPDATE room_emitters SET
      emitter_type = $1, radiator_spec_id = $2, connection_type = $3,
      quantity = $4, notes = $5
    WHERE id = $6`,
    [data.emitterType, data.radiatorSpecId || null, data.connectionType || null,
     data.quantity || 1, data.notes || '', id]
  ),

  delete: (id) => runQuery('DELETE FROM room_emitters WHERE id = $1', [id]),
};

// ---------------------------------------------------------------------------
// UFH SPECS — per room, one row per room (UNIQUE constraint on room_id)
// ---------------------------------------------------------------------------
const ufhSpecs = {
  getByRoomId: (roomId) =>
    getQuery('SELECT * FROM room_ufh_specs WHERE room_id = $1', [roomId])
      .catch(() => null),

  upsert: (roomId, data) => runQuery(`
    INSERT INTO room_ufh_specs
      (room_id, floor_construction, pipe_spacing_mm, pipe_od_m,
       screed_depth_above_pipe_m, lambda_screed,
       floor_covering, r_lambda, active_area_factor,
       zone_type, notes, ufh_flow_temp, ufh_return_temp, has_actuator, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    ON CONFLICT (room_id) DO UPDATE SET
      floor_construction          = EXCLUDED.floor_construction,
      pipe_spacing_mm             = EXCLUDED.pipe_spacing_mm,
      pipe_od_m                   = EXCLUDED.pipe_od_m,
      screed_depth_above_pipe_m   = EXCLUDED.screed_depth_above_pipe_m,
      lambda_screed               = EXCLUDED.lambda_screed,
      floor_covering              = EXCLUDED.floor_covering,
      r_lambda                    = EXCLUDED.r_lambda,
      active_area_factor          = EXCLUDED.active_area_factor,
      zone_type                   = EXCLUDED.zone_type,
      notes                       = EXCLUDED.notes,
      ufh_flow_temp               = EXCLUDED.ufh_flow_temp,
      ufh_return_temp             = EXCLUDED.ufh_return_temp,
      has_actuator                = EXCLUDED.has_actuator,
      updated_at                  = NOW()`,
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
    runQuery('DELETE FROM room_ufh_specs WHERE room_id = $1', [roomId]),
};

// ---------------------------------------------------------------------------
// RADIATOR SCHEDULE
// ---------------------------------------------------------------------------
const radiatorSchedule = {
  getByRoomId: (roomId) =>
    allQuery(
      'SELECT * FROM radiator_schedule WHERE room_id = $1 ORDER BY display_order, id',
      [roomId]
    ),

  create: (data) => runQuery(`
    INSERT INTO radiator_schedule
      (room_id, radiator_spec_id, connection_type, quantity,
       notes, is_existing, emitter_status, display_order,
       enclosure_factor, finish_factor, no_trv)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id`,
    [data.roomId, data.radiatorSpecId, data.connectionType || 'BOE',
     data.quantity || 1, data.notes || '',
     data.isExisting  ? 1 : 0,
     data.emitterStatus || 'new',
     data.displayOrder || 0,
     data.enclosureFactor ?? 1.00,
     data.finishFactor    ?? 1.00,
     data.noTrv ? 1 : 0]
  ),

  update: (id, data) => runQuery(`
    UPDATE radiator_schedule SET
      radiator_spec_id = $1, connection_type = $2, quantity = $3,
      notes = $4, is_existing = $5, emitter_status = $6, display_order = $7,
      enclosure_factor = $8, finish_factor = $9, no_trv = $10
    WHERE id = $11`,
    [data.radiatorSpecId, data.connectionType || 'BOE', data.quantity || 1,
     data.notes || '',
     data.isExisting  ? 1 : 0,
     data.emitterStatus || 'new',
     data.displayOrder || 0,
     data.enclosureFactor ?? 1.00,
     data.finishFactor    ?? 1.00,
     data.noTrv ? 1 : 0,
     id]
  ),

  delete: (id) => runQuery('DELETE FROM radiator_schedule WHERE id = $1', [id]),

  markRoomComplete: (roomId, isComplete) =>
    runQuery(
      'UPDATE rooms SET radiator_schedule_complete = $1 WHERE id = $2',
      [isComplete ? 1 : 0, roomId]
    ),
};

// ---------------------------------------------------------------------------
// GET COMPLETE PROJECT
// Assembles everything the frontend needs with minimal round-trips.
//
// Strategy:
//   Batch 1 (parallel): project + designParams + rooms + uValueLibrary + radSpecs
//   Batch 2 (parallel): client + clientAddresses + projectAddresses
//                     + ALL room sub-data fetched once per type using ANY($1)
//
// For N rooms this is 7 queries total regardless of room count,
// vs the previous 6 + 4N sequential queries.
// ---------------------------------------------------------------------------
async function getCompleteProject(projectId, { companyId = null, sessionToken = null } = {}) {
  // Batch 1 — things we can fetch knowing only the projectId
  const [project, dp, projectRooms, uValues, radSpecs] = await Promise.all([
    projects.getById(projectId),
    designParams.getByProjectId(projectId),
    rooms.getByProjectId(projectId),
    uValueLibrary.getByProjectId(projectId),
    radiatorSpecs.getAll({ companyId, sessionToken }),
  ]);

  if (!project) return null;

  // Ownership check:
  // - Registered user (companyId set): project must belong to their company.
  // - Anonymous user (companyId null, sessionToken set): project session_token
  //   must match. Only applies to anonymous projects (session_token NOT NULL) —
  //   claimed/registered projects have session_token NULL and are skipped.
  if (companyId !== null && project.company_id !== companyId) return null;
  if (companyId === null && sessionToken !== null && project.session_token !== null && project.session_token !== sessionToken) return null;

  const roomIds = projectRooms.map(r => r.id);

  // Batch 2 — client data (needs project.client_id) + all room sub-data in
  // one query per type using ANY($1) rather than one query per room.
  const [
    client,
    clientAddresses,
    projectAddressList,
    allElements,
    allEmitters,
    allRadSchedule,
    allUfhSpecs,
  ] = await Promise.all([
    project.client_id ? clients.getById(project.client_id) : Promise.resolve(null),
    project.client_id ? addresses.getByClientId(project.client_id) : Promise.resolve([]),
    addresses.getByProjectId(projectId),

    // Fetch all elements / emitters / schedule / UFH for every room at once
    roomIds.length
      ? allQuery('SELECT * FROM elements WHERE room_id = ANY($1) ORDER BY room_id, id', [roomIds])
      : Promise.resolve([]),
    roomIds.length
      ? allQuery('SELECT * FROM room_emitters WHERE room_id = ANY($1)', [roomIds])
      : Promise.resolve([]),
    roomIds.length
      ? allQuery(
          'SELECT * FROM radiator_schedule WHERE room_id = ANY($1) ORDER BY room_id, display_order, id',
          [roomIds]
        )
      : Promise.resolve([]),
    roomIds.length
      ? allQuery('SELECT * FROM room_ufh_specs WHERE room_id = ANY($1)', [roomIds])
      : Promise.resolve([]),
  ]);

  // Stitch sub-data back onto each room in JS — no extra round-trips
  for (const room of projectRooms) {
    room.elements         = allElements.filter(e => e.room_id === room.id);
    room.emitters         = allEmitters.filter(e => e.room_id === room.id);
    room.radiatorSchedule = allRadSchedule.filter(e => e.room_id === room.id);
    room.ufhSpecs         = allUfhSpecs.find(e => e.room_id === room.id) || null;
  }

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
// OWNERSHIP HELPERS
// Fast lookups used by server.js to verify sub-resource ownership without
// fetching the full project. Returns the project row or null.
// ---------------------------------------------------------------------------
async function getProjectForRoom(roomId) {
  return getQuery(
    'SELECT p.* FROM projects p JOIN rooms r ON r.project_id = p.id WHERE r.id = $1',
    [roomId]
  );
}

async function getProjectForElement(elementId) {
  return getQuery(
    'SELECT p.* FROM projects p JOIN rooms r ON r.project_id = p.id JOIN elements e ON e.room_id = r.id WHERE e.id = $1',
    [elementId]
  );
}

async function getProjectForUValue(uValueId) {
  return getQuery(
    'SELECT p.* FROM projects p JOIN u_value_library u ON u.project_id = p.id WHERE u.id = $1',
    [uValueId]
  );
}

async function getProjectForEmitter(emitterId) {
  return getQuery(
    'SELECT p.* FROM projects p JOIN rooms r ON r.project_id = p.id JOIN room_emitters e ON e.room_id = r.id WHERE e.id = $1',
    [emitterId]
  );
}

async function getProjectForScheduleItem(scheduleItemId) {
  return getQuery(
    'SELECT p.* FROM projects p JOIN rooms r ON r.project_id = p.id JOIN radiator_schedule s ON s.room_id = r.id WHERE s.id = $1',
    [scheduleItemId]
  );
}

// Returns true if the request context (registered user or anon token) owns the project.
function ownsProject(project, req) {
  if (!project) return false;
  if (req.user) return project.company_id === req.user.companyId;
  return project.session_token === req.anonToken;
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
module.exports = {
  pool,            // exported so server.js can call pool.end() on shutdown if needed
  companies,
  addresses,
  clients,
  users,
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
  getProjectForRoom,
  getProjectForElement,
  getProjectForUValue,
  getProjectForEmitter,
  getProjectForScheduleItem,
  ownsProject,
  // waitForDb is gone — no longer needed with Postgres connection pool.
  // server.js startup sequence is now a simple async IIFE (see migrate.js notes).
};
