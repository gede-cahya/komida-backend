
import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function checkTable() {
    try {
        const result = await db.execute(sql`SELECT to_regclass('public.announcements')`);
        console.log("Table check result:", result);
        process.exit(0);
    } catch (e) {
        console.error("Error checking table:", e);
        process.exit(1);
    }
}

checkTable();
