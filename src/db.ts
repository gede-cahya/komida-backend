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

  db.run(`
    CREATE TABLE IF NOT EXISTS manga_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_slug TEXT NOT NULL,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS site_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_hash TEXT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_agent TEXT
    )
  `);

  // Indices
  db.run(`CREATE INDEX IF NOT EXISTS idx_manga_views_slug ON manga_views(manga_slug)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_manga_views_date ON manga_views(viewed_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(visited_at)`);


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
