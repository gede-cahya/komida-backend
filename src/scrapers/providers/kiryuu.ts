import * as cheerio from 'cheerio';
import { MangaSource, type ScrapedManga, type ScraperProvider, type MangaDetail, type MangaChapter, type ChapterData } from '../types';

export class KiryuuScraper implements ScraperProvider {
    name = MangaSource.KIRYUU;
    private readonly baseUrl = 'https://kiryuu03.com/';

    async scrapePopular(): Promise<ScrapedManga[]> {
        try {
            console.log(`Scraping ${this.name}...`);
            const response = await fetch(this.baseUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch ${this.baseUrl}: ${response.status} ${response.statusText}`);
            }
            const html = await response.text();
            // console.log(`Fetched ${html.length} bytes from ${this.name}`);
            // await Bun.write('debug_kiryuu.html', html); // debugging
            // console.log(`[Kiryuu Debug] HTML length: ${html.length}`);
            const $ = cheerio.load(html);
            // console.log(`[Kiryuu Debug] Page Title: ${$('title').text().trim()}`);

            // Debug selectors
            // console.log(`[Kiryuu Debug] .utao count: ${$('.utao').length}`);
            // console.log(`[Kiryuu Debug] .uta count: ${$('.uta').length}`);

            const mangaList: ScrapedManga[] = [];

            // Selectors based on inspection:
            // Container: .utao .uta
            // Image: .imgu img (src)
            // Title: .luf h3 a (text)
            // Latest Chapter: .luf ul li:nth-child(1) a (text)
            // Selectors based on debug HTML (Tailwind structure):
            // Container: div#latest-list.grid > div (direct children) to avoid duplicate ID issues
            $('div#latest-list.grid > div').each((_, element) => {
                const titleElement = $(element).find('h1');
                const linkElement = $(element).find('a').first(); // First a tag usually wraps image
                const imgElement = $(element).find('img.wp-post-image');
                const chapters = $(element).find('a.link-self');

                const title = titleElement.text().trim();
                const link = linkElement.attr('href') || '';
                const image = imgElement.attr('src') || '';

                const chapter = chapters.first().find('p').text().trim() || chapters.first().text().trim();
                const previous_chapter = chapters.eq(1).find('p').text().trim() || chapters.eq(1).text().trim();

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
            // DEBUG: Dump HTML if title missing
            if (html.length < 2000) console.log(`[Kiryuu] Short HTML (${html.length} chars)`);
            const $ = cheerio.load(html);

            const title = $('h1').first().text().trim();
            const image = $('.thumb img').attr('src') || $('.wp-post-image').attr('src') || $('img[itemprop="image"]').attr('src') || '';

            const synopsis = $('.entry-content p').map((_, el) => $(el).text().trim()).get().join('\n\n')
                || $('.entry-content').text().trim()
                || $('.seriestucon').text().trim();

            const genres = $('.gnr a, .mgen a, .seriestugenre a').map((_, el) => $(el).text().trim()).get();
            const status = $('.tsinfo .imptdt:contains("Status") i').text().trim() || 'Unknown';
            const author = $('.tsinfo .imptdt:contains("Author") i').text().trim() || 'Unknown';
            const rating = parseFloat($('.num').text().trim()) || 0;

            const chapters: MangaChapter[] = [];

            // Check for AJAX chapter list (Kiryuu specific)
            const ajaxChapterContainer = $('div[hx-trigger="getChapterList"]');
            if (ajaxChapterContainer.length > 0) {
                let ajaxUrl = ajaxChapterContainer.attr('hx-get');
                if (ajaxUrl) {
                    ajaxUrl = ajaxUrl.replace(/&#038;/g, '&');
                    try {
                        console.log(`[Kiryuu] Fetching chapter list from AJAX: ${ajaxUrl}`);
                        const ajaxResponse = await fetch(ajaxUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            }
                        });
                        const ajaxHtml = await ajaxResponse.text();
                        const ajax$ = cheerio.load(ajaxHtml);

                        ajax$('div[data-chapter-number]').each((_, element) => {
                            const linkEl = ajax$(element).find('a').first();
                            const chapTitle = linkEl.find('.flex.flex-row.gap-1 span').text().trim() || linkEl.text().trim();
                            const chapLink = linkEl.attr('href');
                            // Extract time/released date if available in AJAX
                            const timeEl = linkEl.find('time');
                            const released = timeEl.attr('datetime') || timeEl.text().trim();

                            if (chapLink) {
                                // Ensure absolute URL
                                const fullLink = chapLink.startsWith('http') ? chapLink : new URL(chapLink, this.baseUrl).toString();
                                chapters.push({
                                    title: chapTitle,
                                    link: fullLink,
                                    released
                                });
                            }
                        });
                    } catch (error) {
                        console.error(`[Kiryuu] Failed to fetch chapters from AJAX:`, error);
                    }
                }
            }

            // Standard parsing if no AJAX chapters found
            if (chapters.length === 0) {
                $('#chapterlist ul li, .eplister li, .rclist > li, #cl ul li').each((_, element) => {
                    const linkEl = $(element).find('a');
                    const chapTitle = linkEl.find('.chapternum').text().trim() || linkEl.text().trim();
                    const chapLink = linkEl.attr('href') || '';
                    const released = $(element).find('.chapterdate').text().trim();

                    if (chapTitle && chapLink) {
                        chapters.push({
                            title: chapTitle,
                            link: chapLink,
                            released
                        });
                    }
                });
            }

            // Fallback for "Chapters" tab if list is just links in a div or hidden
            if (chapters.length === 0) {
                // Broadest search: look for ANY link with "chapter" in href
                // This catches scattered links in text, buttons, etc.
                $('a').each((_, element) => {
                    const chapLink = $(element).attr('href');
                    if (!chapLink || chapLink === '#') return;

                    // Must contain 'chapter' (case insensitive usually, but URL is lowercase)
                    // Must start with base URL to avoid external ads
                    // Must NOT be the current page link (sometimes breadcrumbs link back)
                    if (chapLink.includes('chapter') && chapLink.startsWith(this.baseUrl)) {

                        // Extract title
                        let chapTitle = $(element).find('.chapternum').text().trim();
                        if (!chapTitle) chapTitle = $(element).text().trim();

                        // If title is weird or empty, try to extract from URL
                        if (!chapTitle || chapTitle.length > 50) { // arbitrary length to avoid long text paragraphs
                            const match = chapLink.match(/chapter-([0-9.]+)/);
                            if (match) chapTitle = `Chapter ${match[1]}`;
                            else chapTitle = 'Chapter';
                        }

                        // Avoid adding duplicates
                        if (!chapters.some(c => c.link === chapLink)) {
                            chapters.push({
                                title: chapTitle,
                                link: chapLink
                            });
                        }
                    }
                });
            }

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
            // console.log(`[Kiryuu] HTML Length: ${html.length}`);
            const $ = cheerio.load(html);

            const images: string[] = [];
            $('#readerarea img').each((_, element) => {
                const dataSrc = $(element).attr('data-src');
                const src = $(element).attr('src');
                const validSrc = dataSrc || src;

                if (validSrc && !validSrc.startsWith('data:image')) {
                    images.push(validSrc.trim());
                }
            });

            if (images.length === 0) {
                // Try alternative selector for some MangaStream themes
                $('.reading-content img').each((_, element) => {
                    const src = $(element).attr('src') || $(element).attr('data-src');
                    if (src) images.push(src.trim());
                });
            }

            // Fallback: Check for section[data-image-data] (New Kiryuu Theme)
            if (images.length === 0) {
                $('section[data-image-data] img').each((_, element) => {
                    const src = $(element).attr('src') || $(element).attr('data-src');
                    if (src && !src.startsWith('data:image')) {
                        images.push(src.trim());
                    }
                });
            }

            // Fallback: Check for ts_reader script (Kiryuu/MangaStream often use this)
            if (images.length === 0) {
                const scriptContent = $('script:contains("ts_reader")').html();
                if (scriptContent) {
                    const match = scriptContent.match(/ts_reader\.run\((.*?)\);/);
                    if (match && match[1]) {
                        try {
                            const data = JSON.parse(match[1]);
                            if (data.sources && data.sources.length > 0 && data.sources[0].images) {
                                images.push(...data.sources[0].images);
                            }
                        } catch (e) {
                            console.error('Failed to parse ts_reader JSON', e);
                        }
                    }
                }
            }

            // Navigation
            // Navigation - Support new theme aria-label selectors
            let next = $('.nextprev a.next_ch, a[rel="next"], a[aria-label="Next"]').attr('href');
            let prev = $('.nextprev a.prev_ch, a[rel="prev"], a[aria-label="Prev"]').attr('href');

            // Clean up unavailable links
            if (next === '#' || next === '' || next === 'javascript:void(0)') next = undefined;
            if (prev === '#' || prev === '' || prev === 'javascript:void(0)') prev = undefined;

            return { images, next, prev };
        } catch (error) {
            console.error(`Error scraping chapter from ${this.name}:`, error);
            return null;
        }
    }
}
