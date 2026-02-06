import { mangaService } from './service/mangaService';

async function main() {
    console.log('Testing Manga Detail Scraping...');

    // Test Kiryuu
    const kiryuuLink = 'https://kiryuu03.com/manga/houkago-voca-ken-de/';
    console.log(`Fetching Kiryuu: ${kiryuuLink}`);
    const kiryuuDetail = await mangaService.getMangaDetail('Kiryuu', kiryuuLink);
    console.log('Kiryuu Result:', JSON.stringify(kiryuuDetail, null, 2));

    // Test ManhwaIndo
    // Using a sample link found earlier or just a likely one
    const manhwaIndoLink = 'https://www.manhwaindo.my/komik/im-pregnant-but-i-wont-marry-without-love/';
    console.log(`Fetching ManhwaIndo: ${manhwaIndoLink}`);
    const manhwaIndoDetail = await mangaService.getMangaDetail('ManhwaIndo', manhwaIndoLink);
    console.log('ManhwaIndo Result:', JSON.stringify(manhwaIndoDetail, null, 2));
}

main();
