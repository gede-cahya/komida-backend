import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function test() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto("https://softkomik.co/sousei-no-taiga/chapter/112", { waitUntil: 'networkidle2', timeout: 30000 });
        await page.screenshot({ path: 'softkomik-test.jpg', fullPage: false });
        
        const imgs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img')).map(img => ({
                src: img.src,
                srcset: img.srcset
            }));
        });
        
        console.log(JSON.stringify(imgs.slice(0, 15), null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await browser.close();
    }
}
test();
