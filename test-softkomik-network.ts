import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function test() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('api') || url.includes('.json') || response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
            try {
                // Read text to look for webp/jpg or cdn1...
                if (url.includes('_next/') && !url.includes('.json')) return;
                const text = await response.text();
                if (text.includes('webp') || text.includes('jpg') || text.includes('cdn1')) {
                    console.log(`\nFound target in response: ${url}`);
                    console.log(`Snippet: ${text.substring(0, 300)}...`);
                }
            } catch (e) {}
        }
    });

    try {
        await page.goto("https://softkomik.co/i-became-a-munchkin-skill-thief-bahasa-indonesia/chapter/029", { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 5000));
    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await browser.close();
    }
}
test();
