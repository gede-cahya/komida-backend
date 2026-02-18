
import { db } from '../src/db';
import { manga } from '../src/db/schema';
import { eq, ilike } from 'drizzle-orm';

async function checkHappyEndings() {
    const title = 'There Must Be Happy Endings';
    console.log(`Checking "${title}"...`);

    // 1. Get all entries for this title
    const entries = await db.select().from(manga).where(ilike(manga.title, `%${title}%`));
    console.log(`Found ${entries.length} entries.`);

    for (const m of entries) {
        console.log(`\n[${m.source}] ID: ${m.id}, Trending: ${m.is_trending}`);
        console.log(`Image: ${m.image}`);

        if (m.image) {
            try {
                const res = await fetch(m.image, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
                console.log(`Status: ${res.status}`);
                if (!res.ok) {
                    const resGet = await fetch(m.image, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } });
                    console.log(`GET Status: ${resGet.status}`);
                }
            } catch (e: any) {
                console.log(`Error: ${e.message}`);
            }
        }
    }
    process.exit(0);
}

checkHappyEndings();
