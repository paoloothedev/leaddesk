import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'leaddesk.db');

let db;

export function logAudit(action, entityType, entityId, entityName, details = {}) {
  try {
    const db2 = getDB();
    db2.prepare('INSERT INTO audit_log (action, entity_type, entity_id, entity_name, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(action, entityType, entityId || '', entityName || '', JSON.stringify(details), Date.now());
  } catch {}
}

export function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    seedStages();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '',
      phone_valid INTEGER DEFAULT 0,
      email TEXT DEFAULT '',
      facebook TEXT DEFAULT '',
      instagram TEXT DEFAULT '',
      tiktok TEXT DEFAULT '',
      link TEXT DEFAULT '',
      location TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      verified INTEGER DEFAULT 0,
      stage_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      dead_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_leads (
      lead_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      PRIMARY KEY (lead_id, campaign_id),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stage_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3d5a45',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3d5a45',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lead_tags (
      lead_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (lead_id, tag_id),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS broadcast_jobs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT,
      message TEXT NOT NULL,
      delay_min INTEGER DEFAULT 1,
      delay_max INTEGER DEFAULT 5,
      status TEXT DEFAULT 'pending',
      total INTEGER DEFAULT 0,
      sent INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS job_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      phone TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      error TEXT,
      sent_at INTEGER,
      FOREIGN KEY (job_id) REFERENCES broadcast_jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_logs (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL DEFAULT '',
      rows_total INTEGER NOT NULL DEFAULT 0,
      added INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      updated INTEGER NOT NULL DEFAULT 0,
      details TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT,
      phone TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('in','out')),
      content TEXT NOT NULL,
      status TEXT DEFAULT 'sent',
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT DEFAULT '',
      entity_name TEXT DEFAULT '',
      details TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
  `);
  // Add show_in_dashboard column if not exist
  try {
    db.exec('ALTER TABLE tags ADD COLUMN show_in_dashboard INTEGER NOT NULL DEFAULT 1');
  } catch {}
  // Add wa_msg_id column to chat_messages if not exist
  try {
    db.exec('ALTER TABLE chat_messages ADD COLUMN wa_msg_id TEXT');
  } catch {}
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_wa_msg_id ON chat_messages(wa_msg_id)');
  } catch {}
}

function seedStages() {
  const count = db.prepare('SELECT COUNT(*) as c FROM stages').get();
  if (count.c === 0) {
    const insert = db.prepare('INSERT INTO stages (id, name, color, sort_order) VALUES (?, ?, ?, ?)');
    const defaultStages = [
      ['s1', 'Cold Calling', '#3d5a45', 0],
      ['s2', 'Contacted', '#c79a3f', 1],
      ['s3', 'Interested', '#3a7ca1', 2],
      ['s4', 'Customer', '#3d7a52', 3],
      ['s5', 'Lost', '#a13a3a', 4],
    ];
    for (const s of defaultStages) {
      insert.run(...s);
    }
  }
}
