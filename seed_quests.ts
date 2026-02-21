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
    console.log("Seeding initial badges and quests...");
    try {
        // Insert badges (if not exist)
        const badges = [
            {
                name: 'Isekai Explorer',
                description: 'Awarded for reading an Isekai genre comic',
                icon_url: '/uploads/badges/isekai_explorer.png',
                type: 'achievement',
            },
            {
                name: 'Horror Reader',
                description: 'Awarded for reading a Horror genre comic',
                icon_url: '/uploads/badges/horror_reader.png',
                type: 'achievement',
            },
            {
                name: 'Bookworm 10',
                description: 'Awarded for reading 10 different comics',
                icon_url: '/uploads/badges/bookworm_10.png',
                type: 'achievement',
            },
        ];

        const badgeIds: number[] = [];

        for (const badge of badges) {
            // Check if already exists
            const existing = await sql`SELECT id FROM badges WHERE name = ${badge.name} LIMIT 1`;
            if (existing.length > 0) {
                console.log(`Badge '${badge.name}' already exists (id: ${existing[0].id})`);
                badgeIds.push(existing[0].id);
            } else {
                const [inserted] = await sql`
                    INSERT INTO badges (name, description, icon_url, type)
                    VALUES (${badge.name}, ${badge.description}, ${badge.icon_url}, ${badge.type})
                    RETURNING id
                `;
                console.log(`Badge '${badge.name}' created (id: ${inserted.id})`);
                badgeIds.push(inserted.id);
            }
        }

        // Insert quests linked to badges
        const quests = [
            {
                title: 'Baca Komik Isekai',
                description: 'Baca minimal 1 komik genre Isekai untuk mendapatkan badge Isekai Explorer!',
                quest_type: 'genre_read',
                target_value: 1,
                target_genre: 'Isekai',
                reward_type: 'badge',
                reward_badge_id: badgeIds[0],
            },
            {
                title: 'Baca Komik Horror',
                description: 'Baca minimal 1 komik genre Horror untuk mendapatkan badge Horror Reader!',
                quest_type: 'genre_read',
                target_value: 1,
                target_genre: 'Horror',
                reward_type: 'badge',
                reward_badge_id: badgeIds[1],
            },
            {
                title: 'Baca 10 Komik',
                description: 'Baca 10 komik berbeda untuk mendapatkan badge Bookworm 10!',
                quest_type: 'comics_read',
                target_value: 10,
                target_genre: null,
                reward_type: 'badge',
                reward_badge_id: badgeIds[2],
            },
        ];

        for (const quest of quests) {
            const existing = await sql`SELECT id FROM quests WHERE title = ${quest.title} LIMIT 1`;
            if (existing.length > 0) {
                console.log(`Quest '${quest.title}' already exists (id: ${existing[0].id})`);
            } else {
                const [inserted] = await sql`
                    INSERT INTO quests (title, description, quest_type, target_value, target_genre, reward_type, reward_badge_id, is_active)
                    VALUES (${quest.title}, ${quest.description}, ${quest.quest_type}, ${quest.target_value}, ${quest.target_genre}, ${quest.reward_type}, ${quest.reward_badge_id}, true)
                    RETURNING id
                `;
                console.log(`Quest '${quest.title}' created (id: ${inserted.id})`);
            }
        }

        console.log("Seeding complete!");
    } catch (e: any) {
        console.error("Seeding failed:", e);
    }
    process.exit(0);
}

main();
