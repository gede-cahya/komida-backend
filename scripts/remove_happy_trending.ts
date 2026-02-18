
import { db } from '../src/db';
import { manga } from '../src/db/schema';
import { eq, ilike } from 'drizzle-orm';

async function removeHappyEndingsTrending() {
    console.log('Unsetting trending for "There Must Be Happy Endings" (Softkomik)...');

    // Find ID
    const entries = await db.select().from(manga)
        .where(ilike(manga.title, '%There Must Be Happy Endings%'));

    for (const m of entries) {
        if (m.source === 'Softkomik') {
            console.log(`Unsetting trending for ${m.title} (ID: ${m.id})`);
            await db.update(manga)
                .set({ is_trending: false })
                .where(eq(manga.id, m.id));
        }
    }

    console.log('Done.');
    process.exit(0);
}

removeHappyEndingsTrending();
