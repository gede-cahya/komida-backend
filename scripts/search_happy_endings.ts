
import { mangaService } from '../src/service/mangaService';

async function searchHappyEndings() {
    const title = 'There Must Be Happy Endings';
    console.log(`Searching for "${title}"...`);

    // 1. Search Kiryuu
    console.log('Searching Kiryuu...');
    const kiryuuResults = await mangaService.searchExternal(title, 'Kiryuu');
    console.log(`Kiryuu found ${kiryuuResults.length} results.`);
    kiryuuResults.forEach(r => console.log(`[Kiryuu] ${r.title} - ${r.link}`));

    // 2. Search ManhwaIndo
    console.log('Searching ManhwaIndo...');
    const miResults = await mangaService.searchExternal(title, 'ManhwaIndo');
    console.log(`ManhwaIndo found ${miResults.length} results.`);
    miResults.forEach(r => console.log(`[ManhwaIndo] ${r.title} - ${r.link}`));

    process.exit(0);
}

searchHappyEndings();
