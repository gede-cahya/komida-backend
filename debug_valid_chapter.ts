
import { KiryuuScraper } from './src/scrapers/providers/kiryuu';

async function testChapterComplete() {
    const scraper = new KiryuuScraper();
    // Use a known correct chapter URL (with ID)
    const url = 'https://kiryuu03.com/manga/virus-girlfriend/chapter-385.726017/';
    console.log(`Testing scrapeChapter with CORRECT URL: ${url}`);

    try {
        const result = await scraper.scrapeChapter(url);
        console.log('Result images count:', result?.images.length);
        console.log('Next:', result?.next);
        console.log('Prev:', result?.prev);
    } catch (e) {
        console.error('Error scraping chapter:', e);
    }
}

testChapterComplete();
