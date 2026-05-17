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

  updatePassword: (id, passwordHash) =>
    runQuery(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, id]
    ),

  setActive: (id, isActive) =>
    runQuery(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [isActive ? 1 : 0, id]
    ),

  // Admin: list all registered users with their company name and project count.
  // Excludes anonymous projects (session_token IS NULL filters to claimed projects only).
  getAllForAdmin: () =>
    allQuery(`
      SELECT
        u.id, u.email, u.name, u.role, u.plan, u.is_active, u.is_admin,
        u.created_at,
        c.id   AS company_id,
        c.name AS company_name,
        COUNT(p.id)::INTEGER AS project_count
      FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      LEFT JOIN projects  p ON p.company_id = c.id AND p.session_token IS NULL
      GROUP BY u.id, c.id, c.name
      ORDER BY u.created_at DESC
    `),
};

// ---------------------------------------------------------------------------
// PASSWORD RESET TOKENS
// ---------------------------------------------------------------------------
const passwordResetTokens = {
  create: (userId, token, expiresAt) =>
    runQuery(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3) RETURNING id`,
      [userId, token, expiresAt]
    ),

  // Returns the token row only if it exists, is not expired, and has not been used.
  getValid: (token) =>
    getQuery(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1
         AND expires_at > NOW()
         AND used_at IS NULL`,
      [token]
    ),

  markUsed: (id) =>
    runQuery(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [id]
    ),

  // Delete all tokens for a user after a successful reset (belt-and-braces cleanup).
  deleteForUser: (userId) =>
    runQuery(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [userId]
    ),
};

// ---------------------------------------------------------------------------
// PIPE MATERIALS LIBRARY
// ---------------------------------------------------------------------------
const pipeMaterialsLib = {
  // Get all materials for a company (global seed + company-specific).
  // Returns materials with their sizes joined as a JSON array.
  getForCompany: (companyId) =>
    allQuery(`
      SELECT
        pm.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id',               pms.id,
              'nominalSize',      pms.nominal_size,
              'externalDiameter', pms.external_diameter,
              'internalDiameter', pms.internal_diameter,
              'wallThickness',    pms.wall_thickness,
              'displayOrder',     pms.display_order
            ) ORDER BY pms.display_order
          ) FILTER (WHERE pms.id IS NOT NULL),
          '[]'
        ) AS sizes
      FROM pipe_materials pm
      LEFT JOIN pipe_material_sizes pms ON pms.pipe_material_id = pm.id
      WHERE pm.company_id = $1
         OR pm.company_id = 1
      GROUP BY pm.id
      ORDER BY pm.scope DESC, pm.display_order, pm.name
    `, [companyId]),

  // Ensure global seed rows exist for a company (called on first pipe sizing load).
  // Copies global rows from company_id=1 to the target company if not already present.
  ensureGlobalForCompany: async (companyId) => {
    if (companyId === 1) return; // Already seeded
    const globals = await allQuery(
      `SELECT * FROM pipe_materials WHERE company_id = 1 AND scope = 'global'`
    );
    for (const mat of globals) {
      const exists = await getQuery(
        `SELECT id FROM pipe_materials WHERE company_id = $1 AND material_key = $2`,
        [companyId, mat.material_key]
      );
      if (!exists) {
        const ins = await pool.query(
          `INSERT INTO pipe_materials
             (company_id, scope, material_key, name, description, roughness_mm, max_velocity, display_order)
           VALUES ($1, 'global', $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [companyId, mat.material_key, mat.name, mat.description, mat.roughness_mm, mat.max_velocity, mat.display_order]
        );
        const sizes = await allQuery(
          `SELECT * FROM pipe_material_sizes WHERE pipe_material_id = $1 ORDER BY display_order`,
          [mat.id]
        );
        for (const s of sizes) {
          await pool.query(
            `INSERT INTO pipe_material_sizes
               (pipe_material_id, nominal_size, external_diameter, internal_diameter, wall_thickness, display_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [ins.rows[0].id, s.nominal_size, s.external_diameter, s.internal_diameter, s.wall_thickness, s.display_order]
          );
        }
      }
    }
  },

  create: (companyId, data) =>
    pool.query(
      `INSERT INTO pipe_materials
         (company_id, scope, material_key, name, description, roughness_mm, max_velocity, display_order)
       VALUES ($1, 'company', $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [companyId, data.materialKey, data.name, data.description, data.roughnessMm, data.maxVelocity, data.displayOrder ?? 99]
    ),

  addSize: (pipeMaterialId, data) =>
    runQuery(
      `INSERT INTO pipe_material_sizes
         (pipe_material_id, nominal_size, external_diameter, internal_diameter, wall_thickness, display_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [pipeMaterialId, data.nominalSize, data.externalDiameter, data.internalDiameter, data.wallThickness, data.displayOrder ?? 0]
    ),

  update: (id, companyId, data) =>
    runQuery(
      `UPDATE pipe_materials
       SET name=$1, description=$2, roughness_mm=$3, max_velocity=$4
       WHERE id=$5 AND company_id=$6 AND scope='company'`,
      [data.name, data.description, data.roughnessMm, data.maxVelocity, id, companyId]
    ),

  delete: (id, companyId) =>
    runQuery(
      `DELETE FROM pipe_materials WHERE id=$1 AND company_id=$2 AND scope='company'`,
      [id, companyId]
    ),
};

// ---------------------------------------------------------------------------
// FITTINGS LIBRARY
// ---------------------------------------------------------------------------
const fittingsLib = {
  getForCompany: (companyId) =>
    allQuery(
      `SELECT * FROM fittings
       WHERE company_id = $1 OR company_id = 1
       ORDER BY scope DESC, display_order, name`,
      [companyId]
    ),

  ensureGlobalForCompany: async (companyId) => {
    if (companyId === 1) return;
    const globals = await allQuery(
      `SELECT * FROM fittings WHERE company_id = 1 AND scope = 'global'`
    );
    for (const f of globals) {
      await pool.query(
        `INSERT INTO fittings
           (company_id, scope, fitting_key, name, k_value, description, display_order)
         VALUES ($1, 'global', $2, $3, $4, $5, $6)
         ON CONFLICT (company_id, fitting_key) DO NOTHING`,
        [companyId, f.fitting_key, f.name, f.k_value, f.description, f.display_order]
      );
    }
  },

  create: (companyId, data) =>
    pool.query(
      `INSERT INTO fittings
         (company_id, scope, fitting_key, name, k_value, description, unit_cost, display_order)
       VALUES ($1, 'company', $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [companyId, data.fittingKey, data.name, data.kValue, data.description, data.unitCost ?? 0, data.displayOrder ?? 99]
    ),

  update: (id, companyId, data) =>
    runQuery(
      `UPDATE fittings
       SET name=$1, k_value=$2, description=$3, unit_cost=$4
       WHERE id=$5 AND company_id=$6`,
      [data.name, data.kValue, data.description, data.unitCost ?? 0, id, companyId]
    ),

  // Update unit cost only — allowed on global rows too (price is company-specific)
  updateCost: (id, companyId, unitCost) =>
    runQuery(
      `UPDATE fittings SET unit_cost=$1 WHERE id=$2 AND company_id=$3`,
      [unitCost, id, companyId]
    ),

  delete: (id, companyId) =>
    runQuery(
      `DELETE FROM fittings WHERE id=$1 AND company_id=$2 AND scope='company'`,
      [id, companyId]
    ),
};

// ---------------------------------------------------------------------------
// PIPE SECTIONS
// ---------------------------------------------------------------------------
const pipeSections = {
  // Returns all sections for a project with their fittings as a nested JSON array.
  getForProject: (projectId) =>
    allQuery(`
      SELECT
        ps.*,
        pm.material_key,
        pm.name         AS material_name,
        pm.roughness_mm,
        pm.max_velocity,
        COALESCE(
          json_agg(
            json_build_object(
              'id',         psf.id,
              'fittingId',  psf.fitting_id,
              'fittingKey', f.fitting_key,
              'name',       f.name,
              'kValue',     f.k_value,
              'unitCost',   f.unit_cost,
              'quantity',   psf.quantity
            ) ORDER BY psf.id
          ) FILTER (WHERE psf.id IS NOT NULL),
          '[]'
        ) AS fittings
      FROM pipe_sections ps
      LEFT JOIN pipe_materials pm ON pm.id = ps.pipe_material_id
      LEFT JOIN pipe_section_fittings psf ON psf.pipe_section_id = ps.id
      LEFT JOIN fittings f ON f.id = psf.fitting_id
      WHERE ps.project_id = $1
      GROUP BY ps.id, pm.id
      ORDER BY ps.display_order, ps.id
    `, [projectId]),

  create: (projectId, data) =>
    pool.query(
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
        projectId, data.pipeMaterialId, data.name, data.nominalSize, data.lengthM,
        data.flowRate, data.heatLoad, data.velocity, data.pressureDrop,
        data.straightPipePressureDrop, data.fittingsPressureDrop,
        data.fittingsMethod, data.fittingPercentage, data.waterTemperature,
        data.useWholeProperty, data.includeInIndexCircuit,
        data.connectedRooms ? JSON.stringify(data.connectedRooms) : null,
        data.displayOrder ?? 0,
      ]
    ),

  update: (id, projectId, data) =>
    runQuery(
      `UPDATE pipe_sections SET
        pipe_material_id=$1, name=$2, nominal_size=$3, length_m=$4,
        flow_rate=$5, heat_load=$6, velocity=$7, pressure_drop=$8,
        straight_pipe_pressure_drop=$9, fittings_pressure_drop=$10,
        fittings_method=$11, fitting_percentage=$12, water_temperature=$13,
        use_whole_property=$14, include_in_index_circuit=$15,
        connected_rooms=$16, display_order=$17, updated_at=NOW()
       WHERE id=$18 AND project_id=$19`,
      [
        data.pipeMaterialId, data.name, data.nominalSize, data.lengthM,
        data.flowRate, data.heatLoad, data.velocity, data.pressureDrop,
        data.straightPipePressureDrop, data.fittingsPressureDrop,
        data.fittingsMethod, data.fittingPercentage, data.waterTemperature,
        data.useWholeProperty, data.includeInIndexCircuit,
        data.connectedRooms ? JSON.stringify(data.connectedRooms) : null,
        data.displayOrder ?? 0,
        id, projectId,
      ]
    ),

  delete: (id, projectId) =>
    runQuery(
      `DELETE FROM pipe_sections WHERE id=$1 AND project_id=$2`,
      [id, projectId]
    ),

  // Replace all fittings for a section atomically.
  // Called after every section save — simpler than diffing individual fittings.
  replaceFittings: async (pipeSectionId, fittingsArr) => {
    await pool.query(
      `DELETE FROM pipe_section_fittings WHERE pipe_section_id=$1`,
      [pipeSectionId]
    );
    for (const f of (fittingsArr || [])) {
      if (!f.fittingId || f.quantity < 1) continue;
      await pool.query(
        `INSERT INTO pipe_section_fittings (pipe_section_id, fitting_id, quantity)
         VALUES ($1, $2, $3)`,
        [pipeSectionId, f.fittingId, f.quantity]
      );
    }
  },
};
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
        bus_grant_status         = $5,
        bus_grant_amount         = $6,
        bus_grant_voucher_ref    = $7,
        bus_grant_voucher_expiry = $8,
        bus_grant_redemption_date= $9,
        bus_grant_paid_date      = $10,
        bus_grant_paid_amount    = $11,
        bus_grant_notes          = $12,
        updated_at = NOW()
    WHERE id = $13`,
    [
      data.name,
      data.status,
      data.designer,
      data.briefNotes,
      data.busGrantStatus          || 'not_applicable',
      data.busGrantAmount          ?? null,
      data.busGrantVoucherRef      || null,
      data.busGrantVoucherExpiry   || null,
      data.busGrantRedemptionDate  || null,
      data.busGrantPaidDate        || null,
      data.busGrantPaidAmount      ?? null,
      data.busGrantNotes           || null,
      id,
    ]
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
// ROOM SEGMENTS
// One or more rectangular segments per room, each with a ceiling type.
// The room's volume and floor_area totals are derived from these segments
// by the client and written back via rooms.update() — they are not stored
// on segments themselves.
// ---------------------------------------------------------------------------
const roomSegments = {
  getByRoomId: (roomId) =>
    allQuery(
      'SELECT * FROM room_segments WHERE room_id = $1 ORDER BY display_order, id',
      [roomId]
    ),

  create: (roomId, data) => runQuery(`
    INSERT INTO room_segments
      (room_id, label, length, width, ceiling_type, height_low, height_high, display_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [roomId,
     data.label        || '',
     data.length       ?? 0,
     data.width        ?? 0,
     data.ceilingType  || 'flat',
     data.heightLow    ?? 0,
     data.heightHigh   ?? null,
     data.displayOrder ?? 0]
  ),

  update: (id, data) => runQuery(`
    UPDATE room_segments SET
      label = $1, length = $2, width = $3,
      ceiling_type = $4, height_low = $5, height_high = $6,
      display_order = $7
    WHERE id = $8`,
    [data.label        || '',
     data.length       ?? 0,
     data.width        ?? 0,
     data.ceilingType  || 'flat',
     data.heightLow    ?? 0,
     data.heightHigh   ?? null,
     data.displayOrder ?? 0,
     id]
  ),

  delete: (id) => runQuery('DELETE FROM room_segments WHERE id = $1', [id]),
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
    allSegments,
  ] = await Promise.all([
    project.client_id ? clients.getById(project.client_id) : Promise.resolve(null),
    project.client_id ? addresses.getByClientId(project.client_id) : Promise.resolve([]),
    addresses.getByProjectId(projectId),

    // Fetch all elements / emitters / schedule / UFH / segments for every room at once
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
    roomIds.length
      ? allQuery(
          'SELECT * FROM room_segments WHERE room_id = ANY($1) ORDER BY room_id, display_order, id',
          [roomIds]
        )
      : Promise.resolve([]),
  ]);

  // Stitch sub-data back onto each room in JS — no extra round-trips
  for (const room of projectRooms) {
    room.elements         = allElements.filter(e => e.room_id === room.id);
    room.emitters         = allEmitters.filter(e => e.room_id === room.id);
    room.radiatorSchedule = allRadSchedule.filter(e => e.room_id === room.id);
    room.ufhSpecs         = allUfhSpecs.find(e => e.room_id === room.id) || null;
    room.segments         = allSegments.filter(e => e.room_id === room.id);
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
// LABOUR RATE CARDS
// Company-wide versioned rate cards. is_current enforced at application layer:
// server sets all others to false before inserting a new current card.
// ---------------------------------------------------------------------------
const labourRateCards = {
  // Returns all rate cards for a company, most recent first.
  getForCompany: (companyId) =>
    allQuery(
      `SELECT * FROM labour_rate_cards
       WHERE company_id = $1
       ORDER BY effective_from DESC, created_at DESC`,
      [companyId]
    ),

  // Returns the current rate card with its line items.
  getCurrent: async (companyId) => {
    const card = await getQuery(
      `SELECT * FROM labour_rate_cards
       WHERE company_id = $1 AND is_current = true
       LIMIT 1`,
      [companyId]
    );
    if (!card) return null;
    const items = await allQuery(
      `SELECT * FROM labour_rate_items
       WHERE rate_card_id = $1
       ORDER BY display_order, id`,
      [card.id]
    );
    return { ...card, items };
  },

  // Returns a specific card with its items — used for quote history display.
  getById: async (id) => {
    const card = await getQuery(
      'SELECT * FROM labour_rate_cards WHERE id = $1', [id]
    );
    if (!card) return null;
    const items = await allQuery(
      `SELECT * FROM labour_rate_items
       WHERE rate_card_id = $1
       ORDER BY display_order, id`,
      [card.id]
    );
    return { ...card, items };
  },

  // Create a new rate card. If isCurrent=true, demotes all others first.
  create: async (companyId, data) => {
    if (data.isCurrent) {
      await runQuery(
        'UPDATE labour_rate_cards SET is_current = false WHERE company_id = $1',
        [companyId]
      );
    }
    return runQuery(
      `INSERT INTO labour_rate_cards
         (company_id, effective_from, review_due, day_rate, hourly_rate, notes, is_current)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        companyId,
        data.effectiveFrom,
        data.reviewDue || null,
        data.dayRate || 0,
        data.hourlyRate || 0,
        data.notes || null,
        data.isCurrent ? true : false,
      ]
    );
  },

  // Update rates/dates. If marking as current, demote others first.
  update: async (id, companyId, data) => {
    if (data.isCurrent) {
      await runQuery(
        'UPDATE labour_rate_cards SET is_current = false WHERE company_id = $1 AND id != $2',
        [companyId, id]
      );
    }
    return runQuery(
      `UPDATE labour_rate_cards SET
         effective_from = $1, review_due = $2, day_rate = $3,
         hourly_rate = $4, notes = $5, is_current = $6, updated_at = NOW()
       WHERE id = $7 AND company_id = $8`,
      [
        data.effectiveFrom,
        data.reviewDue || null,
        data.dayRate || 0,
        data.hourlyRate || 0,
        data.notes || null,
        data.isCurrent ? true : false,
        id, companyId,
      ]
    );
  },

  // Rate card items — managed alongside the card
  addItem: (rateCardId, data) =>
    runQuery(
      `INSERT INTO labour_rate_items
         (rate_card_id, description, unit, rate, display_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [rateCardId, data.description, data.unit || 'unit', data.rate || 0, data.displayOrder ?? 0]
    ),

  updateItem: (id, data) =>
    runQuery(
      `UPDATE labour_rate_items SET
         description = $1, unit = $2, rate = $3, display_order = $4
       WHERE id = $5`,
      [data.description, data.unit || 'unit', data.rate || 0, data.displayOrder ?? 0, id]
    ),

  deleteItem: (id) =>
    runQuery('DELETE FROM labour_rate_items WHERE id = $1', [id]),
};

// ---------------------------------------------------------------------------
// MATERIALS LIBRARY
// Company-scoped reusable item templates. Built organically over time.
// No global scope — prices change too frequently to seed.
// ---------------------------------------------------------------------------
const materialsLibrary = {
  getForCompany: (companyId) =>
    allQuery(
      `SELECT * FROM materials_library
       WHERE company_id = $1
       ORDER BY category_key, display_order, description`,
      [companyId]
    ),

  getByCategory: (companyId, categoryKey) =>
    allQuery(
      `SELECT * FROM materials_library
       WHERE company_id = $1 AND category_key = $2
       ORDER BY display_order, description`,
      [companyId, categoryKey]
    ),

  create: (companyId, data) =>
    runQuery(
      `INSERT INTO materials_library
         (company_id, category_key, description, pricing_mode,
          unit_label, default_unit_cost, notes, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        companyId,
        data.categoryKey,
        data.description,
        data.pricingMode || 'unit',
        data.unitLabel || null,
        data.defaultUnitCost || 0,
        data.notes || null,
        data.displayOrder ?? 0,
      ]
    ),

  update: (id, companyId, data) =>
    runQuery(
      `UPDATE materials_library SET
         category_key = $1, description = $2, pricing_mode = $3,
         unit_label = $4, default_unit_cost = $5, notes = $6,
         display_order = $7, updated_at = NOW()
       WHERE id = $8 AND company_id = $9`,
      [
        data.categoryKey,
        data.description,
        data.pricingMode || 'unit',
        data.unitLabel || null,
        data.defaultUnitCost || 0,
        data.notes || null,
        data.displayOrder ?? 0,
        id, companyId,
      ]
    ),

  delete: (id, companyId) =>
    runQuery(
      'DELETE FROM materials_library WHERE id = $1 AND company_id = $2',
      [id, companyId]
    ),
};

// ---------------------------------------------------------------------------
// MATERIALS LIST ITEMS
// Job-level child line items. Prices copied at time of addition — not live
// references — so historical job costs are always recoverable.
// total_cost is stored and recalculated on every save.
// ---------------------------------------------------------------------------
const materialsListItems = {
  getForProject: (projectId) =>
    allQuery(
      `SELECT mli.*, ml.description AS library_description
       FROM materials_list_items mli
       LEFT JOIN materials_library ml ON ml.id = mli.library_item_id
       WHERE mli.project_id = $1
       ORDER BY mli.parent_category, mli.display_order, mli.id`,
      [projectId]
    ),

  create: (projectId, data) => {
    const totalCost = data.pricingMode === 'flat'
      ? (data.unitCost || 0)
      : (data.quantity || 0) * (data.unitCost || 0);
    return runQuery(
      `INSERT INTO materials_list_items
         (project_id, parent_category, description, pricing_mode,
          unit_label, quantity, unit_cost, total_cost,
          source, source_id, library_item_id, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        projectId,
        data.parentCategory,
        data.description,
        data.pricingMode || 'unit',
        data.unitLabel || null,
        data.quantity || 1,
        data.unitCost || 0,
        totalCost,
        data.source || 'manual',
        data.sourceId || null,
        data.libraryItemId || null,
        data.displayOrder ?? 0,
      ]
    );
  },

  update: (id, projectId, data) => {
    const totalCost = data.pricingMode === 'flat'
      ? (data.unitCost || 0)
      : (data.quantity || 0) * (data.unitCost || 0);
    return runQuery(
      `UPDATE materials_list_items SET
         parent_category = $1, description = $2, pricing_mode = $3,
         unit_label = $4, quantity = $5, unit_cost = $6, total_cost = $7,
         display_order = $8, updated_at = NOW()
       WHERE id = $9 AND project_id = $10`,
      [
        data.parentCategory,
        data.description,
        data.pricingMode || 'unit',
        data.unitLabel || null,
        data.quantity || 1,
        data.unitCost || 0,
        totalCost,
        data.displayOrder ?? 0,
        id, projectId,
      ]
    );
  },

  delete: (id, projectId) =>
    runQuery(
      'DELETE FROM materials_list_items WHERE id = $1 AND project_id = $2',
      [id, projectId]
    ),

  // Import new radiators from the radiator schedule.
  // Returns inserted item IDs. Skips schedule rows that already have a
  // materials_list_item with source='radiator_schedule' and the same source_id
  // so re-running import is idempotent.
  importFromRadiatorSchedule: async (projectId, parentCategory) => {
    // Fetch all 'new' schedule items for this project with spec details
    const scheduleItems = await allQuery(
      `SELECT rs.id, rs.quantity, rs.notes,
              rs2.manufacturer, rs2.model, rs2.type, rs2.height, rs2.length
       FROM radiator_schedule rs
       JOIN rooms r   ON r.id  = rs.room_id
       JOIN radiator_specs rs2 ON rs2.id = rs.radiator_spec_id
       WHERE r.project_id = $1
         AND rs.emitter_status = 'new'`,
      [projectId]
    );

    // Find which schedule IDs are already imported
    const existing = await allQuery(
      `SELECT source_id FROM materials_list_items
       WHERE project_id = $1 AND source = 'radiator_schedule'`,
      [projectId]
    );
    const existingIds = new Set(existing.map(r => r.source_id));

    const inserted = [];
    for (const item of scheduleItems) {
      if (existingIds.has(item.id)) continue;
      const description = `${item.manufacturer} ${item.model} ${item.type} ${item.height}×${item.length}`;
      const result = await runQuery(
        `INSERT INTO materials_list_items
           (project_id, parent_category, description, pricing_mode,
            unit_label, quantity, unit_cost, total_cost, source, source_id, display_order)
         VALUES ($1, $2, $3, 'unit', 'each', $4, 0, 0, 'radiator_schedule', $5, 99)
         RETURNING id`,
        [projectId, parentCategory || 'radiators', description, item.quantity, item.id]
      );
      inserted.push(result.id);
    }
    return inserted;
  },

  // Import pipe sections as materials list items.
  // Each section becomes one item: description = section name + material + size,
  // pricing_mode = 'per_metre', quantity = length_m.
  // Fittings (if detailed method) are imported as separate 'unit' items.
  // Idempotent: skips sections already imported.
  importFromPipeSections: async (projectId, parentCategory) => {
    const sections = await allQuery(
      `SELECT ps.id, ps.name, ps.length_m, ps.nominal_size,
              ps.fittings_method,
              pm.name AS material_name,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', psf.id, 'name', f.name,
                    'quantity', psf.quantity, 'unit_cost', f.unit_cost
                  ) ORDER BY psf.id
                ) FILTER (WHERE psf.id IS NOT NULL),
                '[]'
              ) AS fittings
       FROM pipe_sections ps
       LEFT JOIN pipe_materials pm ON pm.id = ps.pipe_material_id
       LEFT JOIN pipe_section_fittings psf ON psf.pipe_section_id = ps.id
       LEFT JOIN fittings f ON f.id = psf.fitting_id
       WHERE ps.project_id = $1
       GROUP BY ps.id, pm.name`,
      [projectId]
    );

    const existing = await allQuery(
      `SELECT source_id FROM materials_list_items
       WHERE project_id = $1 AND source = 'pipe_sections'`,
      [projectId]
    );
    const existingIds = new Set(existing.map(r => r.source_id));

    const inserted = [];
    for (const sec of sections) {
      if (existingIds.has(sec.id)) continue;
      const desc = [sec.name, sec.material_name, sec.nominal_size]
        .filter(Boolean).join(' — ');

      // Pipe run as per_metre item
      await runQuery(
        `INSERT INTO materials_list_items
           (project_id, parent_category, description, pricing_mode,
            unit_label, quantity, unit_cost, total_cost, source, source_id, display_order)
         VALUES ($1, $2, $3, 'per_metre', 'm', $4, 0, 0, 'pipe_sections', $5, 99)
         RETURNING id`,
        [projectId, parentCategory || 'pipework', desc, sec.length_m, sec.id]
      );

      // If detailed fittings, import each fitting type as a unit item.
      // Use the fitting's unit_cost from the library as the starting price.
      if (sec.fittings_method === 'detailed' && Array.isArray(sec.fittings)) {
        for (const f of sec.fittings) {
          if (!f.quantity) continue;
          const total = f.quantity * (f.unit_cost || 0);
          await runQuery(
            `INSERT INTO materials_list_items
               (project_id, parent_category, description, pricing_mode,
                unit_label, quantity, unit_cost, total_cost, source, source_id, display_order)
             VALUES ($1, $2, $3, 'unit', 'each', $4, $5, $6, 'pipe_sections', $7, 99)
             RETURNING id`,
            [projectId, parentCategory || 'pipework', f.name,
             f.quantity, f.unit_cost || 0, total, sec.id]
          );
        }
      }

      inserted.push(sec.id);
    }
    return inserted;
  },
};

// ---------------------------------------------------------------------------
// QUOTE SNAPSHOTS
// Immutable records — never updated after creation.
// snapshot_data captures the full quote state at a point in time.
// ---------------------------------------------------------------------------
const quoteSnapshots = {
  getForQuote: (quoteId) =>
    allQuery(
      `SELECT id, quote_id, version_label, note, triggered_by, created_by, created_at
       FROM quote_snapshots
       WHERE quote_id = $1
       ORDER BY created_at DESC`,
      [quoteId]
    ),

  // Returns the full snapshot including data — for viewing a historical version.
  getById: (id) =>
    getQuery('SELECT * FROM quote_snapshots WHERE id = $1', [id]),

  create: (data) =>
    runQuery(
      `INSERT INTO quote_snapshots
         (quote_id, version_label, note, triggered_by, snapshot_data, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        data.quoteId,
        data.versionLabel,
        data.note || null,
        data.triggeredBy || 'manual',
        JSON.stringify(data.snapshotData),
        data.createdBy || null,
      ]
    ),
};

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
  roomSegments,
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
  passwordResetTokens,
  pipeMaterialsLib,
  fittingsLib,
  pipeSections,
  labourRateCards,
  materialsLibrary,
  materialsListItems,
  quoteSnapshots,
  // waitForDb is gone — no longer needed with Postgres connection pool.
  // server.js startup sequence is now a simple async IIFE (see migrate.js notes).
};
