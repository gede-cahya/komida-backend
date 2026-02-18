
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

console.log('Migrating database: Adding columns to comments table...');

async function migrate() {
    try {
        // Add is_spoiler column
        try {
            await db.execute(sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_spoiler BOOLEAN DEFAULT FALSE`);
            console.log('Added is_spoiler column.');
        } catch (e: any) {
            console.log('Info adding is_spoiler:', e.message);
        }

        // Add media_url column
        try {
            await db.execute(sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS media_url TEXT`);
            console.log('Added media_url column.');
        } catch (e: any) {
            console.log('Info adding media_url:', e.message);
        }

        console.log('Migration completed.');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

migrate();
