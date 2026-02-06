import { mangaService } from './service/mangaService';

async function main() {
    console.log('Testing Manga Chapter Scraping...');

    // Test Kiryuu (need a valid chapter link)
    // Using a known chapter link from manual inspection or previous runs
    const kiryuuChapterLink = 'https://kiryuu03.com/houkago-voca-ken-de-chapter-01/';
    // Or use the one from the detail test if dynamic

    // Let's first get detail to get a valid chapter link
    console.log('Fetching Kiryuu Detail to get chapter...');
    const kiryuuDetail = await mangaService.getMangaDetail('Kiryuu', 'https://kiryuu03.com/manga/houkago-voca-ken-de/');
    if (kiryuuDetail && kiryuuDetail.chapters.length > 0) {
        const firstChapter = kiryuuDetail.chapters[kiryuuDetail.chapters.length - 1]; // Get first released chapter (usually at bottom)
        console.log(`Testing Kiryuu Chapter: ${firstChapter.title} - ${firstChapter.link}`);
        const chapterData = await mangaService.getChapterImages('Kiryuu', firstChapter.link);
        if (chapterData) {
            console.log(`Kiryuu Images: ${chapterData.images.length}`);
            console.log(`Next: ${chapterData.next}`);
            console.log(`Prev: ${chapterData.prev}`);
        } else {
            console.log('Failed to fetch Kiryuu chapter data');
        }
    } else {
        console.log('Failed to get Kiryuu chapters');
    }

    // Test ManhwaIndo
    console.log('\nFetching ManhwaIndo Detail to get chapter...');
    const manhwaIndoDetail = await mangaService.getMangaDetail('ManhwaIndo', 'https://www.manhwaindo.my/komik/im-pregnant-but-i-wont-marry-without-love/');
    if (manhwaIndoDetail && manhwaIndoDetail.chapters.length > 0) {
        const firstChapter = manhwaIndoDetail.chapters[1]; // Try the second one
        console.log(`Testing ManhwaIndo Chapter: ${firstChapter.title} - ${firstChapter.link}`);
        const chapterData = await mangaService.getChapterImages('ManhwaIndo', firstChapter.link);
        if (chapterData) {
            console.log(`ManhwaIndo Images: ${chapterData.images.length}`);
            if (chapterData.images.length > 0) {
                console.log(`First Image: ${chapterData.images[0]}`);
            }
            console.log(`Next: ${chapterData.next}`);
            console.log(`Prev: ${chapterData.prev}`);
        } else {
            console.log('Failed to fetch ManhwaIndo chapter data');
        }
    } else {
        console.log('Failed to get ManhwaIndo chapters');
    }
}

main();
