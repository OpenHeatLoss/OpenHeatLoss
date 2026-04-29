/**
 * seedStelradClassicCompact.js
 *
 * Seeds the radiator_specs table with Stelrad Classic Compact data.
 * Covers: K1, P+, K2 (original datasheet) and K3 (separate datasheet).
 * Source: Stelrad Classic Compact datasheets, EN442 at ΔT50 (75/65/20°C).
 *
 * Idempotent — skips if Stelrad Classic Compact records already exist.
 * scope = 'global' marks these as global reference data.
 */

const { readFileSync } = require('fs');
const path = require('path');

async function seedStelradClassicCompact(query) {
  const { rowCount } = await query(`
    SELECT 1 FROM radiator_specs
    WHERE manufacturer = 'Stelrad'
      AND model = 'Classic Compact'
      AND scope = 'global'
    LIMIT 1
  `);

  if (rowCount > 0) {
    console.log('  Stelrad Classic Compact already seeded — skipping.');
    return;
  }

  const INSERT_SQL = `
    INSERT INTO radiator_specs
      (manufacturer, model, type, height, length, output_dt50, water_volume,
       source, notes, scope)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'global')
  `;

  const seedFiles = [
    'stelrad_classic_compact.json',
    'stelrad_classic_compact_k3.json',
  ];

  let inserted = 0;
  for (const filename of seedFiles) {
    const seedPath = path.join(__dirname, 'seeds', filename);
    const { radiators } = JSON.parse(readFileSync(seedPath, 'utf8'));
    for (const r of radiators) {
      await query(INSERT_SQL, [
        r.manufacturer, r.model, r.type,
        r.height, r.length, r.output_dt50,
        r.water_volume, r.source, r.notes ?? null,
      ]);
      inserted++;
    }
    console.log(`  Loaded ${radiators.length} records from ${filename}`);
  }

  console.log(`  Seeded ${inserted} Stelrad Classic Compact radiator specs total.`);
}

module.exports = { seedStelradClassicCompact };
