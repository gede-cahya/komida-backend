
import { KiryuuScraper } from './src/scrapers/providers/kiryuu';

const scraper = new KiryuuScraper();
console.log("Scraping Action genre...");
scraper.scrapeByGenre('action', 1).then(manga => {
    console.log("Result count:", manga.length);
    if (manga.length > 0) {
        console.log("First item:", manga[0]);
    } else {
        console.log("No items found.");
    }
}).catch(err => {
    console.error("Error:", err);
});
