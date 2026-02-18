
import { mangaService } from '../src/service/mangaService';

async function searchYeoneun() {
    console.log('Searching for "Yeoneun"...');
    const miResults = await mangaService.searchExternal('Yeoneun', 'ManhwaIndo');
    miResults.forEach(r => console.log(`[ManhwaIndo] ${r.title} - ${r.link}`));

    const kResults = await mangaService.searchExternal('Yeoneun', 'Kiryuu');
    kResults.forEach(r => console.log(`[Kiryuu] ${r.title} - ${r.link}`));

    console.log('Searching for "Happy Endings" on Shinigami...');
    // Shinigami scraper name is "Shinigami" or "Shinigami ID"?
    // Check providers list? assuming Shinigami.
    try {
        const sResults = await mangaService.searchExternal('Happy Endings', 'Shinigami');
        sResults.forEach(r => console.log(`[Shinigami] ${r.title} - ${r.link}`));
    } catch (e: any) {
        console.log(`Shinigami search error: ${e.message}`);
    }

    process.exit(0);
}

searchYeoneun();
