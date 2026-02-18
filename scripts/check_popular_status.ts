
import { db } from '../src/db';
import { manga } from '../src/db/schema';
import { eq, desc } from 'drizzle-orm';

async function checkPopularStatus() {
    console.log('Checking status of all popular/trending manga images...');

    const popular = await db.select().from(manga)
        .where(eq(manga.is_trending, true))
        .orderBy(desc(manga.last_updated));

    console.log(`Found ${popular.length} trending manga.`);

    for (const m of popular) {
        // Filter for the problematic titles to save time, or check all?
        // Let's check the ones user mentioned first + a few others.
        const targets = ['marriagetoxin', 'shibou', 'nebula'];
        const isTarget = targets.some(t => m.title.toLowerCase().includes(t));

        if (isTarget) {
            console.log(`\n[${m.source}] ${m.title}`);
            console.log(`URL: ${m.image}`);

            try {
                const start = performance.now();
                const res = await fetch(m.image, {
                    method: 'HEAD', // Try HEAD first
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                    }
                });
                const duration = Math.round(performance.now() - start);
                console.log(`Status: ${res.status} (${duration}ms)`);
                if (!res.ok) {
                    // Try GET if HEAD fails (some servers block HEAD)
                    const resGet = await fetch(m.image, {
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                        }
                    });
                    console.log(`GET Status: ${resGet.status}`);
                }
            } catch (e: any) {
                console.log(`Error: ${e.message}`);
            }
        }
    }
    process.exit(0);
}

checkPopularStatus();
