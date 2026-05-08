import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function test() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto("https://softkomik.co/sousei-no-taiga/chapter/112", { waitUntil: 'networkidle0', timeout: 30000 });
        
        const nextData = await page.evaluate(() => {
            const script = document.getElementById('__NEXT_DATA__');
            return script ? JSON.parse(script.textContent || '{}') : null;
        });
        
        if (nextData) {
            console.log("Found __NEXT_DATA__!");
            // Search for "images" or arrays resembling chapter images
            console.log("Props:", Object.keys(nextData.props?.pageProps || {}));
            if (nextData.props?.pageProps?.img) {
                console.log("Images found in pageProps.img:", nextData.props.pageProps.img.slice(0, 3));
            } else if (nextData.props?.pageProps?.data) {
                console.log("Data keys:", Object.keys(nextData.props.pageProps.data));
            }
        } else {
            console.log("No __NEXT_DATA__ found.");
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    } finally {
        await browser.close();
    }
}
test();
