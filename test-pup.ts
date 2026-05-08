import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

async function main() {
   const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
   const page = await browser.newPage();
   await page.goto("https://softkomik.co/ticket-hero-s2-bahasa-indonesia/chapter/177", {waitUntil: 'networkidle0'});
   const images = await page.evaluate(() => {
       const imgs = Array.from(document.querySelectorAll('img'));
       return imgs.map((img: any) => img.src).filter((src: string) => src.includes('image') || src.includes('.jpg') || src.includes('cosmic') || src.includes('komik'));
   });
   console.log("Images found:", images.length, images.slice(0, 5));
   await browser.close();
}
main();
