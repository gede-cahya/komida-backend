
import * as cheerio from 'cheerio';
import { MangaSource, type ScrapedManga, type ScraperProvider, type MangaDetail, type MangaChapter, type ChapterData } from '../types';

export class ManhwaIndoScraper implements ScraperProvider {
    name = MangaSource.MANHWAINDO;
    private readonly baseUrl = 'https://www.manhwaindo.my/';

    private formatIndonesianDate(dateStr: string): string {
        const months: { [key: string]: string } = {
            'Januari': 'January', 'Februari': 'February', 'Maret': 'March',
            'April': 'April', 'Mei': 'May', 'Juni': 'June',
            'Juli': 'July', 'Agustus': 'August', 'September': 'September',
            'Oktober': 'October', 'November': 'November', 'Desember': 'December',
            'Agust': 'August', 'Okt': 'October', 'Nov': 'November', 'Des': 'December'
        };
        return dateStr.replace(/\b(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|Agust|Okt|Nov|Des)\b/g, (match) => months[match]);
    }

    async scrapePopular(): Promise<ScrapedManga[]> {
        try {
            console.log(`Scraping ${this.name}...`);
            const response = await fetch(this.baseUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${this.baseUrl}: ${response.statusText}`);
            }
            const html = await response.text();
            // await Bun.write('debug_manhwaindo.html', html); // debugging
            const $ = cheerio.load(html);
            const mangaList: ScrapedManga[] = [];

            // Selectors based on debug HTML:
            // Container: .utao .uta
            $('.utao .uta').each((_, element) => {
                const titleElement = $(element).find('.luf h4');
                const imgElement = $(element).find('.imgu img');
                const latestChapterElement = $(element).find('.luf ul li:nth-child(1) a');
                const prevChapterElement = $(element).find('.luf ul li:nth-child(2) a');
                const linkElement = $(element).find('.luf a.series');

                const title = titleElement.text().trim();
                const link = linkElement.attr('href') || '';
                // Prefer data-src or data-original for lazy loaded images
                const image = imgElement.attr('data-src') || imgElement.attr('data-original') || imgElement.attr('src') || '';
                const chapter = latestChapterElement.text().trim();
                const previous_chapter = prevChapterElement.text().trim();

                if (title && link) {
                    mangaList.push({
                        title,
                        image,
                        source: this.name,
                        chapter,
                        previous_chapter,
                        link
                    });
                }
            });

            console.log(`Found ${mangaList.length} manga from ${this.name}`);
            return mangaList;
        } catch (error) {
            console.error(`Error scraping ${this.name}:`, error);
            return [];
        }
    }

    async search(query: string): Promise<ScrapedManga[]> {
        try {
            console.log(`Searching ${this.name} for "${query}"...`);
            const url = `${this.baseUrl}?s=${encodeURIComponent(query)}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': this.baseUrl
                }
            });
            if (!response.ok) throw new Error(`Failed to fetch search: ${response.status}`);

            const html = await response.text();
            const $ = cheerio.load(html);
            const mangaList: ScrapedManga[] = [];

            // Similar selectors to popular/latest
            const items = $('.listupd .bs');
            console.log(`[ManhwaIndo] Found ${items.length} items in search DOM.`);

            items.each((_, element) => {
                let title = $(element).find('.tt a').text().trim();
                if (!title) title = $(element).find('.tt').text().trim(); // Fallback

                const link = $(element).find('a').attr('href') || '';
                let image = $(element).find('img').attr('data-src') ||
                    $(element).find('img').attr('data-original') ||
                    $(element).find('img').attr('src') || '';
                const chapter = $(element).find('.epxs').text().trim();
                const rating = parseFloat($(element).find('.numscore').text().trim()) || 0;

                if (title && link) {
                    mangaList.push({
                        title,
                        image,
                        source: this.name,
                        chapter,
                        rating,
                        link
                    });
                } else {
                    console.log('[ManhwaIndo] Skip item due to missing title/link', title, link);
                }
            });

            console.log(`Found ${mangaList.length} results from ${this.name}`);
            return mangaList;
        } catch (error) {
            console.error(`Error searching ${this.name}:`, error);
            return [];
        }
    }

    async scrapeDetail(link: string): Promise<MangaDetail | null> {
        try {
            console.log(`Scraping detail ${link}...`);
            const response = await fetch(link, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                console.error(`Failed to fetch detail: ${response.status}`);
                return null;
            }
            const html = await response.text();
            const $ = cheerio.load(html);

            const title = $('h1').first().text().trim();
            const image = $('.series-thumb img').attr('src') || $('.thumb img').attr('src') || '';
            const synopsis = $('.series-synopsys').text().trim() || $('.entry-content').text().trim();
            const genres = $('.series-genres a, .genre-info a').map((_, el) => $(el).text().trim()).get();
            const status = 'Ongoing';
            const author = $('.series-infolist li:contains("Author") span').text().trim() || 'Unknown';
            const rating = parseFloat($('.series-rating').text().trim()) || 0;

            const chapters: MangaChapter[] = [];
            $('.series-chapterlist li, #chapterlist li').each((_, element) => {
                const linkEl = $(element).find('a');
                // Use .chapternum or fallback to text excluding .chapterdate
                let chapTitle = linkEl.find('.chapternum').text().trim() || linkEl.find('.chapter-name').text().trim();

                if (!chapTitle) {
                    // Fallback to text but try to remove date
                    const clone = linkEl.clone();
                    clone.find('.chapterdate, .chapter-date').remove();
                    chapTitle = clone.text().trim();
                }

                const chapLink = linkEl.attr('href') || '';
                const rawReleased = linkEl.find('.chapterdate').text().trim() || linkEl.find('.chapter-date').text().trim() || $(element).find('.chapter-date').text().trim();
                const released = this.formatIndonesianDate(rawReleased);

                if (chapTitle && chapLink) {
                    chapters.push({
                        title: chapTitle,
                        link: chapLink,
                        released
                    });
                }
            });

            return {
                title,
                image,
                synopsis,
                genres,
                author,
                status,
                rating,
                chapters
            };

        } catch (error) {
            console.error(`Error scraping detail from ${this.name}:`, error);
            return null;
        }
    }

    async scrapeChapter(link: string): Promise<ChapterData | null> {
        try {
            console.log(`Scraping chapter ${link}...`);
            const response = await fetch(link, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                console.error(`Failed to fetch chapter: ${response.status}`);
                return null;
            }
            const html = await response.text();
            const $ = cheerio.load(html);

            const images: string[] = [];
            $('#readerarea img, .reading-content img').each((_, element) => {
                const dataSrc = $(element).attr('data-src');
                const src = $(element).attr('src');
                const validSrc = dataSrc || src;

                if (validSrc && !validSrc.startsWith('data:image')) {
                    images.push(validSrc.trim());
                } else if (validSrc) {
                    // Check if it's a real base64 image or just tiny placeholder
                    if (validSrc.length > 1000) {
                        images.push(validSrc.trim());
                    }
                }
            });

            // Navigation - Parse from Script Content (JSON variables)
            const scriptContent = $('script').map((_, el) => $(el).html()).get().join(' ');

            // Regex for unique structure seen in debug: "prevUrl":"...","nextUrl":"..."
            let next: string | undefined;
            let prev: string | undefined;

            const nextMatch = scriptContent.match(/"nextUrl"\s*:\s*"([^"]*)"/);
            const prevMatch = scriptContent.match(/"prevUrl"\s*:\s*"([^"]*)"/);

            if (nextMatch && nextMatch[1]) {
                const url = nextMatch[1].replace(/\\/g, ''); // Unescape slashes
                if (url && url.startsWith('http')) {
                    next = url;
                }
            }

            if (prevMatch && prevMatch[1]) {
                const url = prevMatch[1].replace(/\\/g, ''); // Unescape slashes
                if (url && url.startsWith('http')) {
                    prev = url;
                }
            }

            return { images, next, prev };
        } catch (error) {
            console.error(`Error scraping chapter from ${this.name}:`, error);
            return null;
        }
    }
}
