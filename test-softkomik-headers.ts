import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function test() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    page.on('request', (req) => {
        if (req.url().includes('v2.softdevices')) {
            console.log("Method:", req.method());
            console.log("Headers:", req.headers());
            console.log("Post data:", req.postData());
        }
    });

    try {
        await page.goto("https://softkomik.co/i-became-a-munchkin-skill-thief-bahasa-indonesia/chapter/029", { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 5000));
    } finally {
        await browser.close();
    }
}
test();
