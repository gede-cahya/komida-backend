
import { db, legacyDb, sqlite } from './src/db';
import { sql } from 'drizzle-orm';

async function migrate() {
    console.log('Starting migration...');

    const columns = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;'
    ];

    try {
        if (process.env.DATABASE_URL) {
            console.log('Migrating PostgreSQL (Supabase)...');
            // For Postgres via Drizzle
            for (const query of columns) {
                try {
                    await db.execute(sql.raw(query));
                    console.log(`Executed: ${query}`);
                } catch (e: any) {
                    console.error(`Error executing ${query}:`, e.message);
                }
            }
        } else {
            console.log('Migrating SQLite...');
            // For SQLite
            for (const query of columns) {
                try {
                    legacyDb.run(query);
                    console.log(`Executed: ${query}`);
                } catch (e: any) {
                    console.error(`Error executing ${query}:`, e.message);
                }
            }
        }
        console.log('Migration complete!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        process.exit(0);
    }
}

migrate();
