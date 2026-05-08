import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

async function main() {
   console.log("Launching puppeteer...");
   let browser;
   try {
       browser = await puppeteer.launch({ 
           headless: true, 
           args: ['--no-sandbox', '--disable-setuid-sandbox'] 
       });
       const page = await browser.newPage();
       await page.goto("https://softkomik.co/ticket-hero-s2-bahasa-indonesia/chapter/177", {waitUntil: 'networkidle0', timeout: 30000});
       console.log("Page loaded. Evaluating...");
       
       const images = await page.evaluate(() => {
           const imgs = Array.from(document.querySelectorAll('img'));
           return imgs.map((img: any) => img.src).filter((src: string) => src.includes('image') || src.includes('.jpg') || src.includes('cosmic') || src.includes('komik'));
       });
       console.log("Images found:", images.length);
       if (images.length > 0) {
           console.log(images.slice(0, 3));
       } else {
           console.log("HTML:", await page.content());
       }
   } catch(e) {
       console.log("Error:", e);
   } finally {
       if (browser) await browser.close();
   }
}
main();
