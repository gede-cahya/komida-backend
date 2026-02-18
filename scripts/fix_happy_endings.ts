
import { mangaService } from '../src/service/mangaService';
import { db } from '../src/db';
import { manga } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';

async function fixHappyEndings() {
    console.log('Fixing There Must Be Happy Endings...');
    const title = 'There Must Be Happy Endings';

    // 1. Search ManhwaIndo
    // The search logic in backend might be title-based search.
    // Or I can force import if I know the link.
    // Search on ManhwaIndo site manually or guess link?
    // Title is "There Must Be Happy Endings". Slug likely "there-must-be-happy-endings".
    // Link: https://www.manhwaindo.my/series/there-must-be-happy-endings/

    const targetLink = 'https://www.manhwaindo.my/series/there-must-be-happy-endings/';

    console.log(`Importing from ManhwaIndo: ${targetLink}`);
    try {
        await mangaService.importManga('ManhwaIndo', targetLink);

        // 2. Set ManhwaIndo as trending
        // Title might be "There Must Be Happy Endings" or similar.
        // Let's find it.
        const manhwaIndoEntry = await db.select().from(manga)
            .where(and(eq(manga.source, 'ManhwaIndo'), eq(manga.link, targetLink)))
            .limit(1);

        if (manhwaIndoEntry.length > 0) {
            console.log(`Found imported entry. ID: ${manhwaIndoEntry[0].id}`);
            await db.update(manga)
                .set({ is_trending: true })
                .where(eq(manga.id, manhwaIndoEntry[0].id));
            console.log('Set ManhwaIndo version as trending.');

            // 3. Unset Softkomik
            await db.update(manga)
                .set({ is_trending: false })
                .where(and(eq(manga.title, title), eq(manga.source, 'Softkomik')));
            console.log('Unset Softkomik version.');
        } else {
            console.error('Failed to find imported entry.');
        }

    } catch (e: any) {
        console.error(`Error: ${e.message}`);
    }

    console.log('Done.');
    process.exit(0);
}

fixHappyEndings();
