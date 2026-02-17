
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
            const $ = cheerio.load(html);

            // Fallback: Try to find ID from body class if URL didn't have it or API failed initially
            if (images.length === 0) {
                const bodyClass = $('body').attr('class') || '';
                const postidMatch = bodyClass.match(/postid-(\d+)/);
                if (postidMatch) {
                    const chapterId = postidMatch[1];
                    console.log(`[Kiryuu] Found ID from HTML: ${chapterId}. Trying API...`);
                    const apiUrl = `${this.baseUrl}wp-json/wp/v2/chapter/${chapterId}`;
                    
                    try {
                        const apiResponse = await fetch(apiUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            }
                        });

                        if (apiResponse.ok) {
                            const apiData = await apiResponse.json();
                            if (apiData.content?.rendered) {
                                const content$ = cheerio.load(apiData.content.rendered);
                                content$('img').each((_, element) => {
                                    const src = content$(element).attr('src');
                                    if (src && !src.startsWith('data:image')) {
                                        images.push(src.trim());
                                    }
                                });
                                console.log(`[Kiryuu] API via HTML ID returned ${images.length} images`);
                            }
                        }
                    } catch (apiErr) {
                        console.error(`[Kiryuu] API via HTML ID failed:`, apiErr);
                    }
                }
            }


            const mangaList: ScrapedManga[] = [];

            $('div#latest-list.grid > div').each((_, element) => {
                const titleElement = $(element).find('h1');
                const linkElement = $(element).find('a').first();
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

    async search(query: string): Promise<ScrapedManga[]> {
        try {
            console.log(`Searching ${this.name} via API for "${query}"...`);
            const url = `${this.baseUrl}wp-json/wp/v2/manga?search=${encodeURIComponent(query)}&_embed`;

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.baseUrl
                }
            });

            if (!response.ok) throw new Error(`Failed to fetch search API: ${response.status}`);

            const data = await response.json();
            if (!Array.isArray(data)) return [];

            const mangaList: ScrapedManga[] = data.map((item: any) => {
                let image = '';
                if (item._embedded && item._embedded['wp:featuredmedia'] && item._embedded['wp:featuredmedia'][0]) {
                    image = item._embedded['wp:featuredmedia'][0].source_url;
                }

                return {
                    title: this.decodeHtmlEntities(item.title?.rendered || 'Unknown Title'),
                    image,
                    source: this.name,
                    chapter: 'Read Now', // API doesn't provide chapter info easily
                    rating: 0,
                    link: item.link
                };
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
                $('a').each((_, element) => {
                    const chapLink = $(element).attr('href');
                    if (!chapLink || chapLink === '#') return;

                    if (chapLink.includes('chapter') && chapLink.startsWith(this.baseUrl)) {
                        let chapTitle = $(element).find('.chapternum').text().trim();
                        if (!chapTitle) chapTitle = $(element).text().trim();

                        if (!chapTitle || chapTitle.length > 50) {
                            const match = chapLink.match(/chapter-([0-9.]+)/);
                            if (match) chapTitle = `Chapter ${match[1]}`;
                            else chapTitle = 'Chapter';
                        }

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

            const images: string[] = [];
            let next: string | undefined;
            let prev: string | undefined;

            // Strategy 1: Use WP REST API (Kiryuu's new approach)
            // Extract chapter_id from URL pattern: chapter-XX.CHAPTER_ID/
            const chapterIdMatch = link.match(/\.(\d+)\/?$/);
            if (chapterIdMatch) {
                const chapterId = chapterIdMatch[1];
                const apiUrl = `${this.baseUrl}wp-json/wp/v2/chapter/${chapterId}`;
                console.log(`[Kiryuu] Trying WP REST API: ${apiUrl}`);

                try {
                    const apiResponse = await fetch(apiUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });

                    if (apiResponse.ok) {
                        const apiData = await apiResponse.json();
                        if (apiData.content?.rendered) {
                            const content$ = cheerio.load(apiData.content.rendered);
                            content$('img').each((_, element) => {
                                const src = content$(element).attr('src');
                                if (src && !src.startsWith('data:image')) {
                                    images.push(src.trim());
                                }
                            });
                            console.log(`[Kiryuu] WP REST API returned ${images.length} images`);
                        }
                    }
                } catch (apiErr) {
                    console.error(`[Kiryuu] WP REST API failed:`, apiErr);
                }
            }

            // Fetch the chapter page for nav links (prev/next) and fallback image extraction
            const response = await fetch(link, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                console.error(`Failed to fetch chapter page: ${response.status}`);
                // If we already got images from API, return them without nav
                if (images.length > 0) return { images, next, prev };
                return null;
            }
            const html = await response.text();
            const $ = cheerio.load(html);

            // Fallback image extraction from HTML if API didn't return images
            if (images.length === 0) {
                $('#readerarea img').each((_, element) => {
                    const dataSrc = $(element).attr('data-src');
                    const src = $(element).attr('src');
                    const validSrc = dataSrc || src;
                    if (validSrc && !validSrc.startsWith('data:image')) {
                        images.push(validSrc.trim());
                    }
                });
            }

            if (images.length === 0) {
                $('section[data-image-data] img').each((_, element) => {
                    const src = $(element).attr('src') || $(element).attr('data-src');
                    if (src && !src.startsWith('data:image')) {
                        images.push(src.trim());
                    }
                });
            }

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

            // Extract next/prev navigation
            next = $('a[aria-label="Next"]').attr('href') || $('.nextprev a.next_ch').attr('href') || $('a[rel="next"]').attr('href');
            prev = $('a[aria-label="Prev"]').attr('href') || $('.nextprev a.prev_ch').attr('href') || $('a[rel="prev"]').attr('href');

            if (next === '#' || next === '' || next === 'javascript:void(0)') next = undefined;
            if (prev === '#' || prev === '' || prev === 'javascript:void(0)') prev = undefined;

            return { images, next, prev };
        } catch (error) {
            console.error(`Error scraping chapter from ${this.name}:`, error);
            return null;
        }
    }

    async scrapeGenres(): Promise<{ name: string; slug: string }[]> {
        return [
            { name: "Action", slug: "action" },
            { name: "Adventure", slug: "adventure" },
            { name: "Comedy", slug: "comedy" },
            { name: "Crime", slug: "crime" },
            { name: "Drama", slug: "drama" },
            { name: "Fantasy", slug: "fantasy" },
            { name: "Harem", slug: "harem" },
            { name: "Historical", slug: "historical" },
            { name: "Horror", slug: "horror" },
            { name: "Isekai", slug: "isekai" },
            { name: "Josei", slug: "josei" },
            { name: "Magic", slug: "magic" },
            { name: "Martial Arts", slug: "martial-arts" },
            { name: "Mature", slug: "mature" },
            { name: "Mecha", slug: "mecha" },
            { name: "Mystery", slug: "mystery" },
            { name: "Psychological", slug: "psychological" },
            { name: "Romance", slug: "romance" },
            { name: "School Life", slug: "school-life" },
            { name: "Sci-Fi", slug: "sci-fi" },
            { name: "Seinen", slug: "seinen" },
            { name: "Shoujo", slug: "shoujo" },
            { name: "Shoujo Ai", slug: "shoujo-ai" },
            { name: "Shounen", slug: "shounen" },
            { name: "Shounen Ai", slug: "shounen-ai" },
            { name: "Slice of Life", slug: "slice-of-life" },
            { name: "Sports", slug: "sports" },
            { name: "Supernatural", slug: "supernatural" },
            { name: "Thriller", slug: "thriller" },
            { name: "Tragedy", slug: "tragedy" },
            { name: "Yaoi", slug: "yaoi" },
            { name: "Yuri", slug: "yuri" }
        ];
    }

    async scrapeByGenre(genre: string, page: number = 1): Promise<ScrapedManga[]> {
        try {
            const genreId = await this.getGenreId(genre);

            if (!genreId) {
                console.warn(`Genre ID not found for slug: ${genre}`);
                return [];
            }

            const url = `${this.baseUrl}wp-json/wp/v2/manga?genre=${genreId}&page=${page}&_embed`;
            console.log(`Fetching genre via API: ${url}`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.baseUrl
                }
            });

            if (!response.ok) {
                if (response.status === 400) {
                    return [];
                }
                throw new Error(`Failed to fetch genre API: ${response.statusText}`);
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                return [];
            }

            return data.map((item: any) => {
                const title = this.decodeHtmlEntities(item.title?.rendered || 'Unknown Title');
                const link = item.link;
                let image = '';

                if (item._embedded && item._embedded['wp:featuredmedia'] && item._embedded['wp:featuredmedia'][0]) {
                    image = item._embedded['wp:featuredmedia'][0].source_url;
                }

                return {
                    title,
                    image,
                    source: this.name,
                    chapter: 'Read Now',
                    previous_chapter: '',
                    link,
                    rating: 0
                };
            });

        } catch (error) {
            console.error(`Error scraping genre ${genre}:`, error);
            return [];
        }
    }

    private async getGenreId(slug: string): Promise<number | null> {
        try {
            const url = `${this.baseUrl}wp-json/wp/v2/genre?slug=${slug}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            if (!response.ok) return null;
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                return data[0].id;
            }
            return null;
        } catch (error) {
            console.error(`Error fetching genre ID for ${slug}:`, error);
            return null;
        }
    }

    private decodeHtmlEntities(text: string): string {
        return text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&rsquo;/g, "'");
    }
}
