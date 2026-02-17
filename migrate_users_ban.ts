
import { db } from './src/db';
import { sql } from 'drizzle-orm';

console.log('Migrating users table to add is_banned column...');

try {
    db.run(sql`ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT FALSE`);
    console.log('Added is_banned column.');
} catch (e: any) {
    if (e.message.includes('duplicate column')) {
        console.log('Column is_banned already exists.');
    } else {
        console.error('Error adding column:', e.message);
    }
}

console.log('Migration complete.');
