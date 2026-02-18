
import { mangaService } from '../src/service/mangaService';

async function searchHappyEndings() {
    const query = 'Happy Ending'; // Try simpler query
    console.log(`Searching for "${query}"...`);

    // Search ManhwaIndo
    const miResults = await mangaService.searchExternal(query, 'ManhwaIndo');
    console.log(`ManhwaIndo found ${miResults.length} results.`);
    miResults.forEach(r => console.log(`[ManhwaIndo] ${r.title} - ${r.link}`));

    // Search Kiryuu
    const kResults = await mangaService.searchExternal(query, 'Kiryuu');
    console.log(`Kiryuu found ${kResults.length} results.`);
    kResults.forEach(r => console.log(`[Kiryuu] ${r.title} - ${r.link}`));

    process.exit(0);
}

searchHappyEndings();
