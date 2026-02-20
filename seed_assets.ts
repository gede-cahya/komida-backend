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
    console.log("Seeding decorations and badges...");
    try {
        // --- Decorations ---
        const decorations = [
            {
                name: "Gold Frame",
                description: "A premium gold frame for your avatar",
                image_url: "https://i.ibb.co/vz0XgqY/gold-frame.png", // Placeholder
                type: "regular"
            },
            {
                name: "Base NFT Holder",
                description: "Unlocked by holding a Base NFT",
                image_url: "https://i.ibb.co/0Xn59mB/base-decoration.png", // Placeholder
                type: "nft",
                nft_contract_address: "0x0000000000000000000000000000000000000000" // Placeholder
            },
            {
                name: "Fire Frame",
                description: "Seasonal fire decoration",
                image_url: "https://i.ibb.co/9V3B7X8/fire-frame.png", // Placeholder
                type: "seasonal"
            }
        ];

        for (const dec of decorations) {
            await sql`
                INSERT INTO decorations (name, description, image_url, type, nft_contract_address)
                VALUES (${dec.name}, ${dec.description}, ${dec.image_url}, ${dec.type}, ${dec.nft_contract_address || null})
                ON CONFLICT DO NOTHING;
            `;
        }
        console.log("Decorations seeded.");

        // --- Badges ---
        const badges = [
            {
                name: "Founder",
                description: "One of the first users of Komida",
                icon_url: "https://i.ibb.co/0Vp8p1F/founder-badge.png", // Placeholder
                type: "achievement"
            },
            {
                name: "Early Adopter",
                description: "Joined during the beta phase",
                icon_url: "https://i.ibb.co/4T1zV7v/early-adopter-badge.png", // Placeholder
                type: "regular"
            },
            {
                name: "Web3 Pioneer",
                description: "Connected a wallet to Komida",
                icon_url: "https://i.ibb.co/mS6C2X8/web3-badge.png", // Placeholder
                type: "nft",
                nft_contract_address: "0x0000000000000000000000000000000000000000"
            }
        ];

        for (const badge of badges) {
            await sql`
                INSERT INTO badges (name, description, icon_url, type, nft_contract_address)
                VALUES (${badge.name}, ${badge.description}, ${badge.icon_url}, ${badge.type}, ${badge.nft_contract_address || null})
                ON CONFLICT DO NOTHING;
            `;
        }
        console.log("Badges seeded.");

        console.log("Seeding complete.");
    } catch (e: any) {
        console.error("Seeding failed", e);
    }
    process.exit(0);
}

main();
