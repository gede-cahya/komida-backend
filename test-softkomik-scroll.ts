import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function test() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--window-size=1920,1080'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    try {
        await page.goto("https://softkomik.co/sousei-no-taiga/chapter/112", { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Auto scroll to trigger lazy loading
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 500;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 200);
            });
        });
        
        await new Promise(r => setTimeout(r, 2000)); // wait extra second
        
        const imgs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img'))
                .map(img => img.src)
                .filter(src => src && (src.includes('content') || src.includes('chapter') || src.includes('.jpg') || src.includes('.webp') || src.includes('komik')))
                .filter(src => !src.startsWith('data:image'));
        });
        
        console.log("Found images:", imgs.length);
        console.log("First few:", JSON.stringify(imgs.slice(0, 5), null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await browser.close();
    }
}
test();
