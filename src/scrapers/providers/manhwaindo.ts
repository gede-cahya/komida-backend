import * as cheerio from 'cheerio';
import { MangaSource, type ScrapedManga, type ScraperProvider, type MangaDetail, type MangaChapter, type ChapterData } from '../types';

export class ManhwaIndoScraper implements ScraperProvider {
    name = MangaSource.MANHWAINDO;
    private readonly baseUrl = 'https://www.manhwaindo.my/';

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
                const image = imgElement.attr('src') || '';
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
                const chapTitle = linkEl.find('.chapter-name').text().trim() || linkEl.text().trim();
                const chapLink = linkEl.attr('href') || '';
                const released = $(element).find('.chapter-date').text().trim();

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

            // Navigation - Filter out placeholders
            let next = $('.ch-next-btn').attr('href');
            let prev = $('.ch-prev-btn').attr('href');

            if (next && !next.startsWith('http')) next = undefined;
            if (prev && !prev.startsWith('http')) prev = undefined;

            // Fallback: Try to find any link with "Next" or "Prev" text if class fails
            if (!next) next = $('a:contains("Next")').attr('href');
            if (next && !next.startsWith('http')) next = undefined;

            if (!prev) prev = $('a:contains("Prev")').attr('href');
            if (prev && !prev.startsWith('http')) prev = undefined;

            return { images, next, prev };
        } catch (error) {
            console.error(`Error scraping chapter from ${this.name}:`, error);
            return null;
        }
    }
}
