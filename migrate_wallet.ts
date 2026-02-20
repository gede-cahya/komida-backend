import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("DATABASE_URL is missing in .env");
    process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

async function main() {
    console.log("Migrating database... checking for wallet_address column in users table");
    try {
        await sql`ALTER TABLE users ADD COLUMN wallet_address text UNIQUE;`;
        console.log("Migration successful: added wallet_address column.");
    } catch (e: any) {
        if (e.code === '42701') {
            console.log("Migration skipped: wallet_address column already exists.");
        } else {
            console.error("Migration failed", e);
        }
    }
    process.exit(0);
}

main();
