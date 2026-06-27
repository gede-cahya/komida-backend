const puppeteer = require('puppeteer');
const link = process.argv[2];
if (!link) {
   console.log(JSON.stringify({ error: "Missing link" }));
   process.exit(1);
}
async function main() {
   let browser;
   try {
       browser = await puppeteer.launch({
           headless: true,
           args: ['--no-sandbox', '--disable-setuid-sandbox']
       });
       const page = await browser.newPage();
       await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
       await page.goto(link, {waitUntil: 'networkidle2', timeout: 60000});
       await new Promise(r => setTimeout(r, 4000));
       
       const data = await page.evaluate(() => {
           const imgs = Array.from(document.querySelectorAll('img'));
           const images = imgs
              .map(img => img.src)
              .filter(src => src.includes('image') || src.includes('.jpg') || src.includes('.webp') || src.includes('komik') || src.includes('softkomik'))
              .filter(src => !src.startsWith('data:'));
           
           let prev = "", next = "";
           const nextDataEl = document.getElementById("__NEXT_DATA__");
           if (nextDataEl) {
               try {
                   const d = JSON.parse(nextDataEl.textContent);
                   const props = d.props.pageProps.data;
                   const slug = props.komik.title_slug;
                   const prevCh = props.prevChapter && props.prevChapter.length > 0 ? props.prevChapter[0].chapter : null;
                   const nextCh = props.nextChapter && props.nextChapter.length > 0 ? props.nextChapter[0].chapter : null;
                   if (prevCh) prev = `https://softkomik.co/${slug}/chapter/${prevCh}`;
                   if (nextCh) next = `https://softkomik.co/${slug}/chapter/${nextCh}`;
               } catch(e) {}
           }
           return { images, prev, next };
       });
       console.log(JSON.stringify(data));
   } catch(e) {
       console.log(JSON.stringify({ error: e.message }));
   } finally {
       if (browser) await browser.close();
   }
}
main();
