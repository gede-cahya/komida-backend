import { SoftkomikScraper } from './src/scrapers/providers/softkomik';

async function test() {
    const scraper = new SoftkomikScraper();
    console.log("Scraping popular...");
    const popular = await scraper.scrapePopular();
    console.log(`Found ${popular.length} manga.`);
    if (popular.length > 0) {
        const firstManga = popular[0];
        console.log("First Manga:", firstManga.title, firstManga.link);
        const detail = await scraper.scrapeDetail(firstManga.link);
        if (detail && detail.chapters.length > 0) {
            console.log("First Chapter Link:", detail.chapters[0].link);
            const chapterData = await scraper.scrapeChapter(detail.chapters[0].link);
            console.log("Images found:", chapterData?.images?.length);
            console.log("Image sample:", chapterData?.images?.slice(0, 3));
        } else {
            console.log("No chapters found in detail!");
        }
    }
}
test();
