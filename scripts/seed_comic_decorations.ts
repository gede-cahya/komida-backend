import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("DATABASE_URL is missing in .env");
    process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

async function main() {
    console.log("Seeding comic avatar decorations...");
    try {
        const decorations = [
            {
                name: "Pop Art Action",
                description: "Retro pop art style with BAM! effect",
                image_url: "css:pop-art",
                type: "regular"
            },
            {
                name: "Manga Speed Lines",
                description: "Dynamic spinning speed lines",
                image_url: "css:manga-speed",
                type: "regular"
            },
            {
                name: "Cyberpunk Mecha",
                description: "Futuristic neon mecha HUD",
                image_url: "css:cyberpunk",
                type: "regular"
            },
            {
                name: "Webtoon Panels",
                description: "Layered comic book panel borders",
                image_url: "css:webtoon",
                type: "regular"
            },
            {
                name: "Halftone Noir",
                description: "Dramatic black and white halftone effect",
                image_url: "css:halftone",
                type: "regular"
            }
        ];

        for (const dec of decorations) {
            await sql`
                INSERT INTO decorations (name, description, image_url, type)
                VALUES (${dec.name}, ${dec.description}, ${dec.image_url}, ${dec.type})
                ON CONFLICT DO NOTHING;
            `;
            console.log(`Inserted decoration: ${dec.name}`);
        }

        console.log("Comic decorations seeded successfully.");
    } catch (e: any) {
        console.error("Seeding failed", e);
    }
    process.exit(0);
}

main();
