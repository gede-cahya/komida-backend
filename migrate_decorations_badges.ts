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

async function main() {
    console.log("Migrating database... adding decorations and badges tables");
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS decorations (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                image_url TEXT NOT NULL,
                type TEXT DEFAULT 'regular',
                nft_contract_address TEXT,
                nft_token_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log("Table 'decorations' created or already exists.");

        await sql`
            CREATE TABLE IF NOT EXISTS badges (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon_url TEXT NOT NULL,
                type TEXT DEFAULT 'regular',
                nft_contract_address TEXT,
                nft_token_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log("Table 'badges' created or already exists.");

        await sql`
            CREATE TABLE IF NOT EXISTS user_decorations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                decoration_id INTEGER NOT NULL REFERENCES decorations(id),
                is_equipped BOOLEAN DEFAULT false,
                acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, decoration_id)
            );
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_user_decorations_user ON user_decorations(user_id);`;
        console.log("Table 'user_decorations' created or already exists.");

        await sql`
            CREATE TABLE IF NOT EXISTS user_badges (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                badge_id INTEGER NOT NULL REFERENCES badges(id),
                is_equipped BOOLEAN DEFAULT true,
                acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, badge_id)
            );
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);`;
        console.log("Table 'user_badges' created or already exists.");

        console.log("Migration successful.");
    } catch (e: any) {
        console.error("Migration failed", e);
    }
    process.exit(0);
}

main();
