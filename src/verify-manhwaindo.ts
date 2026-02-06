
import { ManhwaIndoScraper } from './scrapers/providers/manhwaindo';
import * as cheerio from 'cheerio';

async function verify() {
    const url = 'https://www.manhwaindo.my/series/mikadono-sanshimai-wa-angai-choroi/';
    console.log(`Fetching detail ${url}...`);
    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    console.log(`Response Status: ${res.status}`);
    console.log(`HTML Length: ${html.length}`);
    await Bun.write('debug_manhwaindo_mikadono.html', html);

    console.log('\n--- DOM Structure Inspection ---');
    $('.series-chapterlist li, #chapterlist li').slice(0, 3).each((i, el) => {
        console.log(`\nItem ${i}:`);
        console.log($(el).html());
        console.log('Text content:', $(el).text().trim());
    });

    // Test Scraper Logic
    console.log('\n--- Scraper Logic Test ---');
    const scraper = new ManhwaIndoScraper();
    const detail = await scraper.scrapeDetail(url);
    if (detail && detail.chapters.length > 0) {
        detail.chapters.slice(0, 3).forEach(c => {
            console.log(`Parsed: Title="${c.title}" | Date="${c.released}"`);
        });
    }
}

verify();
