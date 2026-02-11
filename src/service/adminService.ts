import { db } from '../db';
import { manga as mangaTable, users as usersTable } from '../db/schema';
import { eq, like, desc, count } from 'drizzle-orm';
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

    async updateUser(id: number, data: { username?: string, role?: string, password?: string }) {
        const updateData: any = {};

        if (data.username) updateData.username = data.username;
        if (data.role) updateData.role = data.role;
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

    async deleteUser(id: number) {
        await db.delete(usersTable).where(eq(usersTable.id, id));
    }

    // --- Manga Management ---

    async getAllManga(page: number = 1, limit: number = 20, search: string = '') {
        const offset = (page - 1) * limit;

        const whereClause = search ? like(mangaTable.title, `%${search}%`) : undefined;

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
}

export const adminService = new AdminService();
