import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function test() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto("https://softkomik.co/sousei-no-taiga/chapter/112", { waitUntil: 'networkidle0' });
        const imgs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img')).map(img => ({
                src: img.src,
                srcset: img.srcset,
                dataSrc: img.getAttribute('data-src'),
                className: img.className,
                alt: img.alt
            })).filter(img => img.className.includes('image') || img.alt.includes('chapter'));
        });
        console.log(JSON.stringify(imgs, null, 2));
    } finally {
        await browser.close();
    }
}
test();
