
import { db } from '../db';
import { manga as mangaTable, mangaViews, siteVisits } from '../db/schema';
import { eq, and, sql, count, desc, gt } from 'drizzle-orm';

export class AnalyticsService {
    async trackMangaView(slug: string) {
        try {
            await db.insert(mangaViews).values({ manga_slug: slug });
        } catch (error) {
            console.error('Error tracking manga view:', error);
        }
    }

    async trackSiteVisit(ipHash: string, userAgent: string) {
        try {
            const isPostgres = process.env.DATABASE_URL !== undefined;
            const timeFilter = isPostgres
                ? sql`NOW() - INTERVAL '30 minutes'`
                : sql`datetime('now', '-30 minutes')`;

            const check = await db.select({ id: siteVisits.id })
                .from(siteVisits)
                .where(and(
                    eq(siteVisits.ip_hash, ipHash),
                    gt(siteVisits.visited_at, timeFilter)
                ))
                .limit(1);

            if (check.length === 0) {
                await db.insert(siteVisits).values({ ip_hash: ipHash, user_agent: userAgent });
            }
        } catch (error) {
            console.error('Error tracking site visit:', error);
        }
    }

    async getTopManga(period: 'day' | 'week' | 'month' = 'day') {
        const isPostgres = process.env.DATABASE_URL !== undefined;
        let interval = '1 day';
        if (period === 'week') interval = '7 days';
        if (period === 'month') interval = '30 days';

        try {
            if (isPostgres) {
                const query = sql`
                    SELECT 
                        manga_slug as slug, 
                        COUNT(id) as views
                    FROM manga_views
                    WHERE viewed_at > NOW() - ${sql.raw(`INTERVAL '${interval}'`)}
                    GROUP BY manga_slug
                    ORDER BY views DESC
                    LIMIT 10
                `;
                const topSlugs = await db.execute(query);

                const results = [];
                for (const row of topSlugs) {
                    const rowSlug = row.slug as string;
                    const rowViews = Number(row.views);

                    const mangaList = await db.select({
                        title: mangaTable.title,
                        image: mangaTable.image,
                        source: mangaTable.source,
                        link: mangaTable.link
                    })
                        .from(mangaTable)
                        .where(sql`${mangaTable.link} LIKE '%' || ${rowSlug} || '%'`)
                        .limit(1);

                    if (mangaList.length > 0) {
                        results.push({
                            ...mangaList[0],
                            slug: rowSlug,
                            views: rowViews
                        });
                    } else {
                        results.push({
                            title: rowSlug,
                            image: '',
                            source: '',
                            slug: rowSlug,
                            views: rowViews
                        });
                    }
                }
                return results;
            } else {
                // SQLite Fallback
                const timeInterval = period === 'day' ? "'-1 day'" : period === 'week' ? "'-7 days'" : "'-30 days'";
                const timeFilter = sql`datetime('now', ${timeInterval})`;

                const topSlugs = await db.select({
                    slug: mangaViews.manga_slug,
                    views: count(mangaViews.id)
                })
                    .from(mangaViews)
                    .where(gt(mangaViews.viewed_at, timeFilter))
                    .groupBy(mangaViews.manga_slug)
                    .orderBy(desc(count(mangaViews.id)))
                    .limit(10);

                const results = [];
                for (const row of topSlugs) {
                    const rowSlug = row.slug as string;
                    const rowViews = Number(row.views);

                    const mangaList = await db.select({
                        title: mangaTable.title,
                        image: mangaTable.image,
                        source: mangaTable.source
                    })
                        .from(mangaTable)
                        .where(sql`${mangaTable.link} LIKE '%' || ${rowSlug} || '%'`)
                        .limit(1);

                    if (mangaList.length > 0) {
                        results.push({
                            ...mangaList[0],
                            slug: rowSlug,
                            views: rowViews
                        });
                    } else {
                        results.push({
                            title: rowSlug,
                            image: '',
                            source: '',
                            slug: rowSlug,
                            views: rowViews
                        });
                    }
                }
                return results;
            }
        } catch (error) {
            console.error('Error getting top manga:', error);
            return [];
        }
    }

    async getSiteVisits(period: 'day' | 'week' | 'month' = 'day') {
        const isPostgres = process.env.DATABASE_URL !== undefined;
        let interval = '1 day';
        let dateFormat = 'HH24:00';

        if (period === 'week') {
            interval = '7 days';
            dateFormat = 'YYYY-MM-DD';
        }
        if (period === 'month') {
            interval = '30 days';
            dateFormat = 'YYYY-MM-DD';
        }

        try {
            if (isPostgres) {
                // Use GROUP BY 1 to avoid "must appear in GROUP BY clause" errors with parameters
                const query = sql`
                    SELECT 
                        to_char(visited_at, ${sql.raw(`'${dateFormat}'`)}) as date, 
                        COUNT(id) as visits 
                    FROM site_visits 
                    WHERE visited_at > NOW() - ${sql.raw(`INTERVAL '${interval}'`)}
                    GROUP BY 1 
                    ORDER BY 1 ASC
                `;

                const results = await db.execute(query);
                return results.map((r: any) => ({
                    ...r,
                    visits: Number(r.visits)
                }));
            } else {
                // SQLite Fallback
                let time = "'-1 day'";
                if (period === 'week') time = "'-7 days'";
                if (period === 'month') time = "'-30 days'";

                let group = "'%H:00'";
                if (period !== 'day') group = "'%Y-%m-%d'";

                const results = await db.select({
                    date: sql`strftime(${sql.raw(group)}, ${siteVisits.visited_at})`,
                    visits: count(siteVisits.id)
                })
                    .from(siteVisits)
                    .where(gt(siteVisits.visited_at, sql`datetime('now', ${time})`))
                    .groupBy(sql`strftime(${sql.raw(group)}, ${siteVisits.visited_at})`)
                    .orderBy(sql`1 ASC`);

                return results.map((r: any) => ({ ...r, visits: Number(r.visits) }));
            }
        } catch (error) {
            console.error('Error getting site visits:', error);
            return [];
        }
    }

    async getSummary() {
        try {
            const isPostgres = process.env.DATABASE_URL !== undefined;
            const startOfDayFilter = isPostgres
                ? sql`CURRENT_DATE`
                : sql`datetime('now', 'start of day')`;

            const [mangaCount] = await db.select({ count: count() }).from(mangaTable);
            const [viewsCount] = await db.select({ count: count() }).from(mangaViews);
            const [visitsCount] = await db.select({ count: count() }).from(siteVisits);
            const [todayVisitsCount] = await db.select({ count: count() })
                .from(siteVisits)
                .where(gt(siteVisits.visited_at, startOfDayFilter));

            return {
                totalManga: mangaCount.count,
                totalViews: viewsCount.count,
                totalVisits: visitsCount.count,
                todayVisits: todayVisitsCount.count
            };
        } catch (error) {
            console.error('Error getting summary:', error);
            return {
                totalManga: 0,
                totalViews: 0,
                totalVisits: 0,
                todayVisits: 0
            };
        }
    }
}

export const analyticsService = new AnalyticsService();
