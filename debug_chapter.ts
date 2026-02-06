
import { KiryuuScraper } from './src/scrapers/providers/kiryuu';

async function test() {
    const scraper = new KiryuuScraper();
    const link = 'https://kiryuu03.com/manhwa/virus-girlfriend/chapter-380'; // Decoding the user link roughly or just using a known working one for this manga
    // The user link was: AxsZGRdbAllaAh0UHBFRHlhSBAJCBAUPShceHQYfHBdMSh9DBwkfAAEPSVlSAw4dHQETAEUJW0FaW1FWFUce
    // In secure.ts, we use simple XOR. If that's encrypted, I can't easily decrypt it here without the key.
    // ALWAYS assume the 'link' param passed to frontend IS the direct link or encrypted.
    // But the scraper expects a full URL or relative path?
    // Let's try to just scrape a known chapter of 'Virus Girlfriend' from Kiryuu to see if the selectors changed.

    // I will try to scrape the exact URL if I can find it, or search for it.
    // Kiryuu URL structure: https://kiryuu03.com/{slug}/{chapter}
    // slug: virus-girlfriend
    // chapter: chapter-380

    const url = 'https://kiryuu03.com/virus-girlfriend/chapter-380/';
    console.log(`Testing scrapeChapter with URL: ${url}`);

    try {
        const result = await scraper.scrapeChapter(url);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('Error scraping:', e);
    }
}

test();
