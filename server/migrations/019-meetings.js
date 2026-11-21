export const id = '019-meetings';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      contact_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'recording' CHECK(status IN ('recording','ended','summarized')),
      notes TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS meetings_project ON meetings(project_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS meetings_contact ON meetings(contact_id);

    CREATE TABLE IF NOT EXISTS meeting_segments (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      speaker TEXT NOT NULL DEFAULT 'Me',
      text TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS meeting_segments_meeting ON meeting_segments(meeting_id, ts);
  `);
}
