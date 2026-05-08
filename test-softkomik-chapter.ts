import { SoftkomikScraper } from './src/scrapers/providers/softkomik';

async function test() {
    const scraper = new SoftkomikScraper();
    // Use an example link
    const link = "https://softkomik.co/sousei-no-taiga/chapter/112";
    console.log("Scraping:", link);
    const data = await scraper.scrapeChapter(link);
    console.log("Result:", JSON.stringify(data, null, 2));
}

export default test;
test();
