import { Database } from 'bun:sqlite';
import { join } from 'path';

// Locate komida.db relative to this file (src/db.ts) -> parent/komida.db
const dbPath = join(import.meta.dir, '../komida.db');
export const db = new Database(dbPath);

// Initialize database schema
export function initDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS manga (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image TEXT NOT NULL,
      rating REAL,
      chapter TEXT,
      previous_chapter TEXT,
      type TEXT,
      span TEXT,
      is_trending BOOLEAN DEFAULT 0,
      popularity INTEGER DEFAULT 0,
      link TEXT,
      source TEXT,
      chapters TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration for existing tables (ignore errors if columns exist)
  try { db.run("ALTER TABLE manga ADD COLUMN link TEXT"); } catch { }
  try { db.run("ALTER TABLE manga ADD COLUMN source TEXT"); } catch { }
  try { db.run("ALTER TABLE manga ADD COLUMN chapters TEXT"); } catch { }
  try { db.run("ALTER TABLE manga ADD COLUMN genres TEXT"); } catch { }
  try { db.run("ALTER TABLE manga ADD COLUMN synopsis TEXT"); } catch { }
  try { db.run("ALTER TABLE manga ADD COLUMN status TEXT"); } catch { }
  try { db.run("ALTER TABLE manga ADD COLUMN author TEXT"); } catch { }
  // Note: SQLite columns have flexible typing, so existing INTEGER chapters can hold TEXT.

  console.log('Database initialized at:', dbPath);
}
