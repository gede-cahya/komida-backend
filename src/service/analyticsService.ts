
import { db } from '../db';

export class AnalyticsService {
    trackMangaView(slug: string) {
        try {
            const query = db.prepare('INSERT INTO manga_views (manga_slug) VALUES (?)');
            query.run(slug);
        } catch (error) {
            console.error('Error tracking manga view:', error);
        }
    }

    trackSiteVisit(ipHash: string, userAgent: string) {
        try {
            // Debounce logic: Check if IP visited in last 30 mins
            const check = db.prepare(`
                SELECT id FROM site_visits 
                WHERE ip_hash = ? AND visited_at > datetime('now', '-30 minutes')
            `).get(ipHash);

            if (!check) {
                const query = db.prepare('INSERT INTO site_visits (ip_hash, user_agent) VALUES (?, ?)');
                query.run(ipHash, userAgent);
            }
        } catch (error) {
            console.error('Error tracking site visit:', error);
        }
    }

    getTopManga(period: 'day' | 'week' | 'month' = 'day') {
        let timeFilter = "'-1 day'";
        if (period === 'week') timeFilter = "'-7 days'";
        if (period === 'month') timeFilter = "'-30 days'";

        const sql = `
            SELECT 
                mv.manga_slug as slug, 
                m.title, 
                m.image,
                m.source,
                COUNT(mv.id) as views 
            FROM manga_views mv
            LEFT JOIN manga m ON m.link LIKE '%' || mv.manga_slug || '%' 
            WHERE mv.viewed_at > datetime('now', ${timeFilter})
            GROUP BY mv.manga_slug
            ORDER BY views DESC
            LIMIT 10
        `;

        // Note: The JOIN ON m.link LIKE slug is a heuristic because we store slugs in views but links in manga table.
        // ideally we should store manga_id if possible, but slug is more robust across sources if they share titles.
        // For now, let's assume slug matches part of the link.

        try {
            return db.prepare(sql).all();
        } catch (error) {
            console.error('Error getting top manga:', error);
            return [];
        }
    }

    getSiteVisits(period: 'day' | 'week' | 'month' = 'day') {
        let timeFilter = "'-1 day'";
        let groupFormat = "'%H:00'"; // Hour by default for day

        if (period === 'week') {
            timeFilter = "'-7 days'";
            groupFormat = "'%Y-%m-%d'"; // Day for week
        }
        if (period === 'month') {
            timeFilter = "'-30 days'";
            groupFormat = "'%Y-%m-%d'";
        }

        const sql = `
            SELECT 
                strftime(${groupFormat}, visited_at) as date,
                COUNT(id) as visits
            FROM site_visits
            WHERE visited_at > datetime('now', ${timeFilter})
            GROUP BY date
            ORDER BY date ASC
        `;

        try {
            const results = db.prepare(sql).all();
            return results;
        } catch (error) {
            console.error('Error getting site visits:', error);
            return [];
        }
    }

    getSummary() {
        try {
            const totalManga = db.prepare('SELECT COUNT(*) as count FROM manga').get() as { count: number };
            const totalViews = db.prepare('SELECT COUNT(*) as count FROM manga_views').get() as { count: number };
            const totalVisits = db.prepare('SELECT COUNT(*) as count FROM site_visits').get() as { count: number };
            const todayVisits = db.prepare("SELECT COUNT(*) as count FROM site_visits WHERE visited_at > datetime('now', 'start of day')").get() as { count: number };

            return {
                totalManga: totalManga.count,
                totalViews: totalViews.count,
                totalVisits: totalVisits.count,
                todayVisits: todayVisits.count
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
