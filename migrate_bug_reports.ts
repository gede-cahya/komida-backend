
import { db } from './src/db';
import { sql } from 'drizzle-orm';

console.log('Migrating bug_reports table...');

try {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS bug_reports (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            steps TEXT,
            page_url TEXT,
            email TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    console.log('Created bug_reports table.');
} catch (e: any) {
    if (e.message.includes('already exists')) {
        console.log('Table already exists.');
    } else {
        console.error('Error creating table:', e.message);
    }
}

try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status)`);
    console.log('Created index idx_bug_reports_status.');
} catch (e: any) {
    console.log('Error creating status index:', e.message);
}

try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at)`);
    console.log('Created index idx_bug_reports_created.');
} catch (e: any) {
    console.log('Error creating created_at index:', e.message);
}

console.log('Migration complete.');
