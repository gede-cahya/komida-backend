
import { KiryuuScraper } from './src/scrapers/providers/kiryuu';

async function test() {
    const scraper = new KiryuuScraper();
    console.log('Testing Homepage...');
    try {
        const popular = await scraper.scrapePopular();
        console.log(`Popular: found ${popular.length} items`);
    } catch (e) {
        console.error('Homepage failed:', e);
    }

    console.log('\nTesting Manga Search (Reborn as the Heavenly Demon)...');
    try {
        // "Reborn as the Heavenly Demon" might be under a different title on Kiryuu
        // But let's verify connectivity first.
        const detail = await scraper.scrapeDetail('https://kiryuu03.com/manga/reborn-as-the-heavenly-demon/');
        if (detail) {
            console.log(`Detail found: ${detail.title}`);
            if (detail.chapters.length > 0) {
                const firstChapter = detail.chapters[detail.chapters.length - 1]; // First chapter usually last in list
                console.log(`Testing Chapter: ${firstChapter.title} (${firstChapter.link})`);

                const chapterData = await scraper.scrapeChapter(firstChapter.link);
                if (chapterData && chapterData.images.length > 0) {
                    console.log(`Found ${chapterData.images.length} images`);
                    console.log(`Sample Image: ${chapterData.images[0]}`);

                    // Test fetching the image
                    console.log('Attempting to fetch image...');
                    const imgRes = await fetch(chapterData.images[0], {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Referer': 'https://kiryuu03.com/'
                        }
                    });
                    console.log(`Image Fetch Status: ${imgRes.status}`);

                } else {
                    console.log('No images found in chapter');
                }
            } else {
                console.log('No chapters found');
            }
        } else {
            console.log('Detail not found (null)');
        }
    } catch (e) {
        console.error('Detail failed:', e);
    }
}

test();
