
import * as cheerio from 'cheerio';
import { MangaSource, type ScrapedManga, type ScraperProvider, type MangaDetail, type MangaChapter, type ChapterData } from '../types';

export class KiryuuScraper implements ScraperProvider {
    name = MangaSource.KIRYUU;
    private readonly baseUrl = 'https://kiryuu.online/';

    // Reroute old database links to the current active domain
    private rerouteUrl(link: string): string {
        try {
            const url = new URL(link);
            const base = new URL(this.baseUrl);
            url.protocol = base.protocol;
            url.host = base.host;
            return url.toString();
        } catch (e) {
            return link;
        }
    }

    async scrapePopular(): Promise<ScrapedManga[]> {
        try {
            console.log(`Scraping ${this.name}...`);
            const response = await fetch(`${this.baseUrl}api/home`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.baseUrl
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch ${this.baseUrl}api/home: ${response.status} ${response.statusText}`);
            }
            const payload = await response.json() as any;
            const items = Array.isArray(payload?.data?.recents) ? payload.data.recents : [];

            const mangaList: ScrapedManga[] = [];

            for (const item of items) {
                const title = this.cleanDuplicatedTitle(item.title || '');
                const slug = item.slug || '';
                if (!title || !slug) continue;
                const link = new URL(`manga/${slug}`, this.baseUrl).toString();
                mangaList.push({
                    title,
                    image: item.coverImage || '',
                    source: this.name,
                    chapter: item.last_chapter || item.chapter || 'Read Now',
                    previous_chapter: '',
                    link,
                    rating: Number(item.rating || 0)
                });
            }

            console.log(`Found ${mangaList.length} manga from ${this.name}`);
            return mangaList;
        } catch (error) {
            console.error(`Error scraping ${this.name}:`, error);
            return [];
        }
    }

    async search(query: string): Promise<ScrapedManga[]> {
        try {
            console.log(`Searching ${this.name} via ${this.baseUrl} for "${query}"...`);
            const response = await fetch(`${this.baseUrl}api/home`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.baseUrl
                }
            });

            if (!response.ok) throw new Error(`Failed to fetch search API: ${response.status}`);

            const payload = await response.json() as any;
            const allItems = [
                ...(payload?.data?.recents || []),
                ...(payload?.data?.trending || []),
                ...(payload?.data?.manhwas || []),
                ...(payload?.data?.mangas || []),
                ...(payload?.data?.manhuas || []),
            ];
            const q = query.toLowerCase();
            const seen = new Set<string>();
            const mangaList: ScrapedManga[] = allItems
                .filter((item: any) => (item.title || '').toLowerCase().includes(q) || (item.slug || '').toLowerCase().includes(q))
                .filter((item: any) => {
                    if (!item.slug || seen.has(item.slug)) return false;
                    seen.add(item.slug);
                    return true;
                })
                .map((item: any) => ({
                    title: this.cleanDuplicatedTitle(item.title || 'Unknown Title'),
                    image: item.coverImage || '',
                    source: this.name,
                    chapter: item.last_chapter || 'Read Now',
                    rating: Number(item.rating || 0),
                    link: new URL(`manga/${item.slug}`, this.baseUrl).toString()
                }));
            console.log(`Found ${mangaList.length} results from ${this.name}`);
            return mangaList;
        } catch (error) {
            console.error(`Error searching ${this.name}:`, error);
            return [];
        }
    }

    async scrapeDetail(link: string): Promise<MangaDetail | null> {
        link = this.rerouteUrl(link);
        try {
            const slug = this.extractMangaSlug(link);
            const apiUrl = `${this.baseUrl}api/manga/${encodeURIComponent(slug)}`;
            console.log(`Scraping detail ${apiUrl}...`);
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.baseUrl
                }
            });
            if (!response.ok) {
                console.error(`Failed to fetch detail: ${response.status}`);
                return null;
            }

            const payload = await response.json() as any;
            if (!payload?.success || !payload?.data?.info) return null;
            const info = payload.data.info;
            const chapters: MangaChapter[] = Array.isArray(info.chapters) ? info.chapters.map((chapter: any) => ({
                title: chapter.title || 'Chapter',
                link: new URL(`read/${info.slug}/${chapter.slug}`, this.baseUrl).toString(),
                released: chapter.released || chapter.updatedAt || undefined
            })) : [];

            return {
                title: this.cleanDuplicatedTitle(info.title || slug),
                image: info.coverImage || '',
                synopsis: info.synopsis || '',
                genres: Array.isArray(info.genres) ? info.genres : [],
                author: info.author || 'Unknown',
                status: info.status || 'Ongoing',
                rating: Number(info.rating || 0),
                chapters
            };

        } catch (error) {
            console.error(`Error scraping detail from ${this.name}:`, error);
            return null;
        }
    }

    async scrapeChapter(link: string): Promise<ChapterData | null> {
        link = this.rerouteUrl(link);
        try {
            console.log(`Scraping chapter ${link}...`);

            const images: string[] = [];
            let next: string | undefined;
            let prev: string | undefined;

            const { mangaSlug, chapterSlug } = this.extractReadSlugs(link);
            const apiUrl = `${this.baseUrl}api/read/${encodeURIComponent(mangaSlug)}/${encodeURIComponent(chapterSlug)}`;
            console.log(`[Kiryuu] Fetching reader API: ${apiUrl}`);

            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': new URL(`read/${mangaSlug}/${chapterSlug}`, this.baseUrl).toString()
                }
            });
            if (!response.ok) {
                console.error(`Failed to fetch chapter API: ${response.status}`);
                return null;
            }
            const payload = await response.json() as any;
            if (!payload?.success || !payload?.data?.chapter) return null;
            const chapter = payload.data.chapter;
            if (Array.isArray(chapter.images)) {
                images.push(...chapter.images.filter((src: string) => src && !src.startsWith('data:image')));
            }

            const chapters = payload.data.manga?.chapters || [];
            const currentIndex = chapters.findIndex((ch: any) => ch.slug === chapterSlug);
            if (currentIndex > 0) {
                next = new URL(`read/${mangaSlug}/${chapters[currentIndex - 1].slug}`, this.baseUrl).toString();
            }
            if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
                prev = new URL(`read/${mangaSlug}/${chapters[currentIndex + 1].slug}`, this.baseUrl).toString();
            }

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

    private genreMapCache: Record<string, number> = {};

    private async getGenreId(slug: string): Promise<number | null> {
        if (this.genreMapCache[slug]) {
            return this.genreMapCache[slug];
        }

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
                const id = data[0].id;
                this.genreMapCache[slug] = id;
                return id;
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

    private cleanDuplicatedTitle(title: string): string {
        const clean = this.decodeHtmlEntities(String(title || '').trim());
        const half = clean.length / 2;
        if (clean.length % 2 === 0 && clean.slice(0, half).toLowerCase() === clean.slice(half).toLowerCase()) {
            return clean.slice(0, half).trim();
        }
        return clean;
    }

    private extractMangaSlug(link: string): string {
        try {
            const parsed = new URL(link, this.baseUrl);
            const parts = parsed.pathname.split('/').filter(Boolean);
            const mangaIndex = parts.indexOf('manga');
            if (mangaIndex >= 0 && parts[mangaIndex + 1]) return parts[mangaIndex + 1];
            return parts[0] || link;
        } catch {
            return link.split('/').filter(Boolean).pop() || link;
        }
    }

    private extractReadSlugs(link: string): { mangaSlug: string; chapterSlug: string } {
        const parsed = new URL(link, this.baseUrl);
        const parts = parsed.pathname.split('/').filter(Boolean);
        const readIndex = parts.indexOf('read');
        if (readIndex >= 0 && parts[readIndex + 1] && parts[readIndex + 2]) {
            return { mangaSlug: parts[readIndex + 1], chapterSlug: parts[readIndex + 2] };
        }
        return {
            mangaSlug: parts.length >= 2 ? parts[parts.length - 2] : '',
            chapterSlug: parts[parts.length - 1] || ''
        };
    }
}
