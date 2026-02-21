import { db } from '../db';
import { manga as mangaTable, users as usersTable, comments as commentsTable, decorations as decorationsTable, badges as badgesTable } from '../db/schema';
import { eq, like, desc, count, and } from 'drizzle-orm';
import { mangaService } from './mangaService';

export class AdminService {

    // --- User Management ---

    async getAllUsers(page: number = 1, limit: number = 20, search: string = '') {
        const offset = (page - 1) * limit;

        const whereClause = search ? like(usersTable.username, `%${search}%`) : undefined;

        const users = await db.select({
            id: usersTable.id,
            username: usersTable.username,
            role: usersTable.role,
            is_banned: usersTable.is_banned,
            created_at: usersTable.created_at
        })
            .from(usersTable)
            .where(whereClause)
            .orderBy(desc(usersTable.created_at))
            .limit(limit)
            .offset(offset);

        const [totalResult] = await db.select({ total: count() })
            .from(usersTable)
            .where(whereClause);

        const total = Number(totalResult.total);

        return {
            users,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    async updateUser(id: number, data: { username?: string, role?: string, password?: string, is_banned?: boolean }) {
        const updateData: any = {};

        if (data.username) updateData.username = data.username;
        if (data.role) updateData.role = data.role;
        if (data.is_banned !== undefined) updateData.is_banned = data.is_banned;
        if (data.password) {
            updateData.password = await Bun.password.hash(data.password);
        }

        if (Object.keys(updateData).length === 0) return null;

        const results = await db.update(usersTable)
            .set(updateData)
            .where(eq(usersTable.id, id))
            .returning({
                id: usersTable.id,
                username: usersTable.username,
                role: usersTable.role,
                created_at: usersTable.created_at
            });

        return results[0];
    }

    async getTopActiveUsersToday(limit: number = 10) {
        const today = new Date().toISOString().split('T')[0];
        const { dailyUserActivity } = await import('../db/schema');

        const activeUsers = await db.select({
            id: usersTable.id,
            username: usersTable.username,
            display_name: usersTable.display_name,
            avatar_url: usersTable.avatar_url,
            xp: usersTable.xp,
            xp_gained: dailyUserActivity.xp_gained,
            actions_count: dailyUserActivity.actions_count
        })
            .from(dailyUserActivity)
            .innerJoin(usersTable, eq(dailyUserActivity.user_id, usersTable.id))
            .where(eq(dailyUserActivity.date, today))
            .orderBy(desc(dailyUserActivity.xp_gained))
            .limit(limit);

        return activeUsers;
    }

    async deleteUser(id: number) {
        await db.delete(usersTable).where(eq(usersTable.id, id));
    }

    // --- Manga Management ---

    async getAllManga(page: number = 1, limit: number = 20, search: string = '', source: string = '') {
        const offset = (page - 1) * limit;

        let whereClause;
        if (search && source) {
            whereClause = and(like(mangaTable.title, `%${search}%`), eq(mangaTable.source, source));
        } else if (search) {
            whereClause = like(mangaTable.title, `%${search}%`);
        } else if (source) {
            whereClause = eq(mangaTable.source, source);
        }

        const manga = await db.select({
            id: mangaTable.id,
            title: mangaTable.title,
            image: mangaTable.image,
            source: mangaTable.source,
            chapter: mangaTable.chapter,
            is_trending: mangaTable.is_trending,
            last_updated: mangaTable.last_updated
        })
            .from(mangaTable)
            .where(whereClause)
            .orderBy(desc(mangaTable.last_updated))
            .limit(limit)
            .offset(offset);

        const [totalResult] = await db.select({ total: count() })
            .from(mangaTable)
            .where(whereClause);

        const total = Number(totalResult.total);

        return {
            manga,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    async deleteManga(id: number) {
        await db.delete(mangaTable).where(eq(mangaTable.id, id));
    }

    async searchExternalManga(query: string, source?: string) {
        return mangaService.searchExternal(query, source);
    }

    async importManga(source: string, link: string) {
        return mangaService.importManga(source, link);
    }

    async updateAllManga() {
        // Run in background, don't await
        mangaService.updateAllManga().catch(e => console.error('[UpdateAll] Background task error:', e));
        return { message: 'Update started in background' };
    }

    async getMangaDetail(id: number) {
        const result = await db.select().from(mangaTable).where(eq(mangaTable.id, id));
        return result[0];
    }

    async updateManga(id: number, data: any) {
        // Prevent ID update
        delete data.id;
        const result = await db.update(mangaTable)
            .set(data)
            .where(eq(mangaTable.id, id))
            .returning();
        return result[0];
    }

    async deleteChapter(id: number, chapterSlug: string) {
        const manga = await this.getMangaDetail(id);
        if (!manga || !manga.chapters) return null;

        let chapters: any[] = [];
        try {
            chapters = JSON.parse(manga.chapters);
        } catch (e) {
            console.error('Failed to parse chapters JSON', e);
            return null;
        }

        const initialLength = chapters.length;
        chapters = chapters.filter((c: any) => c.slug !== chapterSlug);

        if (chapters.length === initialLength) return null; // Chapter not found

        await db.update(mangaTable)
            .set({ chapters: JSON.stringify(chapters) })
            .where(eq(mangaTable.id, id));

        return chapters;
    }

    // --- Comment Management ---

    async getAllComments(page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;

        const comments = await db.select({
            id: commentsTable.id,
            user_id: commentsTable.user_id,
            slug: commentsTable.slug,
            chapter_slug: commentsTable.chapter_slug,
            content: commentsTable.content,
            is_spoiler: commentsTable.is_spoiler,
            media_url: commentsTable.media_url,
            created_at: commentsTable.created_at,
            username: usersTable.username,
            avatar_url: usersTable.avatar_url
        })
            .from(commentsTable)
            .leftJoin(usersTable, eq(commentsTable.user_id, usersTable.id))
            .orderBy(desc(commentsTable.created_at))
            .limit(limit)
            .offset(offset);

        const [totalResult] = await db.select({ total: count() }).from(commentsTable);
        const total = Number(totalResult.total);

        return {
            comments,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    async deleteComment(id: number) {
        await db.delete(commentsTable).where(eq(commentsTable.id, id));
    }

    // --- Decoration & Badge Management ---

    async createDecoration(data: any) {
        const results = await db.insert(decorationsTable).values(data).returning();
        return results[0];
    }

    async updateDecoration(id: number, data: any) {
        const results = await db.update(decorationsTable).set(data).where(eq(decorationsTable.id, id)).returning();
        return results[0];
    }

    async deleteDecoration(id: number) {
        await db.delete(decorationsTable).where(eq(decorationsTable.id, id));
    }

    async createBadge(data: any) {
        const results = await db.insert(badgesTable).values(data).returning();
        return results[0];
    }

    async updateBadge(id: number, data: any) {
        const results = await db.update(badgesTable).set(data).where(eq(badgesTable.id, id)).returning();
        return results[0];
    }

    async deleteBadge(id: number) {
        await db.delete(badgesTable).where(eq(badgesTable.id, id));
    }
}

export const adminService = new AdminService();
