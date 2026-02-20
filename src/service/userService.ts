import { db } from '../db';
import { users as usersTable, userDecorations as userDecorationsTable, decorations as decorationsTable, userBadges as userBadgesTable, badges as badgesTable } from '../db/schema';
import { eq, count, and } from 'drizzle-orm';
import { decorationService } from './decorationService';
import { badgeService } from './badgeService';

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?background=random";

export class UserService {

    // Hash password helper (Bun built-in)
    async hashPassword(password: string): Promise<string> {
        return await Bun.password.hash(password);
    }

    // Verify password helper
    async verifyPassword(password: string, hash: string, is_banned?: boolean | null): Promise<boolean> {
        if (is_banned) throw new Error('Account is banned');
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
            // Drizzle/Postgres.js might wrap actual error in .cause
            if (e.message.includes('UNIQUE constraint failed') ||
                e.message.includes('duplicate key value') ||
                (e.cause && (e.cause.code === '23505' || e.cause.message?.includes('duplicate key value')))
            ) {
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
            email: usersTable.email,
            display_name: usersTable.display_name,
            avatar_url: usersTable.avatar_url,
            wallet_address: usersTable.wallet_address,
            is_banned: usersTable.is_banned,
            created_at: usersTable.created_at
        })
            .from(usersTable)
            .where(eq(usersTable.id, id))
            .limit(1);

        const user: any = results[0];
        if (!user) return null;

        // Fetch equipped decoration
        const [decoration] = await db.select({
            image_url: decorationsTable.image_url
        })
            .from(userDecorationsTable)
            .innerJoin(decorationsTable, eq(userDecorationsTable.decoration_id, decorationsTable.id))
            .where(
                and(
                    eq(userDecorationsTable.user_id, id),
                    eq(userDecorationsTable.is_equipped, true)
                )
            )
            .limit(1);

        user.decoration_url = decoration?.image_url || null;

        // Fetch equipped badges
        const badges = await db.select({
            name: badgesTable.name,
            icon_url: badgesTable.icon_url
        })
            .from(userBadgesTable)
            .innerJoin(badgesTable, eq(userBadgesTable.badge_id, badgesTable.id))
            .where(
                and(
                    eq(userBadgesTable.user_id, id),
                    eq(userBadgesTable.is_equipped, true)
                )
            );

        user.badges = badges;

        return user;
    }

    async getUserByWalletAddress(walletAddress: string) {
        const results = await db.select()
            .from(usersTable)
            .where(eq(usersTable.wallet_address, walletAddress))
            .limit(1);
        return results[0];
    }

    async getOrCreateWalletUser(walletAddress: string) {
        let user = await this.getUserByWalletAddress(walletAddress);
        if (user) return user;

        // Create new user for this wallet
        const randomStr = Math.random().toString(36).substring(2, 8);
        const generatedUsername = `web3_${walletAddress.slice(2, 8)}${randomStr}`;
        // Random impossible password, since they login via wallet
        const randomPassword = await this.hashPassword(crypto.randomUUID());

        const results = await db.insert(usersTable).values({
            username: generatedUsername,
            password: randomPassword,
            wallet_address: walletAddress,
            role: 'user',
        }).returning();

        return results[0];
    }

    async getUserProfile(id: number) {
        return this.getUserById(id);
    }

    async updateProfile(id: number, data: { display_name?: string; email?: string; avatar_url?: string }) {
        const updateData: any = {};
        if (data.display_name !== undefined) updateData.display_name = data.display_name;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;

        if (Object.keys(updateData).length === 0) {
            return this.getUserById(id);
        }

        try {
            const results = await db.update(usersTable)
                .set(updateData)
                .where(eq(usersTable.id, id))
                .returning({
                    id: usersTable.id,
                    username: usersTable.username,
                    role: usersTable.role,
                    email: usersTable.email,
                    display_name: usersTable.display_name,
                    avatar_url: usersTable.avatar_url,
                    created_at: usersTable.created_at
                });
            return results[0];
        } catch (e: any) {
            if (e.message.includes('duplicate key value') ||
                e.message.includes('UNIQUE constraint') ||
                (e.cause && (e.cause.code === '23505' || e.cause.message?.includes('duplicate key value')))
            ) {
                throw new Error('Email already in use');
            }
            throw e;
        }
    }

    async changePassword(id: number, oldPassword: string, newPassword: string) {
        // Get user with password
        const results = await db.select()
            .from(usersTable)
            .where(eq(usersTable.id, id))
            .limit(1);

        const user = results[0];
        if (!user) throw new Error('User not found');

        // Verify old password
        const isValid = await this.verifyPassword(oldPassword, user.password);
        if (!isValid) throw new Error('Current password is incorrect');

        // Hash and update new password
        const hashedNewPassword = await this.hashPassword(newPassword);
        await db.update(usersTable)
            .set({ password: hashedNewPassword })
            .where(eq(usersTable.id, id));

        return true;
    }
}

export const userService = new UserService();
