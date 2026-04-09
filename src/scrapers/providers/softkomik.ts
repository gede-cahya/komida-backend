import * as cheerio from 'cheerio';
import { MangaSource, type ScrapedManga, type ScraperProvider, type MangaDetail, type MangaChapter, type ChapterData } from '../types';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export class SoftkomikScraper implements ScraperProvider {
    name = MangaSource.SOFTKOMIK;
    private readonly baseUrl = 'https://softkomik.co/';
    private buildId: string | null = null;

    private async getBuildId(): Promise<string | null> {
        if (this.buildId) return this.buildId;
        try {
            console.log(`[Softkomik] Fetching Build ID...`);
            const response = await fetch(this.baseUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const html = await response.text();

            // Try 1: __NEXT_DATA__
            const $ = cheerio.load(html);
            const nextData = $('#__NEXT_DATA__').html();
            if (nextData) {
                try {
                    const json = JSON.parse(nextData);
                    if (json.buildId) {
                        this.buildId = json.buildId;
                        return json.buildId;
                    }
                } catch (e) { }
            }

            // Try 2: Regex search
            const match = html.match(/"buildId":"([^"]+)"/);
            if (match) {
                this.buildId = match[1];
                return match[1];
            }
        } catch (e) {
            console.error('Error fetching Softkomik Build ID', e);
        }
        return null;
    }

    async search(query: string): Promise<ScrapedManga[]> {
        try {
            console.log(`Searching ${this.name} for "${query}"...`);
            const url = `${this.baseUrl}?s=${encodeURIComponent(query)}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) throw new Error(`Failed to fetch search: ${response.status}`);

            const html = await response.text();
            const $ = cheerio.load(html);
            const mangaList: ScrapedManga[] = [];

            $('.item-komik').each((_, element) => {
                // Find title: The first link that has text and is not a chapter link
                const links = $(element).find('a');
                let titleEl = links.first();
                let title = '';

                links.each((_, link) => {
                    const t = $(link).text().trim();
                    const href = $(link).attr('href') || '';
                    const hasImg = $(link).find('img').length > 0;

                    if (t && !hasImg && !href.includes('/chapter/') && !href.includes('/type/')) {
                        title = t;
                        titleEl = $(link);
                        return false; // Break
                    }
                });

                const link = titleEl.attr('href');
                let imgEl = $(element).find('img').first();
                let image = imgEl.attr('data-src') || imgEl.attr('src') || imgEl.attr('data-lazy-src') || '';

                // Clean up double slashes from relative paths (e.g. //uploads...)
                if (image.startsWith('//')) {
                    image = image.substring(1);
                }

                if (!image || image.startsWith('data:')) {
                    const noScript = $(element).find('noscript').text();
                    if (noScript) {
                        const match = noScript.match(/src="([^"]+)"/);
                        if (match) image = match[1];
                    }
                }

                // Fallback: try to find image in the cover link
                if (!image || image.startsWith('data:')) {
                    const coverImg = $(element).find('a:first-child img').attr('src');
                    if (coverImg && !coverImg.startsWith('data:')) image = coverImg;
                }

                if (image && !image.startsWith('http')) {
                    if (image.startsWith('/_next/image')) {
                        const match = image.match(/url=([^&]+)/);
                        if (match) image = decodeURIComponent(match[1]);
                        else image = `${this.baseUrl}${image}`;
                    } else {
                        image = `${this.baseUrl}${image.replace(/^\//, '')}`;
                    }
                }

                let chapter = $(element).find('a[href*="/chapter/"]').last().text().trim();
                if (!chapter) chapter = 'Unknown';

                if (title && link) {
                    const fullLink = link.startsWith('http') ? link : `${this.baseUrl.replace(/\/$/, '')}${link}`;

                    mangaList.push({
                        title: title.replace('Bahasa Indonesia', '').trim(),
                        image,
                        source: this.name,
                        chapter,
                        link: fullLink
                    });
                }
            });

            console.log(`Found ${mangaList.length} results from ${this.name}`);
            return mangaList;
        } catch (error) {
            console.error(`Error searching ${this.name}:`, error);
            return [];
        }
    }

    async scrapePopular(): Promise<ScrapedManga[]> {
        try {
            console.log(`Scraping ${this.name}...`);
            const response = await fetch(this.baseUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) throw new Error(`Failed to fetch ${this.baseUrl}: ${response.statusText}`);

            const html = await response.text();
            const $ = cheerio.load(html);
            const mangaList: ScrapedManga[] = [];

            // Selector: .item-komik
            $('.item-komik').each((_, element) => {
                const titleEl = $(element).find('.item-title a');
                const imgEl = $(element).find('.img-komik-item img');

                const title = titleEl.text().trim();
                const link = titleEl.attr('href');
                let image = imgEl.attr('data-src') || imgEl.attr('src') || imgEl.attr('data-lazy-src') || '';

                if (!image || image.startsWith('data:')) {
                    const noScript = $(element).find('noscript').text();
                    if (noScript) {
                        const match = noScript.match(/src="([^"]+)"/);
                        if (match) image = match[1];
                    }
                }

                if (image && !image.startsWith('http')) {
                    if (image.startsWith('/_next/image')) {
                        const match = image.match(/url=([^&]+)/);
                        if (match) image = decodeURIComponent(match[1]);
                        else image = `${this.baseUrl}${image}`;
                    } else {
                        image = `${this.baseUrl}${image.replace(/^\//, '')}`;
                    }
                }

                let chapter = $(element).find('a[href*="/chapter/"]').first().text().trim();
                if (!chapter) chapter = $(element).find('.chapter').text().trim();
                if (!chapter) chapter = 'Chapter ?';

                if (title && link) {
                    const fullLink = link.startsWith('http') ? link : `${this.baseUrl.replace(/\/$/, '')}${link}`;

                    mangaList.push({
                        title: title.replace('Bahasa Indonesia', '').trim(),
                        image,
                        source: this.name,
                        chapter: chapter,
                        link: fullLink
                    });
                }
            });

            const uniqueList = Array.from(new Map(mangaList.map(item => [item.link, item])).values());
            console.log(`Found ${uniqueList.length} manga from ${this.name}`);
            return uniqueList;

        } catch (error) {
            console.error(`Error scraping ${this.name}:`, error);
            return [];
        }
    }

    async scrapeDetail(link: string): Promise<MangaDetail | null> {
        try {
            console.log(`[Softkomik] Scraping detail ${link}...`);
            const buildId = await this.getBuildId();
            if (!buildId) return null;

            // Extract slug
            const urlObj = new URL(link);
            const slug = urlObj.pathname.split('/').filter(Boolean).pop(); // Filter(Boolean) to remove empty strings
            if (!slug) {
                console.error(`Could not extract slug from link: ${link}`);
                return null;
            }
            const jsonUrl = `${this.baseUrl}_next/data/${buildId}/${slug}.json`;
            console.log(`Fetching JSON: ${jsonUrl}`);

            const response = await fetch(jsonUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!response.ok) {
                console.error(`Failed to fetch JSON data for ${link}: ${response.statusText}. Resetting buildId.`);
                this.buildId = null; // Reset cache
                return null;
            }

            const json = await response.json();
            const props = json.pageProps?.data || json.pageProps?.comic;

            if (!props) {
                console.error(`No pageProps.data or pageProps.comic found in JSON for ${link}`);
                return null;
            }


            const title = (props.title || '').replace('Bahasa Indonesia', '').trim();

            let image = '';
            if (props.gambar) {
                if (props.gambar.startsWith('http')) {
                    image = props.gambar;
                } else if (props.gambar.startsWith('image-cover/') || props.gambar.startsWith('uploads-cover-2/')) {
                    // Cover images hosted on cover.softdevices.my.id/softkomik-cover/
                    image = `https://cover.softdevices.my.id/softkomik-cover/${props.gambar}`;
                } else {
                    // Ensure no double slashes
                    const cleanBase = this.baseUrl.replace(/\/$/, '');
                    const cleanPath = props.gambar.startsWith('/') ? props.gambar : `/${props.gambar}`;
                    image = `${cleanBase}${cleanPath}`;
                }
            }
            const synopsis = props.sinopsis || props.description || '';
            const status = props.status || 'Ongoing';
            const genres = (props.Genre || props.genres || []).map((g: any) => typeof g === 'string' ? g : g.name).filter(Boolean);

            // Chapters are often loaded client-side or via a separate API call for Next.js sites.
            // For now, we return an empty array as per the instruction's comment.
            // A future enhancement would be to find the chapter API endpoint if it exists.

            const chapters: MangaChapter[] = [];
            // Heuristic: Generate chapters based on latest_chapter
            // This is a fast fallback since we cannot find the full list in the JSON props
            if (props.latest_chapter) {
                const latest = parseInt(props.latest_chapter.replace(/[^\d]/g, ''), 10);
                if (!isNaN(latest) && latest > 0) {
                    for (let i = latest; i >= 1; i--) {
                        const chapterNum = i.toString().padStart(3, '0');
                        chapters.push({
                            title: `Chapter ${i}`,
                            link: `${link}/chapter/${chapterNum}`,
                            released: props.updated_at
                        });
                    }
                }
            }

            return {
                title,
                image,
                synopsis,
                genres,
                status,
                author: props.author || 'Unknown',
                rating: props.rating?.value || 0,
                chapters: chapters
            };

        } catch (error) {
            console.error(`Error scraping detail for ${link}:`, error);
            return null;
        }
    }

    async scrapeChapter(link: string): Promise<ChapterData | null> {
        try {
            console.log(`[Softkomik] Scraping chapter ${link}...`);
            const buildId = await this.getBuildId();
            if (!buildId) return null;

            // Link example: https://softkomik.co/manga-slug/chapter/chapter-number
            // API example: https://softkomik.co/_next/data/BUILD_ID/manga-slug/chapter/chapter-number.json
            const urlObj = new URL(link);
            const pathParts = urlObj.pathname.split('/').filter(Boolean); // e.g., ['manga-slug', 'chapter', 'chapter-number']

            if (pathParts.length < 3 || pathParts[1] !== 'chapter') {
                console.error(`Invalid chapter link format: ${link}`);
                return null;
            }

            const mangaSlug = pathParts[0];
            const chapterSlug = pathParts[2];
            const uniquePath = `${mangaSlug}/chapter/${chapterSlug}`;

            const jsonUrl = `${this.baseUrl}_next/data/${buildId}/${uniquePath}.json`;
            console.log(`Fetching chapter JSON: ${jsonUrl}`);

            const response = await fetch(jsonUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                console.error(`Failed to fetch chapter JSON data for ${link}: ${response.statusText}. Resetting buildId.`);
                this.buildId = null; // Reset cache
                return null;
            }

            const json = await response.json();
            const props = json.pageProps;


            let images: string[] = [];
            // Softkomik JSON structure: pageProps.data.data.imageSrc
            const chapterData = props?.data?.data || props?.data || props?.chapter;

            const rawImages = chapterData?.imageSrc || chapterData?.images || [];

            if (Array.isArray(rawImages) && rawImages.length > 0) {
                images = rawImages
                    .map((s: any) => {
                        let url = typeof s === 'string' ? s : (s.url || s.src);
                        if (url && !url.startsWith('http')) {
                            // Chapter images usually start with "myUploads/"
                            if (url.startsWith('myUploads/')) {
                                // Found via reverse engineering: https://image.softkomik.com/softkomik/myUploads/...
                                return `https://image.softkomik.com/softkomik/${url}`;
                            }
                            if (url.startsWith('img-file/')) {
                                return `https://image.softkomik.com/softkomik/${url}`;
                            }
                            return `${this.baseUrl}${url}`;
                        } else {
                            // Handle absolute URLs that point to the wrong host (main domain)
                            if (url.startsWith('https://softkomik.co/img-file/')) {
                                return url.replace('https://softkomik.co/', 'https://image.softkomik.co/softkomik/');
                            }
                        }
                        return url;
                    })
                    .filter((s: string) => s && s.startsWith('http'));
            } else {
                console.log(`[Softkomik] No images found in JSON. Falling back to Puppeteer to bypass anti-bot...`);
                let browser;
                try {
                    const puppeteerOpts: any = {
                        headless: true,
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    };
                    
                    // On VPS (Linux), use the system chromium-browser if the bundled one is missing
                    if (process.platform === 'linux') {
                        puppeteerOpts.executablePath = '/usr/bin/chromium-browser';
                    }
                    
                    browser = await puppeteer.launch(puppeteerOpts);
                    const page = await browser.newPage();
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                    
                    // Use domcontentloaded instead of networkidle0 to prevent timeouts from ads/scripts
                    try {
                        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    } catch (e) {
                         console.log(`[Softkomik] goto timed out, attempting to extract images anyway...`);
                    }
                    
                    // Wait dynamically for at least one comic image to appear (Next.js can be slow on VPS)
                    try {
                        await page.waitForFunction(() => {
                            const imgs = Array.from(document.querySelectorAll('img'));
                            return imgs.some(img => img.src && (img.src.includes('softkomik') || img.src.includes('img-file') || img.src.includes('webp')));
                        }, { timeout: 20000 });
                        
                        // Once the first image appears, Next.js is actively rendering the rest. Give it 4 seconds to finish.
                        await new Promise(r => setTimeout(r, 4000));
                    } catch (e) {
                        console.log(`[Softkomik] Dynamic wait timed out, extracting whatever is available...`);
                    }
                    
                    images = await page.evaluate(() => {
                        const imgs = Array.from(document.querySelectorAll('img'));
                        return imgs
                            .map((img: any) => img.src)
                            .filter((src: string) => src && (src.includes('image') || src.includes('.jpg') || src.includes('.webp') || src.includes('cosmic') || src.includes('komik') || src.includes('cdn')));
                    });
                    
                    console.log(`[Softkomik] Extracted ${images.length} images via Puppeteer.`);
                } catch (e) {
                    console.error(`[Softkomik] Puppeteer extraction failed for ${link}:`, e);
                } finally {
                    if (browser) await browser.close();
                }
            }

            let next: string | undefined;
            let prev: string | undefined;

            const nextChapterSlug = props?.next_chapter?.slug || props?.nextChapter;
            const prevChapterSlug = props?.prev_chapter?.slug || props?.prevChapter;

            if (nextChapterSlug) {
                next = `${this.baseUrl}${mangaSlug}/chapter/${nextChapterSlug}`;
            }
            if (prevChapterSlug) {
                prev = `${this.baseUrl}${mangaSlug}/chapter/${prevChapterSlug}`;
            }

            return {
                images: images,
                next,
                prev
            };

        } catch (error) {
            console.error(`Error scraping chapter for ${link}:`, error);
            return null;
        }
    }
}
