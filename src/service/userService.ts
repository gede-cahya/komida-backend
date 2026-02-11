import { db } from '../db';
import { users as usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';

export class UserService {

    // Hash password helper (Bun built-in)
    async hashPassword(password: string): Promise<string> {
        return await Bun.password.hash(password);
    }

    // Verify password helper
    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return await Bun.password.verify(password, hash);
    }

    async createUser(username: string, password: string, role: string = 'user') {
        const hashedPassword = await this.hashPassword(password);

        try {
            const results = await db.insert(usersTable).values({
                username,
                password: hashedPassword,
                role
            }).returning();

            return results[0];
        } catch (e: any) {
            // PostgreSQL unique constraint error or SQLite unique constraint error
            if (e.message.includes('UNIQUE constraint failed') || e.message.includes('duplicate key value')) {
                throw new Error('Username already exists');
            }
            throw e;
        }
    }

    async getUserByUsername(username: string) {
        const results = await db.select()
            .from(usersTable)
            .where(eq(usersTable.username, username))
            .limit(1);
        return results[0];
    }

    async getUserById(id: number) {
        const results = await db.select({
            id: usersTable.id,
            username: usersTable.username,
            role: usersTable.role,
            created_at: usersTable.created_at
        })
            .from(usersTable)
            .where(eq(usersTable.id, id))
            .limit(1);
        return results[0];
    }
}

export const userService = new UserService();
