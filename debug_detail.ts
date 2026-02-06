
import { KiryuuScraper } from './src/scrapers/providers/kiryuu';

async function testDetail() {
    const scraper = new KiryuuScraper();
    // Use the known correct manga URL
    const url = 'https://kiryuu03.com/manga/virus-girlfriend/';
    console.log(`Testing scrapeDetail with URL: ${url}`);

    try {
        const result = await scraper.scrapeDetail(url);
        if (result && result.chapters.length > 0) {
            const ch380 = result.chapters.find(c => c.title.includes('380'));
            console.log('Chapter 380 found:', ch380);
        } else {
            console.log('No chapters found or result null');
        }
    } catch (e) {
        console.error('Error scraping detail:', e);
    }
}

testDetail();
