
import { KiryuuScraper } from './src/scrapers/providers/kiryuu';

async function test() {
    const scraper = new KiryuuScraper();
    const chapterUrl = 'https://kiryuu03.com/manga/virus-girlfriend/chapter-380/';
    // Wait, the API response said: https://kiryuu03.com/manga/virus-girlfriend/chapter-380.725781/
    // I should use the exact link from the API.
    const realUrl = 'https://kiryuu03.com/manga/virus-girlfriend/chapter-380.725781/';

    console.log(`Testing scrapeChapter for: ${realUrl}`);
    const data = await scraper.scrapeChapter(realUrl);

    if (data) {
        console.log('Chapter Title:', data.title);
        console.log('Images Found:', data.images.length);
        if (data.images.length > 0) {
            console.log('First Image:', data.images[0]);
        }
    } else {
        console.log('No data returned.');
    }
}

test();
