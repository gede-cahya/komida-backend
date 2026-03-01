import { db, sqlite } from '../src/db';
import * as schema from '../src/db/schema';
import { sql } from 'drizzle-orm';

/**
 * Migration Script: SQLite -> Supabase (PostgreSQL)
 * Run this with DATABASE_URL set to your Supabase connection string.
 * Example: DATABASE_URL=<YOUR_DATABASE_URL> bun scripts/migrate-to-supabase.ts
 */

async function migrate() {
    console.log('--- Starting Migration: SQLite to Supabase ---');

    if (!process.env.DATABASE_URL) {
        console.error('ERROR: DATABASE_URL environment variable is not set.');
        console.error('This script requires a Supabase/PostgreSQL connection to migrate data.');
        process.exit(1);
    }

    try {
        // 1. Migrate Users
        console.log('\n[1/5] Migrating Users...');
        const sqliteUsers = sqlite.query('SELECT * FROM users').all() as any[];
        console.log(`Found ${sqliteUsers.length} users in SQLite.`);

        for (const user of sqliteUsers) {
            await db.insert(schema.users).values({
                id: user.id,
                username: user.username,
                password: user.password,
                role: user.role,
                created_at: user.created_at ? new Date(user.created_at) : new Date(),
            }).onConflictDoNothing();
        }
        console.log('Users migration finished.');

        // 2. Migrate Manga
        console.log('\n[2/5] Migrating Manga...');
        const sqliteManga = sqlite.query('SELECT * FROM manga').all() as any[];
        console.log(`Found ${sqliteManga.length} manga in SQLite.`);

        for (const m of sqliteManga) {
            await db.insert(schema.manga).values({
                id: m.id,
                title: m.title,
                image: m.image,
                rating: m.rating,
                chapter: m.chapter,
                previous_chapter: m.previous_chapter,
                type: m.type,
                span: m.span,
                is_trending: m.is_trending === 1,
                popularity: m.popularity,
                link: m.link,
                source: m.source,
                chapters: m.chapters,
                genres: m.genres,
                synopsis: m.synopsis,
                status: m.status,
                author: m.author,
                last_updated: m.last_updated ? new Date(m.last_updated) : new Date(),
            }).onConflictDoNothing();
        }
        console.log('Manga migration finished.');

        // 3. Migrate Comments
        console.log('\n[3/5] Migrating Comments...');
        const sqliteComments = sqlite.query('SELECT * FROM comments').all() as any[];
        console.log(`Found ${sqliteComments.length} comments in SQLite.`);

        for (const c of sqliteComments) {
            await db.insert(schema.comments).values({
                id: c.id,
                user_id: c.user_id,
                slug: c.slug,
                chapter_slug: c.chapter_slug,
                content: c.content,
                created_at: c.created_at ? new Date(c.created_at) : new Date(),
            }).onConflictDoNothing();
        }
        console.log('Comments migration finished.');

        // 4. Migrate Manga Views
        console.log('\n[4/5] Migrating Manga Views...');
        const sqliteViews = sqlite.query('SELECT * FROM manga_views').all() as any[];
        console.log(`Found ${sqliteViews.length} views in SQLite.`);

        // Split into chunks if there are many views
        const viewChunks = [];
        for (let i = 0; i < sqliteViews.length; i += 100) {
            viewChunks.push(sqliteViews.slice(i, i + 100));
        }

        for (const chunk of viewChunks) {
            await db.insert(schema.mangaViews).values(chunk.map(v => ({
                id: v.id,
                manga_slug: v.manga_slug,
                viewed_at: v.viewed_at ? new Date(v.viewed_at) : new Date(),
            }))).onConflictDoNothing();
        }
        console.log('Manga views migration finished.');

        // 5. Migrate Site Visits
        console.log('\n[5/5] Migrating Site Visits...');
        const sqliteVisits = sqlite.query('SELECT * FROM site_visits').all() as any[];
        console.log(`Found ${sqliteVisits.length} visits in SQLite.`);

        const visitChunks = [];
        for (let i = 0; i < sqliteVisits.length; i += 100) {
            visitChunks.push(sqliteVisits.slice(i, i + 100));
        }

        for (const chunk of visitChunks) {
            await db.insert(schema.siteVisits).values(chunk.map(v => ({
                id: v.id,
                ip_hash: v.ip_hash,
                visited_at: v.visited_at ? new Date(v.visited_at) : new Date(),
                user_agent: v.user_agent,
            }))).onConflictDoNothing();
        }
        console.log('Site visits migration finished.');

        console.log('\n--- Migration Completed Successfully! ---');
        process.exit(0);

    } catch (error) {
        console.error('\n!!! Migration Failed !!!');
        console.error(error);
        process.exit(1);
    }
}

migrate();
