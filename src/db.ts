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
// Initialize database schema (legacy way + ensure tables exist)
export async function initDB() {
  if (DATABASE_URL) {
    console.log('Using Supabase PostgreSQL. Running auto-migration for missing columns...');

    // Auto-migration for new user columns
    try {
      const queryClient = postgres(DATABASE_URL);

      // Add email column
      try {
        await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`;
        console.log('Migrated: users.email');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // Add display_name column
      try {
        await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT`;
        console.log('Migrated: users.display_name');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // Add avatar_url column
      try {
        await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`;
        console.log('Migrated: users.avatar_url');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // Add is_banned column
      try {
        await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE`;
        console.log('Migrated: users.is_banned');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // Add xp and tier columns
      try {
        await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0`;
        await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1`;
        console.log('Migrated: users xp and tier');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // Also ensure manga table has new columns if any
      try {
        await queryClient`ALTER TABLE manga ADD COLUMN IF NOT EXISTS popularity INTEGER DEFAULT 0`;
        console.log('Migrated: manga columns');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // Add comments columns
      try {
        await queryClient`ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_spoiler BOOLEAN DEFAULT FALSE`;
        await queryClient`ALTER TABLE comments ADD COLUMN IF NOT EXISTS media_url TEXT`;
        console.log('Migrated: comments columns');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // Add chapter_cache table
      try {
        await queryClient`
            CREATE TABLE IF NOT EXISTS chapter_cache (
                id SERIAL PRIMARY KEY,
                source TEXT NOT NULL,
                link TEXT NOT NULL,
                images TEXT NOT NULL,
                next_slug TEXT,
                prev_slug TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await queryClient`CREATE INDEX IF NOT EXISTS idx_chapter_cache_lookup ON chapter_cache(source, link)`;
        console.log('Migrated: chapter_cache table');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // Add daily_user_activity table
      try {
        await queryClient`
            CREATE TABLE IF NOT EXISTS daily_user_activity (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                date TEXT NOT NULL,
                xp_gained INTEGER DEFAULT 0,
                actions_count INTEGER DEFAULT 0,
                UNIQUE(user_id, date)
            )
        `;
        await queryClient`CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON daily_user_activity(date)`;
        console.log('Migrated: daily_user_activity table');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // Add announcements table
      try {
        await queryClient`
            CREATE TABLE IF NOT EXISTS announcements (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                type TEXT DEFAULT 'info',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                admin_id INTEGER REFERENCES users(id),
                image_url TEXT
            )
        `;
        await queryClient`CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active)`;
        await queryClient`CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at)`;
        console.log('Migrated: announcements table');
      } catch (e: any) { console.log('Migration info:', e.message); }

      // --- NEW: Decorations & Badges Tables ---
      try {
        await queryClient`
            CREATE TABLE IF NOT EXISTS decorations (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                image_url TEXT NOT NULL,
                type TEXT DEFAULT 'regular',
                nft_contract_address TEXT,
                nft_token_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await queryClient`
            CREATE TABLE IF NOT EXISTS badges (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon_url TEXT NOT NULL,
                type TEXT DEFAULT 'regular',
                nft_contract_address TEXT,
                nft_token_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await queryClient`
            CREATE TABLE IF NOT EXISTS user_decorations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                decoration_id INTEGER NOT NULL REFERENCES decorations(id),
                is_equipped BOOLEAN DEFAULT FALSE,
                acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await queryClient`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_decorations_unique ON user_decorations(user_id, decoration_id)`;

        await queryClient`
            CREATE TABLE IF NOT EXISTS user_badges (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                badge_id INTEGER NOT NULL REFERENCES badges(id),
                is_equipped BOOLEAN DEFAULT TRUE,
                acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await queryClient`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_unique ON user_badges(user_id, badge_id)`;

        console.log('Migrated: Decorations and Badges tables');
      } catch (e: any) { console.log('Migration error (Deco/Badge):', e.message); }

      await queryClient.end();
    } catch (err: any) {
      console.error('Migration failed:', err);
    }
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

  legacyDb.run(`
    CREATE TABLE IF NOT EXISTS decorations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      type TEXT DEFAULT 'regular',
      nft_contract_address TEXT,
      nft_token_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  legacyDb.run(`
    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      icon_url TEXT NOT NULL,
      type TEXT DEFAULT 'regular',
      nft_contract_address TEXT,
      nft_token_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  legacyDb.run(`
    CREATE TABLE IF NOT EXISTS user_decorations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      decoration_id INTEGER NOT NULL,
      is_equipped BOOLEAN DEFAULT 0,
      acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, decoration_id)
    )
  `);

  legacyDb.run(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      badge_id INTEGER NOT NULL,
      is_equipped BOOLEAN DEFAULT 1,
      acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, badge_id)
    )
  `);

  // Indices
  legacyDb.run(`CREATE INDEX IF NOT EXISTS idx_manga_views_slug ON manga_views(manga_slug)`);
  legacyDb.run(`CREATE INDEX IF NOT EXISTS idx_manga_views_date ON manga_views(viewed_at)`);
  legacyDb.run(`CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(visited_at)`);

  console.log('SQLite Database initialized.');
}
