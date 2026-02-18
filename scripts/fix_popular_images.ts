
import { mangaService } from '../src/service/mangaService';
import { db } from '../src/db';
import { manga } from '../src/db/schema';
import { eq, like } from 'drizzle-orm';

async function fixAllPopular() {
    console.log('Starting comprehensive popular image fix...');

    // 1. Get all trending/popular manga from DB
    const popularManga = await db.select().from(manga).where(eq(manga.is_trending, true));
    console.log(`Found ${popularManga.length} popular manga to check.`);

    let fixedCount = 0;

    for (const m of popularManga) {
        let needsUpdate = false;

        // 2. Check for known bad patterns
        if (!m.image) needsUpdate = true;
        else if (m.image.startsWith('data:')) needsUpdate = true; // Placeholder SVG
        else if (m.image.includes('//uploads')) needsUpdate = true; // Double slash
        else if (m.image.includes('softkomik.com') && !m.image.includes('image.softkomik.com') && !m.image.includes('cover.softdevices')) {
            // Potentially using main domain for image which might fail or be 404
            // Softkomik images are usually on image.softkomik.com or cover...
            // Let's re-scrape to be safe if it looks suspicious
            // actually softkomik.com/uploads... is often 404 now.
            if (m.source === 'Softkomik') needsUpdate = true;
        }

        if (needsUpdate) {
            console.log(`\n[Fix] Updating ${m.title} (${m.source}) - Invalid Image: ${m.image?.substring(0, 50)}...`);
            try {
                // Scrape Detail
                const detail = await mangaService.getMangaDetail(m.source, m.link);
                if (detail && detail.image && !detail.image.startsWith('data:')) {
                    // Update DB
                    await db.update(manga)
                        .set({
                            image: detail.image,
                            last_updated: new Date()
                        })
                        .where(eq(manga.id, m.id));
                    console.log(`[Fix] Success! New Image: ${detail.image}`);
                    fixedCount++;
                } else {
                    console.log(`[Fix] Failed to get better image for ${m.title}`);
                }
            } catch (e: any) {
                console.error(`[Fix] Error updating ${m.title}: ${e.message}`);
            }
            // Be nice to servers
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    console.log(`\nFinished. Fixed ${fixedCount} manga.`);
    process.exit(0);
}

fixAllPopular();
