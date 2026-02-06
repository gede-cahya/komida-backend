
import { db } from '../db';

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
            const query = db.prepare(`
                INSERT INTO users (username, password, role)
                VALUES ($username, $password, $role)
                RETURNING id, username, role, created_at
            `);

            const user = query.get({
                $username: username,
                $password: hashedPassword,
                $role: role
            }) as any;

            return user;
        } catch (e: any) {
            if (e.message.includes('UNIQUE constraint failed')) {
                throw new Error('Username already exists');
            }
            throw e;
        }
    }

    async getUserByUsername(username: string) {
        const query = db.prepare('SELECT * FROM users WHERE username = $username');
        return query.get({ $username: username }) as any;
    }

    async getUserById(id: number) {
        const query = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = $id');
        return query.get({ $id: id }) as any;
    }
}

export const userService = new UserService();
