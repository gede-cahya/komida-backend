
import { KiryuuScraper } from './src/scrapers/providers/kiryuu';

async function testPopular() {
    const scraper = new KiryuuScraper();
    console.log(`Testing scrapePopular...`);

    try {
        const result = await scraper.scrapePopular();
        // Check if Virus Girlfriend is in the list
        const vg = result.find(m => m.title.includes('Virus') || m.title.includes('Girlfriend'));
        if (vg) {
            console.log('Found Virus Girlfriend:', vg);
        } else {
            console.log('Virus Girlfriend not found in popular list. Showing first 3 items:', result.slice(0, 3));
        }
    } catch (e) {
        console.error('Error scraping popular:', e);
    }
}

testPopular();
