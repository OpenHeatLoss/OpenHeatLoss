// server/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const dbPath = path.join(__dirname, 'db', 'heatloss.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database schema
function initializeDatabase() {
  db.serialize(() => {
    // Projects table
    db.run(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    designer TEXT,
    external_temp REAL DEFAULT -3,
    annual_avg_temp REAL DEFAULT 9,
    air_density REAL DEFAULT 1.2,
    specific_heat REAL DEFAULT 0.34,
    design_flow_temp REAL DEFAULT 50,
    design_return_temp REAL DEFAULT 40,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

    // Rooms table
    db.run(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        internal_temp REAL DEFAULT 21,
        volume REAL DEFAULT 0,
        floor_area REAL DEFAULT 0,
        room_length REAL DEFAULT 0,
        room_width REAL DEFAULT 0,
        room_height REAL DEFAULT 0,
        min_air_flow REAL DEFAULT 0,
        infiltration_rate REAL DEFAULT 0.5,
        mechanical_supply REAL DEFAULT 0,
        mechanical_extract REAL DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);
    
    db.run(`
  ALTER TABLE rooms ADD COLUMN radiator_schedule_complete BOOLEAN DEFAULT 0
`);


    // Building elements table (walls, windows, roofs, etc.)
    db.run(`
      CREATE TABLE IF NOT EXISTS elements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        element_type TEXT NOT NULL,
        description TEXT,
        length REAL DEFAULT 0,
        height REAL DEFAULT 0,
        area REAL DEFAULT 0,
        u_value REAL DEFAULT 0,
        temp_factor REAL DEFAULT 1.0,
        custom_delta_t REAL DEFAULT NULL,
        subtract_from_element_id INTEGER DEFAULT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (subtract_from_element_id) REFERENCES elements(id) ON DELETE SET NULL
      )
    `);

    // U-value library table
    db.run(`
      CREATE TABLE IF NOT EXISTS u_value_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        element_category TEXT NOT NULL,
        name TEXT NOT NULL,
        u_value REAL NOT NULL,
        notes TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Radiator specifications library table
    db.run(`
      CREATE TABLE IF NOT EXISTS radiator_specs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        manufacturer TEXT NOT NULL,
        model TEXT NOT NULL,
        type TEXT NOT NULL,
        height INTEGER NOT NULL,
        length INTEGER NOT NULL,
        output_dt50 REAL NOT NULL,
        water_volume REAL NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Room emitters table
    db.run(`
      CREATE TABLE IF NOT EXISTS room_emitters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        emitter_type TEXT NOT NULL,
        radiator_spec_id INTEGER,
        connection_type TEXT,
        quantity INTEGER DEFAULT 1,
        notes TEXT,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (radiator_spec_id) REFERENCES radiator_specs(id) ON DELETE SET NULL
      )
    `);
    
    db.run(`
  CREATE TABLE IF NOT EXISTS radiator_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    radiator_spec_id INTEGER NOT NULL,
    connection_type TEXT DEFAULT 'BOE',
    quantity INTEGER DEFAULT 1,
    notes TEXT,
    is_existing BOOLEAN DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (radiator_spec_id) REFERENCES radiator_specs(id) ON DELETE CASCADE
  )
`);

    console.log('Database schema initialized');
  });
}

// Helper function to run queries with promises
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

// Helper function to get data with promises
function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Helper function to get all data with promises
function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Project CRUD operations
const projects = {
  getAll: () => {
    return allQuery('SELECT * FROM projects ORDER BY updated_at DESC');
  },

  getById: (id) => {
    return getQuery('SELECT * FROM projects WHERE id = ?', [id]);
  },

  create: (data) => {
    const sql = `
      INSERT INTO projects (name, location, designer, external_temp, annual_avg_temp, air_density, specific_heat)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    return runQuery(sql, [
      data.name,
      data.location,
      data.designer,
      data.externalTemp,
      data.annualAvgTemp,
      data.airDensity,
      data.specificHeat
    ]);
  },

  update: (id, data) => {
    const sql = `
      UPDATE projects 
      SET name = ?, location = ?, designer = ?, external_temp = ?, 
          annual_avg_temp = ?, air_density = ?, specific_heat = ?,
          design_flow_temp = ?, design_return_temp = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    return runQuery(sql, [
      data.name,
      data.location,
      data.designer,
      data.externalTemp,
      data.annualAvgTemp,
      data.airDensity,
      data.specificHeat,
      data.designFlowTemp || 50,
      data.designReturnTemp || 40,
      id
    ]);
  }


  delete: (id) => {
    return runQuery('DELETE FROM projects WHERE id = ?', [id]);
  }
};

// Room CRUD operations
const rooms = {
  getByProjectId: (projectId) => {
    return allQuery('SELECT * FROM rooms WHERE project_id = ?', [projectId]);
  },

  getById: (id) => {
    return getQuery('SELECT * FROM rooms WHERE id = ?', [id]);
  },

  create: (data) => {
    const sql = `
      INSERT INTO rooms (project_id, name, internal_temp, volume, floor_area, 
                        min_air_flow, infiltration_rate, mechanical_supply, mechanical_extract,
                        room_length, room_width, room_height)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return runQuery(sql, [
      data.projectId,
      data.name,
      data.internalTemp,
      data.volume,
      data.floorArea,
      data.minAirFlow,
      data.infiltrationRate,
      data.mechanicalSupply,
      data.mechanicalExtract,
      data.roomLength || 0,
      data.roomWidth || 0,
      data.roomHeight || 0
    ]);
  },

  update: (id, data) => {
    const sql = `
      UPDATE rooms 
      SET name = ?, internal_temp = ?, volume = ?, floor_area = ?,
          min_air_flow = ?, infiltration_rate = ?, mechanical_supply = ?, mechanical_extract = ?,
          room_length = ?, room_width = ?, room_height = ?
      WHERE id = ?
    `;
    return runQuery(sql, [
      data.name,
      data.internalTemp,
      data.volume,
      data.floorArea,
      data.minAirFlow,
      data.infiltrationRate,
      data.mechanicalSupply,
      data.mechanicalExtract,
      data.roomLength || 0,
      data.roomWidth || 0,
      data.roomHeight || 0,
      id
    ]);
  },

  delete: (id) => {
    return runQuery('DELETE FROM rooms WHERE id = ?', [id]);
  }
};

// Element CRUD operations
const elements = {
  getByRoomId: (roomId) => {
    return allQuery('SELECT * FROM elements WHERE room_id = ?', [roomId]);
  },

  getById: (id) => {
    return getQuery('SELECT * FROM elements WHERE id = ?', [id]);
  },

  create: (data) => {
    const sql = `
      INSERT INTO elements (room_id, element_type, description, length, height, area, u_value, temp_factor, custom_delta_t, subtract_from_element_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return runQuery(sql, [
      data.roomId,
      data.elementType,
      data.description,
      data.length,
      data.height,
      data.area,
      data.uValue,
      data.tempFactor,
      data.customDeltaT || null,
      data.subtractFromElementId || null
    ]);
  },

  update: (id, data) => {
    const sql = `
      UPDATE elements 
      SET element_type = ?, description = ?, length = ?, height = ?, area = ?, u_value = ?, temp_factor = ?, custom_delta_t = ?, subtract_from_element_id = ?
      WHERE id = ?
    `;
    return runQuery(sql, [
      data.elementType,
      data.description,
      data.length,
      data.height,
      data.area,
      data.uValue,
      data.tempFactor,
      data.customDeltaT || null,
      data.subtractFromElementId || null,
      id
    ]);
  },

  delete: (id) => {
    return runQuery('DELETE FROM elements WHERE id = ?', [id]);
  }
};

// U-value library operations
const uValueLibrary = {
  getByProjectId: (projectId) => {
    return allQuery('SELECT * FROM u_value_library WHERE project_id = ? ORDER BY element_category, name', [projectId]);
  },

  create: (data) => {
    const sql = `
      INSERT INTO u_value_library (project_id, element_category, name, u_value, notes)
      VALUES (?, ?, ?, ?, ?)
    `;
    return runQuery(sql, [
      data.projectId,
      data.elementCategory,
      data.name,
      data.uValue,
      data.notes || ''
    ]);
  },

  update: (id, data) => {
    const sql = `
      UPDATE u_value_library 
      SET element_category = ?, name = ?, u_value = ?, notes = ?
      WHERE id = ?
    `;
    return runQuery(sql, [
      data.elementCategory,
      data.name,
      data.uValue,
      data.notes || '',
      id
    ]);
  },

  delete: (id) => {
    return runQuery('DELETE FROM u_value_library WHERE id = ?', [id]);
  }
};

// CRUD operations for radiator_schedule:
const radiatorSchedule = {
  getByRoomId: (roomId) => {
    return allQuery(
      'SELECT * FROM radiator_schedule WHERE room_id = ? ORDER BY display_order, id', 
      [roomId]
    );
  },

  create: (data) => {
    const sql = `
      INSERT INTO radiator_schedule (room_id, radiator_spec_id, connection_type, quantity, notes, is_existing, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    return runQuery(sql, [
      data.roomId,
      data.radiatorSpecId,
      data.connectionType || 'BOE',
      data.quantity || 1,
      data.notes || '',
      data.isExisting ? 1 : 0,
      data.displayOrder || 0
    ]);
  },

  update: (id, data) => {
    const sql = `
      UPDATE radiator_schedule 
      SET radiator_spec_id = ?, connection_type = ?, quantity = ?, notes = ?, is_existing = ?, display_order = ?
      WHERE id = ?
    `;
    return runQuery(sql, [
      data.radiatorSpecId,
      data.connectionType || 'BOE',
      data.quantity || 1,
      data.notes || '',
      data.isExisting ? 1 : 0,
      data.displayOrder || 0,
      id
    ]);
  },

  delete: (id) => {
    return runQuery('DELETE FROM radiator_schedule WHERE id = ?', [id]);
  },

  markRoomComplete: (roomId, isComplete) => {
    return runQuery(
      'UPDATE rooms SET radiator_schedule_complete = ? WHERE id = ?',
      [isComplete ? 1 : 0, roomId]
    );
  }
};

// Get complete project with all rooms and elements
async function getCompleteProject(projectId) {
  const project = await projects.getById(projectId);
  if (!project) return null;

  const projectRooms = await rooms.getByProjectId(projectId);
  
  for (let room of projectRooms) {
    room.elements = await elements.getByRoomId(room.id);
    room.emitters = await roomEmitters.getByRoomId(room.id);
    room.radiatorSchedule = await radiatorSchedule.getByRoomId(room.id);
  }

  project.uValueLibrary = await uValueLibrary.getByProjectId(projectId);
  project.radiatorSpecs = await radiatorSpecs.getAll();

  project.rooms = projectRooms;
  return project;
}
  
  // Get elements and emitters for each room
  for (let room of projectRooms) {
    room.elements = await elements.getByRoomId(room.id);
    room.emitters = await roomEmitters.getByRoomId(room.id);
  }

  // Get U-value library
  project.uValueLibrary = await uValueLibrary.getByProjectId(projectId);
  
  // Get all radiator specs for dropdowns
  project.radiatorSpecs = await radiatorSpecs.getAll();

  project.rooms = projectRooms;
  return project;
}

// Radiator specifications CRUD operations
const radiatorSpecs = {
  getAll: () => {
    return allQuery('SELECT * FROM radiator_specs ORDER BY manufacturer, type, height, length');
  },

  getById: (id) => {
    return getQuery('SELECT * FROM radiator_specs WHERE id = ?', [id]);
  },

  create: (data) => {
    const sql = `
      INSERT INTO radiator_specs (manufacturer, model, type, height, length, output_dt50, water_volume, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return runQuery(sql, [
      data.manufacturer,
      data.model,
      data.type,
      data.height,
      data.length,
      data.outputDt50,
      data.waterVolume,
      data.notes || ''
    ]);
  },

  update: (id, data) => {
    const sql = `
      UPDATE radiator_specs 
      SET manufacturer = ?, model = ?, type = ?, height = ?, length = ?, 
          output_dt50 = ?, water_volume = ?, notes = ?
      WHERE id = ?
    `;
    return runQuery(sql, [
      data.manufacturer,
      data.model,
      data.type,
      data.height,
      data.length,
      data.outputDt50,
      data.waterVolume,
      data.notes || '',
      id
    ]);
  },

  delete: (id) => {
    return runQuery('DELETE FROM radiator_specs WHERE id = ?', [id]);
  }
};

// Room emitter CRUD operations
const roomEmitters = {
  getByRoomId: (roomId) => {
    return allQuery('SELECT * FROM room_emitters WHERE room_id = ?', [roomId]);
  },

  getById: (id) => {
    return getQuery('SELECT * FROM room_emitters WHERE id = ?', [id]);
  },

  create: (data) => {
    const sql = `
      INSERT INTO room_emitters (room_id, emitter_type, radiator_spec_id, connection_type, quantity, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    return runQuery(sql, [
      data.roomId,
      data.emitterType,
      data.radiatorSpecId || null,
      data.connectionType || null,
      data.quantity || 1,
      data.notes || ''
    ]);
  },

  update: (id, data) => {
    const sql = `
      UPDATE room_emitters 
      SET emitter_type = ?, radiator_spec_id = ?, connection_type = ?, quantity = ?, notes = ?
      WHERE id = ?
    `;
    return runQuery(sql, [
      data.emitterType,
      data.radiatorSpecId || null,
      data.connectionType || null,
      data.quantity || 1,
      data.notes || '',
      id
    ]);
  },

  delete: (id) => {
    return runQuery('DELETE FROM room_emitters WHERE id = ?', [id]);
  }
};

module.exports = {
  db,
  projects,
  rooms,
  elements,
  uValueLibrary,
  radiatorSpecs,
  roomEmitters,
  radiatorSchedule,
  getCompleteProject
};