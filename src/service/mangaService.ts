import { db } from '../db';
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
            new ShinigamiBrowserScraper(),
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
        const limit = 24; // Limit total items to keep it clean, or keep all.
        const freshData = await this.scrapeAll();

        if (freshData.length === 0) {
            console.log('No manga found, skipping update.');
            return;
        }

        const insert = db.prepare(`
      INSERT INTO manga (title, image, chapter, previous_chapter, link, source, is_trending, last_updated)
      VALUES ($title, $image, $chapter, $previous_chapter, $link, $source, 1, CURRENT_TIMESTAMP)
    `);

        const checkExists = db.prepare(`SELECT id FROM manga WHERE title = $title AND source = $source`);
        const update = db.prepare(`
      UPDATE manga 
      SET image = $image, chapter = $chapter, previous_chapter = $previous_chapter, link = $link, last_updated = CURRENT_TIMESTAMP, is_trending = 1
      WHERE id = $id
    `);

        db.transaction(() => {
            // Optional: Clear old trending flags first if you want a fresh list every time
            // db.run("UPDATE manga SET is_trending = 0"); 

            for (const manga of freshData) {
                const existing = checkExists.get({ $title: manga.title, $source: manga.source }) as { id: number } | undefined;

                if (existing) {
                    update.run({
                        $id: existing.id,
                        $image: manga.image,
                        $chapter: manga.chapter,
                        $previous_chapter: manga.previous_chapter || null,
                        $link: manga.link,
                    });
                } else {
                    insert.run({
                        $title: manga.title,
                        $image: manga.image,
                        $chapter: manga.chapter,
                        $previous_chapter: manga.previous_chapter || null,
                        $link: manga.link,
                        $source: manga.source,
                    });
                }
            }
        })();

        console.log(`Updated cache with ${freshData.length} manga.`);
    }

    getPopularManga(page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;
        return db.query(`
      SELECT * FROM manga 
      WHERE is_trending = 1 
      ORDER BY last_updated DESC
      LIMIT $limit OFFSET $offset
    `).all({ $limit: limit, $offset: offset });
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
        // Search in local DB
        const results = db.query('SELECT * FROM manga WHERE title LIKE ?').all(`%${query}%`) as any[];
        return results.map(row => ({
            ...row,
            genres: JSON.parse(row.genres || '[]'),
            chapters: JSON.parse(row.chapters || '[]')
        }));
    }

    async getMangaBySlug(slug: string) {
        // Convert slug to potential title search (simple un-slugify)
        // e.g. "virus-girlfriend" -> "%Virus%Girlfriend%"
        const titlePart = slug.split('-').join('%');

        let rows = db.query(`
            SELECT * FROM manga 
            WHERE title LIKE $title OR link LIKE $slug
        `).all({
            $title: `%${titlePart}%`,
            $slug: `%${slug}%`
        }) as any[];

        // Fallback: If not found in DB, try to scrape directly from Kiryuu (primary source)
        if (rows.length === 0) {
            console.log(`[LazyLoad] Manga not found in DB for slug: ${slug}. Attempting direct scrape...`);
            // Guess the URL based on slug
            const guessedLink = `https://kiryuu03.com/manga/${slug}/`;
            const scraper = this.scrapers.find(s => s.name === 'Kiryuu');

            if (scraper) {
                const detail = await scraper.scrapeDetail(guessedLink);
                if (detail) {
                    // Save to DB so it can be found next time
                    db.prepare(`
                        INSERT INTO manga (title, image, chapter, previous_chapter, link, source, is_trending, last_updated, genres, synopsis, rating, status, author, chapters)
                        VALUES ($title, $image, $chapter, $previous_chapter, $link, $source, 0, CURRENT_TIMESTAMP, $genres, $synopsis, $rating, $status, $author, $chapters)
                    `).run({
                        $title: detail.title,
                        $image: detail.image,
                        $chapter: detail.chapters[0]?.title || 'Unknown',
                        $previous_chapter: detail.chapters[1]?.title || null,
                        $link: guessedLink,
                        $source: 'Kiryuu',
                        $genres: JSON.stringify(detail.genres),
                        $synopsis: detail.synopsis,
                        $rating: detail.rating,
                        $status: detail.status,
                        $author: detail.author,
                        $chapters: JSON.stringify(detail.chapters)
                    } as any);

                    // Re-query to get the inserted row with ID
                    rows = db.query(`SELECT * FROM manga WHERE link = $link`).all({ $link: guessedLink }) as any[];
                }
            }
        }

        if (rows.length === 0) return null;

        // scrape details for each source if chapters are missing
        const sources = await Promise.all(rows.map(async (row) => {
            let chapters = JSON.parse(row.chapters || '[]');
            // If no chapters cached, try to scrape specific detail
            if (chapters.length === 0) {
                const scraper = this.scrapers.find(s => s.name === row.source);
                if (scraper) {
                    console.log(`[LazyLoad] Scraping chapters for ${row.title} (${row.source})`);
                    const detailed = await scraper.scrapeDetail(row.link);
                    if (detailed && detailed.chapters) {
                        chapters = detailed.chapters;
                        // Update cache
                        db.query('UPDATE manga SET chapters = ? WHERE id = ?').run(JSON.stringify(chapters), row.id);
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

        // Aggregate
        const primary = rows[0]; // Take metadata from first match
        return {
            title: primary.title,
            image: primary.image, // Could verify which image is best
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
        // Prefer Kiryuu for genres validation/list
        const scraper = this.scrapers.find(s => s.name === 'Kiryuu');
        if (scraper && scraper.scrapeGenres) {
            return await scraper.scrapeGenres();
        }
        return [];
    }

    async getMangaByGenre(genre: string, page: number = 1) {
        // Use Kiryuu for genre filtering for now
        const scraper = this.scrapers.find(s => s.name === 'Kiryuu');
        if (scraper && scraper.scrapeByGenre) {
            return await scraper.scrapeByGenre(genre, page);
        }
        return [];
    }
}

export const mangaService = new MangaService();
