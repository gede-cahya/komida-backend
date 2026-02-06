import { MangaSource, type ScrapedManga, type ScraperProvider, type MangaDetail, type ChapterData } from '../types';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export class ShinigamiBrowserScraper implements ScraperProvider {
    name = MangaSource.SHINIGAMI;
    private readonly baseUrl = 'https://09.shinigami.asia/explore?order=popular';

    async scrapePopular(): Promise<ScrapedManga[]> {
        console.log(`[Puppeteer-Extra] Starting scrape for ${this.name}...`);
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true, // Try 'true' first, if fails, might need 'false' (visible)
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                ]
            });

            const page = await browser.newPage();

            // Set a realistic User-Agent (Plugin does this too, but redundancy is fine)
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Navigate to the page
            console.log(`[Puppeteer-Extra] Navigating to ${this.baseUrl}...`);
            await page.goto(this.baseUrl, {
                waitUntil: 'networkidle2',
                timeout: 90000 // Extended timeout
            });

            // Simulate human behavior
            console.log('[Puppeteer-Extra] Simulating human interactions...');
            await page.setViewport({ width: 1920, height: 1080 });

            // 1. Mouse movements
            await page.mouse.move(100, 100);
            await page.mouse.move(200, 200);

            // 2. Random Scrolling to trigger lazy loading
            await page.evaluate(async () => {
                await new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;

                        if (totalHeight >= scrollHeight || totalHeight > 3000) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });

            // Wait a bit more for content to settle
            await new Promise(r => setTimeout(r, 2000));

            // Wait for the grid to load
            const selector = 'div.grid > div';
            try {
                await page.waitForSelector(selector, { timeout: 15000 });
            } catch (e) {
                console.log(`[Puppeteer-Extra] WaitForSelector timed out, attempting extraction anyway...`);
            }

            // Extract data using page.evaluate
            const mangaList = await page.evaluate((sourceName) => {
                const results: any[] = [];
                // Target the grid items effectively
                const cards = document.querySelectorAll('div.grid > div');

                cards.forEach(card => {
                    // Refined CSS Selectors
                    const linkEl = card.querySelector('a[href*="/series/"]');
                    const imgEl = card.querySelector('img');
                    const titleEl = card.querySelector('a.font-medium, .line-clamp-2, h4');

                    const chapterEls = card.querySelectorAll('a[href*="/chapter/"]');

                    if (linkEl && imgEl && titleEl) {
                        const title = titleEl.textContent?.trim() || '';
                        const link = (linkEl as HTMLAnchorElement).href;
                        const image = (imgEl as HTMLImageElement).src;

                        let chapter = '';
                        let previous_chapter = '';

                        if (chapterEls.length > 0) {
                            chapter = chapterEls[0].textContent?.trim() || '';
                            chapter = chapter.replace(/\s+/g, ' ').trim();
                        }
                        if (chapterEls.length > 1) {
                            previous_chapter = chapterEls[1].textContent?.trim() || '';
                            previous_chapter = previous_chapter.replace(/\s+/g, ' ').trim();
                        }

                        // Filter out empty cards or incorrect elements
                        if (title && link && !title.includes('Project')) {
                            results.push({
                                title,
                                image,
                                source: sourceName,
                                chapter,
                                previous_chapter,
                                link
                            });
                        }
                    }
                });
                return results;
            }, this.name);

            console.log(`[Puppeteer-Extra] Found ${mangaList.length} manga from ${this.name}`);

            if (mangaList.length === 0) {
                console.log('[Puppeteer-Extra] No manga found. Taking screenshot...');
                await page.screenshot({ path: 'debug_shinigami_puppeteer_extra.png', fullPage: true });
                const html = await page.content();
                await Bun.write('debug_shinigami_puppeteer_extra.html', html);
            }

            return mangaList;

        } catch (error) {
            console.error(`[Puppeteer-Extra] Error scraping ${this.name}:`, error);
            if (browser) {
                try {
                    const pages = await browser.pages();
                    if (pages.length > 0) {
                        await pages[0].screenshot({ path: 'debug_shinigami_error_extra.png' });
                    }
                } catch { }
            }
            return [];
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }
    async scrapeDetail(link: string): Promise<MangaDetail | null> {
        console.warn(`[Shinigami] Detail scraping blocked by Cloudflare.`);
        return null;
    }
    async scrapeChapter(link: string): Promise<ChapterData | null> {
        console.warn(`[Shinigami] Chapter scraping blocked by Cloudflare.`);
        return null;
    }
}
