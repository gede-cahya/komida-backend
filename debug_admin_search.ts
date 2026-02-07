
import { adminService } from './src/service/adminService';

async function testSearch() {
    try {
        console.log('Testing Admin Search...');
        const query = 'Naruto';
        console.log(`Query: ${query}`);

        const results = await adminService.searchExternalManga(query);
        console.log(`Found ${results.length} results.`);
        results.forEach(m => console.log(`- [${m.source}] ${m.title} (${m.link})`));

    } catch (error) {
        console.error('Search Failed:', error);
    }
}

testSearch();
