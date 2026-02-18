
import { mangaService } from '../src/service/mangaService';
import { db } from '../src/db';
import { manga } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function forceUpdate() {
    const targets = [
        { title: 'The Nebula’s Civilization', slug: 'the-nebulas-civilization', source: 'ManhwaIndo', link: 'https://www.manhwaindo.my/series/the-nebulas-civilization/' },
        { title: 'Marriagetoxin', slug: 'marriagetoxin', source: 'Softkomik', link: 'https://softkomik.com/marriagetoxin' },
    ];

    console.log('Force updating metadata for targets...');

    for (const target of targets) {
        console.log(`\nProcessing ${target.title}...`);

        // 1. Try to find in DB to get the Link if we don't have it (optional, but I hardcoded links above for safety)
        // If hardcoded link is wrong, search might fail.

        let link = target.link;

        // 2. Scrape Detail directly with new logic
        console.log(`Scraping detail from ${link}...`);
        try {
            const detail = await mangaService.getMangaDetail(target.source, link);
            if (detail) {
                console.log(`Scraped successfully. Image: ${detail.image}`);

                // 3. Update DB
                // Find by title or source+link?
                // Use importManga logic which finds by title+source
                await mangaService.importManga(target.source, link);
                console.log(`Database updated for ${target.title}`);

                // Verify DB
                const dbRow = await db.select().from(manga).where(eq(manga.title, detail.title));
                if (dbRow.length) {
                    console.log(`DB Row Image: ${dbRow[0].image}`);
                }

            } else {
                console.error(`Failed to scrape detail for ${target.title}`);
            }
        } catch (e) {
            console.error(`Error updating ${target.title}:`, e);
        }
    }

    console.log('Update complete.');
    process.exit(0);
}

forceUpdate();
