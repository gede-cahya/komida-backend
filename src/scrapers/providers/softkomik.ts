import * as cheerio from 'cheerio';
import { MangaSource, type ScrapedManga, type ScraperProvider, type MangaDetail, type MangaChapter, type ChapterData } from '../types';

export class SoftkomikScraper implements ScraperProvider {
    name = MangaSource.SOFTKOMIK;
    private readonly baseUrl = 'https://softkomik.com/';
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
                    image = `${this.baseUrl}${props.gambar}`;
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

            // Link example: https://softkomik.com/manga-slug/chapter/chapter-number
            // API example: https://softkomik.com/_next/data/BUILD_ID/manga-slug/chapter/chapter-number.json
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

            if (Array.isArray(rawImages)) {
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
                            if (url.startsWith('https://softkomik.com/img-file/')) {
                                return url.replace('https://softkomik.com/', 'https://image.softkomik.com/softkomik/');
                            }
                        }
                        return url;
                    })
                    .filter((s: string) => s && s.startsWith('http'));
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
