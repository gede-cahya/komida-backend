
import { mangaService } from '../src/service/mangaService';
import { db } from '../src/db';

async function forceUpdate() {
    const targets = [
        { title: 'The Nebula’s Civilization', source: 'ManhwaIndo' },
        { title: 'Marriagetoxin', source: 'Softkomik' },
        { title: 'Shibou Yuugi de Meshi wo Kuu', source: 'ManhwaIndo' }, // Assuming this one is also ManhwaIndo or check all
    ];

    console.log('Force updating metadata for targets...');

    // 1. Trigger Popular Cache Update (Should re-scrape Main Page)
    console.log('Refetching Popular/Trending list...');
    await mangaService.updatePopularCache();

    // 2. Search and Detail Update for specific targets
    for (const target of targets) {
        console.log(`Searching for ${target.title} on ${target.source}...`);
        try {
            const searchResults = await mangaService.searchExternal(target.title, target.source);
            const match = searchResults.find(m => m.title.toLowerCase().includes(target.title.toLowerCase()));

            if (match) {
                console.log(`Found match: ${match.title}. Updating detail...`);
                await mangaService.importManga(target.source, match.link);
                console.log(`Successfully updated ${match.title}`);
                if (match.image) {
                    console.log(`New Image URL: ${match.image}`);
                }
            } else {
                console.log(`No match found for ${target.title} on ${target.source}`);
            }
        } catch (e) {
            console.error(`Error updating ${target.title}:`, e);
        }
    }

    console.log('Update complete.');
    process.exit(0);
}

forceUpdate();
