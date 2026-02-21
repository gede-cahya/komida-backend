import { db } from '../db';
import { manga as mangaTable, chapterCache } from '../db/schema';
import { eq, and, like, ilike, desc, sql } from 'drizzle-orm';
import { KiryuuScraper } from '../scrapers/providers/kiryuu';
import { ManhwaIndoScraper } from '../scrapers/providers/manhwaindo';

import { SoftkomikScraper } from '../scrapers/providers/softkomik';
import type { ScrapedManga, ScraperProvider } from '../scrapers/types';

export class MangaService {
    private scrapers: ScraperProvider[];

    constructor() {
        this.scrapers = [
            new KiryuuScraper(),
            new ManhwaIndoScraper(),

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

        const subquery = db.selectDistinctOn([mangaTable.title], {
            id: mangaTable.id,
            title: mangaTable.title,
            image: mangaTable.image,
            rating: mangaTable.rating,
            chapter: mangaTable.chapter,
            type: mangaTable.type,
            span: mangaTable.span,
            link: mangaTable.link,
            source: mangaTable.source,
            last_updated: mangaTable.last_updated
        })
            .from(mangaTable)
            .where(eq(mangaTable.is_trending, true))
            .orderBy(mangaTable.title, desc(mangaTable.last_updated))
            .as('sq');

        return await db.select()
            .from(subquery)
            .orderBy(desc(subquery.last_updated))
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
            .where(ilike(mangaTable.title, `%${query}%`));

        if (results.length > 0) {
            return results.map((row: any) => ({
                ...row,
                genres: JSON.parse(row.genres || '[]'),
                chapters: JSON.parse(row.chapters || '[]')
            }));
        }

        // Fallback: search external scrapers if local DB has no results
        const externalResults = await this.searchExternal(query);
        return externalResults.map((manga: any) => ({
            title: manga.title,
            image: manga.image,
            chapter: manga.chapter || '?',
            rating: manga.rating || 0,
            link: manga.link,
            source: manga.source,
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

        // Lazy-load genres if empty (similar to chapter lazy-loading)
        let genres = JSON.parse(primary.genres || '[]');
        if (genres.length === 0) {
            const scraper = this.scrapers.find(s => s.name === primary.source);
            if (scraper) {
                try {
                    console.log(`[LazyLoad] Scraping missing genres for ${primary.title} (${primary.source})`);
                    const detailed = await scraper.scrapeDetail(primary.link);
                    if (detailed && detailed.genres && detailed.genres.length > 0) {
                        genres = detailed.genres;
                        // Update all rows for this manga with genres
                        for (const row of rows) {
                            await db.update(mangaTable)
                                .set({
                                    genres: JSON.stringify(genres),
                                    synopsis: detailed.synopsis || row.synopsis,
                                    author: detailed.author || row.author,
                                    status: detailed.status || row.status,
                                })
                                .where(eq(mangaTable.id, row.id));
                        }
                        console.log(`[LazyLoad] Updated genres for ${primary.title}: ${genres.join(', ')}`);
                    }
                } catch (e) {
                    console.error(`[LazyLoad] Failed to scrape genres for ${primary.title}:`, e);
                }
            }
        }

        return {
            title: primary.title,
            image: primary.image,
            author: primary.author || 'Unknown',
            status: primary.status || 'Ongoing',
            genres: genres,
            synopsis: primary.synopsis || '',
            sources: sources
        };
    }

    async getChapterImages(source: string, link: string) {
        // 1. Check Cache
        const cached = await db.select()
            .from(chapterCache)
            .where(and(eq(chapterCache.source, source), eq(chapterCache.link, link)))
            .limit(1);

        if (cached.length > 0) {
            console.log(`[Cache] Hit for chapter: ${link}`);
            return {
                images: JSON.parse(cached[0].images),
                next: cached[0].next_slug || undefined,
                prev: cached[0].prev_slug || undefined
            };
        }

        // 2. Scrape if not in cache
        console.log(`[Cache] Miss for chapter: ${link}. Scraping...`);
        const scraper = this.scrapers.find(s => s.name === source);
        if (!scraper) {
            console.error(`Scraper not found for source: ${source}`);
            return null;
        }

        const data = await scraper.scrapeChapter(link);

        // 3. Save to Cache
        if (data && data.images && data.images.length > 0) {
            try {
                await db.insert(chapterCache).values({
                    source,
                    link,
                    images: JSON.stringify(data.images),
                    next_slug: data.next || null,
                    prev_slug: data.prev || null
                });
                console.log(`[Cache] Saved chapter: ${link}`);
            } catch (e) {
                console.error(`[Cache] Failed to save chapter: ${e}`);
            }
        }

        return data;
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
    async updateAllManga() {
        console.log('[UpdateAll] Starting update for all manga...');
        const allManga = await db.select().from(mangaTable);
        console.log(`[UpdateAll] Found ${allManga.length} manga to update.`);

        let updatedCount = 0;
        let failedCount = 0;

        // Process in chunks or sequentially to avoid overwhelming
        for (const manga of allManga) {
            try {
                // simple delay to be nice to target servers
                await new Promise(resolve => setTimeout(resolve, 2000));

                console.log(`[UpdateAll] Updating ${manga.title}...`);
                const scraper = this.scrapers.find(s => s.name === manga.source);
                if (!scraper) {
                    console.warn(`[UpdateAll] Scraper not found for ${manga.source}`);
                    failedCount++;
                    continue;
                }

                const detail = await scraper.scrapeDetail(manga.link);
                if (detail) {
                    await this.saveMangaToDb(detail, manga.source, manga.link);
                    updatedCount++;
                } else {
                    console.warn(`[UpdateAll] Failed to scrape detail for ${manga.title}`);
                    failedCount++;
                }
            } catch (e) {
                console.error(`[UpdateAll] Error updating ${manga.title}:`, e);
                failedCount++;
            }
        }

        console.log(`[UpdateAll] Completed. Updated: ${updatedCount}, Failed: ${failedCount}`);
        return { updated: updatedCount, failed: failedCount };
    }
}

export const mangaService = new MangaService();
