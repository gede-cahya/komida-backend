import { mangaService } from './service/mangaService';
import { db } from './db';

async function verify() {
    console.log('Testing MangaService...');
    try {
        // 1. Initialize DB to ensure columns exist
        const { initDB } = await import('./db');
        initDB();

        // 2. Run scraping
        console.log('Scraping data (this may take a few seconds)...');
        await mangaService.updatePopularCache();

        // 3. Fetch results
        const results = mangaService.getPopularManga();
        console.log(`Successfully retrieved ${results.length} popular manga.`);

        if (results.length > 0) {
            const scraped = results.filter(r => r.source);
            const shinigamiItems = scraped.filter(p => p.source === 'Shinigami');
            console.log(`Found ${scraped.length} items from scrapers.`);
            console.log(`Shinigami Count: ${shinigamiItems.length}`);
            if (shinigamiItems.length > 0) {
                console.log('Sample Shinigami Item:', shinigamiItems[0]);
            }

            if (scraped.length > 0) {
                console.log('Sample Scraped Data:', scraped.find(p => p.source === 'Kiryuu') || scraped[0]);
            } else {
                console.log('Sample Data (Seed):', results[0]);
            }
        } else {
            console.error('No data found! Check scrapers.');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verify();
