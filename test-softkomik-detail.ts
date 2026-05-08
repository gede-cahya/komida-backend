import { SoftkomikScraper } from './src/scrapers/providers/softkomik';

async function test() {
    const scraper = new SoftkomikScraper();
    const link = "https://softkomik.co/sousei-no-taiga";
    console.log("Scraping detail:", link);
    const data = await scraper.scrapeDetail(link);
    console.log("Chapters found:", data?.chapters.length);
    console.log("First chapter:", JSON.stringify(data?.chapters[0], null, 2));
}

export default test;
test();
