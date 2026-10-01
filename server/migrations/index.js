// Versioned schema migrations. To change the schema, add a new file NNN-short-name.js exporting
// `id` (same as the filename without .js) and `up(db)`, then append it to MIGRATIONS below.
// Never edit a migration that has already shipped — add a new one.
import * as m001 from './001-baseline.js';

export const MIGRATIONS = [m001];

export function runMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map(r => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    db.transaction(() => {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(m.id, Date.now());
    })();
    console.log(`[db] Applied migration ${m.id}`);
  }
}
