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
        let timeInterval = "'-1 day'";
        if (period === 'week') timeInterval = "'-7 days'";
        if (period === 'month') timeInterval = "'-30 days'";

        const timeFilter = isPostgres
            ? sql`NOW() - INTERVAL ${period === 'day' ? '1 day' : period === 'week' ? '7 days' : '30 days'}`
            : sql`datetime('now', ${timeInterval})`;

        try {
            const results = await db.select({
                slug: mangaViews.manga_slug,
                title: mangaTable.title,
                image: mangaTable.image,
                source: mangaTable.source,
                views: count(mangaViews.id)
            })
                .from(mangaViews)
                .innerJoin(mangaTable, sql`${mangaTable.link} LIKE '%' || ${mangaViews.manga_slug} || '%'`)
                .where(gt(mangaViews.viewed_at, timeFilter))
                .groupBy(mangaViews.manga_slug, mangaTable.title, mangaTable.image, mangaTable.source)
                .orderBy(desc(count(mangaViews.id)))
                .limit(10);

            return results;
        } catch (error) {
            console.error('Error getting top manga:', error);
            return [];
        }
    }

    async getSiteVisits(period: 'day' | 'week' | 'month' = 'day') {
        const isPostgres = process.env.DATABASE_URL !== undefined;
        let timeInterval = "'-1 day'";
        let groupFormatSqlite = "'%H:00'";
        let groupFormatPg = 'HH24:00';

        if (period === 'week' || period === 'month') {
            timeInterval = period === 'week' ? "'-7 days'" : "'-30 days'";
            groupFormatSqlite = "'%Y-%m-%d'";
            groupFormatPg = 'YYYY-MM-DD';
        }

        const timeFilter = isPostgres
            ? sql`NOW() - INTERVAL ${period === 'day' ? '1 day' : period === 'week' ? '7 days' : '30 days'}`
            : sql`datetime('now', ${timeInterval})`;

        const dateGroup = isPostgres
            ? sql`to_char(${siteVisits.visited_at}, ${groupFormatPg})`
            : sql`strftime(${sql.raw(groupFormatSqlite)}, ${siteVisits.visited_at})`;

        try {
            const results = await db.select({
                date: dateGroup,
                visits: count(siteVisits.id)
            })
                .from(siteVisits)
                .where(gt(siteVisits.visited_at, timeFilter))
                .groupBy(dateGroup)
                .orderBy(sql`date ASC`);

            return results;
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
