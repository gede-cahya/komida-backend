import { db } from '../db';
import { manga as mangaTable } from '../db/schema';
import { eq, and, like, desc, sql } from 'drizzle-orm';
import { KiryuuScraper } from '../scrapers/providers/kiryuu';
import { ManhwaIndoScraper } from '../scrapers/providers/manhwaindo';
import { ShinigamiBrowserScraper } from '../scrapers/providers/shinigami-browser';
import { SoftkomikScraper } from '../scrapers/providers/softkomik';
import type { ScrapedManga, ScraperProvider } from '../scrapers/types';

export class MangaService {
    private scrapers: ScraperProvider[];

    constructor() {
        this.scrapers = [
            new KiryuuScraper(),
            new ManhwaIndoScraper(),
            // new ShinigamiBrowserScraper(),
            new SoftkomikScraper(),
        ];
    }

    async scrapeAll(): Promise<ScrapedManga[]> {
        const results = await Promise.allSettled(
            this.scrapers.map(scraper => scraper.scrapePopular())
        );

        const allManga: ScrapedManga[] = [];
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                allManga.push(...result.value);
            } else {
                console.error(`Failed to scrape ${this.scrapers[index].name}:`, result.reason);
            }
        });

        return allManga;
    }

    async updatePopularCache() {
        console.log('Starting popular manga update...');
        const freshData = await this.scrapeAll();

        if (freshData.length === 0) {
            console.log('No manga found, skipping update.');
            return;
        }

        await db.transaction(async (tx: any) => {
            for (const manga of freshData) {
                const existing = await tx.select()
                    .from(mangaTable)
                    .where(and(eq(mangaTable.title, manga.title), eq(mangaTable.source, manga.source)))
                    .limit(1);

                if (existing.length > 0) {
                    await tx.update(mangaTable)
                        .set({
                            image: manga.image,
                            chapter: manga.chapter,
                            previous_chapter: manga.previous_chapter || null,
                            link: manga.link,
                            last_updated: new Date(),
                            is_trending: true
                        })
                        .where(eq(mangaTable.id, existing[0].id));
                } else {
                    await tx.insert(mangaTable).values({
                        title: manga.title,
                        image: manga.image,
                        chapter: manga.chapter,
                        previous_chapter: manga.previous_chapter || null,
                        link: manga.link,
                        source: manga.source,
                        is_trending: true,
                        last_updated: new Date()
                    });
                }
            }
        });

        console.log(`Updated cache with ${freshData.length} manga.`);
    }

    async getPopularManga(page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;
        return await db.select()
            .from(mangaTable)
            .where(eq(mangaTable.is_trending, true))
            .orderBy(desc(mangaTable.last_updated))
            .limit(limit)
            .offset(offset);
    }

    async getMangaDetail(source: string, link: string) {
        const scraper = this.scrapers.find(s => s.name === source);
        if (!scraper) {
            console.error(`Scraper not found for source: ${source}`);
            return null;
        }
        return await scraper.scrapeDetail(link);
    }

    async searchManga(query: string) {
        const results = await db.select()
            .from(mangaTable)
            .where(like(mangaTable.title, `%${query}%`));

        return results.map((row: any) => ({
            ...row,
            genres: JSON.parse(row.genres || '[]'),
            chapters: JSON.parse(row.chapters || '[]')
        }));
    }

    async getMangaBySlug(slug: string) {
        const titlePart = slug.split('-').join('%');

        let rows = await db.select()
            .from(mangaTable)
            .where(sql`${mangaTable.title} LIKE ${`%${titlePart}%`} OR ${mangaTable.link} LIKE ${`%${slug}%`}`);

        if (rows.length === 0) {
            console.log(`[LazyLoad] Manga not found in DB for slug: ${slug}. Attempting direct scrape...`);
            const guessedLink = `https://kiryuu03.com/manga/${slug}/`;
            const scraper = this.scrapers.find(s => s.name === 'Kiryuu');

            if (scraper) {
                const detail = await scraper.scrapeDetail(guessedLink);
                if (detail) {
                    await this.saveMangaToDb(detail, 'Kiryuu', guessedLink);
                    rows = await db.select()
                        .from(mangaTable)
                        .where(eq(mangaTable.link, guessedLink));
                }
            }
        }

        if (rows.length === 0) return null;

        const sources = await Promise.all(rows.map(async (row) => {
            let chapters = JSON.parse(row.chapters || '[]');
            const looksCorrupted = chapters.length > 0 && chapters.some((ch: any) =>
                !ch.released ||
                ch.released === '' ||
                /\d{1,2}\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)/i.test(ch.title)
            );

            if (chapters.length === 0 || looksCorrupted) {
                const scraper = this.scrapers.find(s => s.name === row.source);
                if (scraper) {
                    console.log(`[LazyLoad] ${looksCorrupted ? 'Refreshing corrupted' : 'Scraping missing'} chapters for ${row.title} (${row.source})`);
                    const detailed = await scraper.scrapeDetail(row.link);
                    if (detailed && detailed.chapters) {
                        chapters = detailed.chapters;
                        await db.update(mangaTable)
                            .set({ chapters: JSON.stringify(chapters) })
                            .where(eq(mangaTable.id, row.id));
                    }
                }
            }

            return {
                name: row.source,
                link: row.link,
                rating: row.rating || 0,
                chapters: chapters,
                image: row.image
            };
        }));

        const primary = rows[0];
        return {
            title: primary.title,
            image: primary.image,
            author: primary.author || 'Unknown',
            status: primary.status || 'Ongoing',
            genres: JSON.parse(primary.genres || '[]'),
            synopsis: primary.synopsis || '',
            sources: sources
        };
    }

    async getChapterImages(source: string, link: string) {
        const scraper = this.scrapers.find(s => s.name === source);
        if (!scraper) {
            console.error(`Scraper not found for source: ${source}`);
            return null;
        }
        return await scraper.scrapeChapter(link);
    }

    async getGenres() {
        const scraper = this.scrapers.find(s => s.name === 'Kiryuu');
        if (scraper && scraper.scrapeGenres) {
            return await scraper.scrapeGenres();
        }
        return [];
    }

    async getMangaByGenre(genre: string, page: number = 1) {
        const scraper = this.scrapers.find(s => s.name === 'Kiryuu');
        if (scraper && scraper.scrapeByGenre) {
            return await scraper.scrapeByGenre(genre, page);
        }
        return [];
    }

    async searchExternal(query: string, source?: string): Promise<ScrapedManga[]> {
        const targets = source
            ? this.scrapers.filter(s => s.name === source)
            : this.scrapers;

        const results = await Promise.allSettled(
            targets.map(s => s.search ? s.search(query) : Promise.resolve([]))
        );

        const allManga: ScrapedManga[] = [];
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                allManga.push(...result.value);
            } else {
                console.error(`Search failed for ${targets[index].name}:`, result.reason);
            }
        });
        return allManga;
    }

    async importManga(source: string, link: string) {
        console.log(`[Import] Importing ${link} from ${source}...`);
        const scraper = this.scrapers.find(s => s.name === source);
        if (!scraper) throw new Error(`Scraper not found for source: ${source}`);

        const detail = await scraper.scrapeDetail(link);
        if (!detail) throw new Error(`Failed to scrape detail for ${link}`);

        await this.saveMangaToDb(detail, source, link);
        return detail;
    }

    private async saveMangaToDb(detail: any, source: string, link: string) {
        const existing = await db.select()
            .from(mangaTable)
            .where(and(eq(mangaTable.title, detail.title), eq(mangaTable.source, source)))
            .limit(1);

        if (existing.length > 0) {
            await db.update(mangaTable)
                .set({
                    image: detail.image,
                    chapter: detail.chapters[0]?.title || 'Unknown',
                    previous_chapter: detail.chapters[1]?.title || null,
                    link: link,
                    last_updated: new Date(),
                    genres: JSON.stringify(detail.genres),
                    synopsis: detail.synopsis,
                    rating: detail.rating,
                    status: detail.status,
                    author: detail.author,
                    chapters: JSON.stringify(detail.chapters)
                })
                .where(eq(mangaTable.id, existing[0].id));
            console.log(`[Import] Updated manga: ${detail.title}`);
        } else {
            await db.insert(mangaTable).values({
                title: detail.title,
                image: detail.image,
                chapter: detail.chapters[0]?.title || 'Unknown',
                previous_chapter: detail.chapters[1]?.title || null,
                link: link,
                source: source,
                is_trending: false,
                last_updated: new Date(),
                genres: JSON.stringify(detail.genres),
                synopsis: detail.synopsis,
                rating: detail.rating,
                status: detail.status,
                author: detail.author,
                chapters: JSON.stringify(detail.chapters)
            });
            console.log(`[Import] Inserted manga: ${detail.title}`);
        }
    }
}

export const mangaService = new MangaService();
