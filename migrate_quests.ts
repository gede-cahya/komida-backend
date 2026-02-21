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
    console.log("Migrating database... adding quests tables");
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS quests (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                quest_type TEXT NOT NULL,
                target_value INTEGER DEFAULT 1,
                target_genre TEXT,
                reward_type TEXT NOT NULL DEFAULT 'badge',
                reward_badge_id INTEGER REFERENCES badges(id),
                reward_decoration_id INTEGER REFERENCES decorations(id),
                is_active BOOLEAN DEFAULT true,
                created_by INTEGER REFERENCES users(id),
                starts_at TIMESTAMP,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_quests_active ON quests(is_active);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_quests_type ON quests(quest_type);`;
        console.log("Table 'quests' created or already exists.");

        await sql`
            CREATE TABLE IF NOT EXISTS user_quests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                quest_id INTEGER NOT NULL REFERENCES quests(id),
                progress INTEGER DEFAULT 0,
                is_completed BOOLEAN DEFAULT false,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, quest_id)
            );
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_user_quests_user ON user_quests(user_id);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_user_quests_quest ON user_quests(quest_id);`;
        console.log("Table 'user_quests' created or already exists.");

        console.log("Migration successful.");
    } catch (e: any) {
        console.error("Migration failed", e);
    }
    process.exit(0);
}

main();
