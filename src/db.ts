import { Database } from 'bun:sqlite';
import { join } from 'path';
import { drizzle as drizzleSqlite } from 'drizzle-orm/bun-sqlite';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './db/schema';

const DATABASE_URL = process.env.DATABASE_URL;

// Legacy SQLite DB for local development/fallback
const dbPath = join(import.meta.dir, '../komida.db');
export const sqlite = new Database(dbPath);

// Drizzle DB instances
export let db: any;

if (DATABASE_URL) {
  console.log('Connecting to PostgreSQL (Supabase)...');
  const queryClient = postgres(DATABASE_URL);
  db = drizzlePg(queryClient, { schema });
} else {
  console.log('Using local SQLite at:', dbPath);
  db = drizzleSqlite(sqlite, { schema });
}

// Export the raw sqlite object as 'legacyDb' for existing code that hasn't migrated yet
export const legacyDb = sqlite;

// Initialize database schema (legacy way + ensure tables exist)
export function initDB() {
  if (DATABASE_URL) {
    console.log('Note: Using Supabase. Schema should be managed via migrations or dashboard.');
    // In a real app, we'd run migrations here.
    return;
  }

  // SQLite initialization (legacy)
  legacyDb.run(`
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
      genres TEXT,
      synopsis TEXT,
      status TEXT,
      author TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  legacyDb.run(`
    CREATE TABLE IF NOT EXISTS manga_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_slug TEXT NOT NULL,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  legacyDb.run(`
    CREATE TABLE IF NOT EXISTS site_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_hash TEXT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_agent TEXT
    )
  `);

  // Indices
  legacyDb.run(`CREATE INDEX IF NOT EXISTS idx_manga_views_slug ON manga_views(manga_slug)`);
  legacyDb.run(`CREATE INDEX IF NOT EXISTS idx_manga_views_date ON manga_views(viewed_at)`);
  legacyDb.run(`CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(visited_at)`);

  console.log('SQLite Database initialized.');
}
