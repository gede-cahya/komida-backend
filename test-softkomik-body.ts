import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function test() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto("https://softkomik.co/sousei-no-taiga/chapter/112", { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Let's get the inner HTML of the main container, or looking for specific ids/classes
        const result = await page.evaluate(() => {
            // Try to find the container div that might hold the reader images
            // Often it's an id like 'readerarea' or class 'main-content'
            const allImgs = Array.from(document.querySelectorAll('img')).map(el => el.outerHTML);
            const allDivs = Array.from(document.querySelectorAll('div'))
                .filter(el => el.childElementCount > 5)
                .map(el => `${el.className} | id=${el.id} | children=${el.childElementCount}`);
            
            return {
                imgCount: allImgs.length,
                someImgs: allImgs.slice(0, 5),
                divs: allDivs
            };
        });
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
}
test();
