
import * as cheerio from 'cheerio';

async function debugSearch() {
    const query = 'Naruto';

    // Test Kiryuu with post_type
    console.log('--- Testing Kiryuu HTML ---');
    const kiryuuUrl = `https://kiryuu03.com/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
    await testUrl(kiryuuUrl, '.listupd .bs');

    // Test Kiryuu WP JSON
    console.log('\n--- Testing Kiryuu WP JSON ---');
    const kiryuuJsonUrl = `https://kiryuu03.com/wp-json/wp/v2/manga?search=${encodeURIComponent(query)}&_embed`;
    await testJson(kiryuuJsonUrl);

    // Test ManhwaIndo
    console.log('\n--- Testing ManhwaIndo HTML ---');
    const manhwaIndoUrl = `https://www.manhwaindo.my/?s=${encodeURIComponent(query)}`;
    await testUrl(manhwaIndoUrl, '.listupd .bs');
}

async function testUrl(url: string, selector: string) {
    console.log(`Fetching ${url}...`);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const html = await response.text();
        console.log(`Response status: ${response.status}`);
        console.log(`HTML length: ${html.length}`);

        const $ = cheerio.load(html);
        const listItems = $(selector);
        console.log(`Found ${listItems.length} items with selector ${selector}`);

        if (listItems.length === 0) {
            console.log('--- HTML Dump (First 1000 chars) ---');
            console.log(html.substring(0, 1000));

            // Check broadly
            console.log('Checking generic classes:');
            console.log('.listupd:', $('.listupd').length);
            console.log('.bs:', $('.bs').length);
            console.log('.animepost:', $('.animepost').length);
            console.log('article:', $('article').length);
        } else {
            listItems.each((i, el) => {
                if (i < 3) {
                    console.log(`Item ${i}:`, $(el).find('.tt, .bigor, h4').text().trim().substring(0, 50));
                }
            });
        }

    } catch (e) {
        console.error(e);
    }
}

async function testJson(url: string) {
    console.log(`Fetching JSON ${url}...`);
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!response.ok) {
            console.log(`Error: ${response.status}`);
            return;
        }
        const data = await response.json();
        if (Array.isArray(data)) {
            console.log(`Found ${data.length} results.`);
            data.slice(0, 3).forEach((item: any) => {
                console.log(`- ${item.title?.rendered} (${item.link})`);
            });
        } else {
            console.log('Response is not an array');
        }
    } catch (e) {
        console.error(e);
    }
}

debugSearch();
