
import { db } from '../db';
import { mangaService } from './mangaService';

export class AdminService {

    // --- User Management ---

    async getAllUsers(page: number = 1, limit: number = 20, search: string = '') {
        const offset = (page - 1) * limit;

        let queryStr = 'SELECT id, username, role, created_at FROM users';
        let countQueryStr = 'SELECT COUNT(*) as total FROM users';
        const params: any = {};

        if (search) {
            const where = ' WHERE username LIKE $search';
            queryStr += where;
            countQueryStr += where;
            params.$search = `%${search}%`;
        }

        queryStr += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const users = db.query(queryStr).all(params);
        const totalResult = db.query(countQueryStr).get(params) as any;

        return {
            users,
            total: totalResult.total,
            page,
            limit,
            totalPages: Math.ceil(totalResult.total / limit)
        };
    }

    async updateUser(id: number, data: { username?: string, role?: string, password?: string }) {
        const updates: string[] = [];
        const params: any = { $id: id };

        if (data.username) {
            updates.push('username = $username');
            params.$username = data.username;
        }
        if (data.role) {
            updates.push('role = $role');
            params.$role = data.role;
        }
        if (data.password) {
            const hashedPassword = await Bun.password.hash(data.password);
            updates.push('password = $password');
            params.$password = hashedPassword;
        }

        if (updates.length === 0) return null;

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $id RETURNING id, username, role, created_at`;
        return db.query(query).get(params);
    }

    async deleteUser(id: number) {
        return db.query('DELETE FROM users WHERE id = $id').run({ $id: id });
    }

    // --- Manga Management ---

    async getAllManga(page: number = 1, limit: number = 20, search: string = '') {
        const offset = (page - 1) * limit;

        let queryStr = 'SELECT id, title, image, source, chapter, is_trending, last_updated FROM manga';
        let countQueryStr = 'SELECT COUNT(*) as total FROM manga';
        const params: any = {};

        if (search) {
            queryStr += ' WHERE title LIKE $search';
            countQueryStr += ' WHERE title LIKE $search';
            params.$search = `%${search}%`;
        }

        queryStr += ` ORDER BY last_updated DESC LIMIT $limit OFFSET $offset`;
        params.$limit = limit;
        params.$offset = offset;

        const manga = db.query(queryStr).all(params);
        const totalResult = db.query(countQueryStr).get(params) as any;

        return {
            manga,
            total: totalResult.total,
            page,
            limit,
            totalPages: Math.ceil(totalResult.total / limit)
        };
    }

    async deleteManga(id: number) {
        return db.query('DELETE FROM manga WHERE id = $id').run({ $id: id });
    }

    async searchExternalManga(query: string, source?: string) {
        return mangaService.searchExternal(query, source);
    }

    async importManga(source: string, link: string) {
        return mangaService.importManga(source, link);
    }
}

export const adminService = new AdminService();
