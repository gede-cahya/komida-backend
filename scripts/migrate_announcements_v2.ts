
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        console.log("Migrating announcements table (v2)...");

        // Add admin_id column
        await db.execute(sql`
            ALTER TABLE announcements 
            ADD COLUMN IF NOT EXISTS admin_id integer REFERENCES users(id);
        `);
        console.log("Added admin_id column.");

        // Add image_url column
        await db.execute(sql`
            ALTER TABLE announcements 
            ADD COLUMN IF NOT EXISTS image_url text;
        `);
        console.log("Added image_url column.");

        console.log("Migration v2 completed successfully.");
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

main();
