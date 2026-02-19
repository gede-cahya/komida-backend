
import { db } from '../db';
import { announcements, users } from '../db/schema';
import { eq, desc, asc } from 'drizzle-orm';

export const announcementService = {
    // Get the current active announcement (latest one)
    async getActiveAnnouncement() {
        const result = await db.select({
            id: announcements.id,
            content: announcements.content,
            type: announcements.type,
            is_active: announcements.is_active,
            created_at: announcements.created_at,
            expires_at: announcements.expires_at,
            image_url: announcements.image_url,
            admin: {
                username: users.username,
                display_name: users.display_name,
                avatar_url: users.avatar_url,
            }
        })
            .from(announcements)
            .leftJoin(users, eq(announcements.admin_id, users.id))
            .where(eq(announcements.is_active, true))
            .orderBy(desc(announcements.created_at)) // Get the most recent one
            .limit(1);

        return result[0] || null;
    },

    // Get all announcements for admin
    async getAllAnnouncements() {
        return await db.select({
            id: announcements.id,
            content: announcements.content,
            type: announcements.type,
            is_active: announcements.is_active,
            created_at: announcements.created_at,
            expires_at: announcements.expires_at,
            image_url: announcements.image_url,
            admin: {
                username: users.username,
                display_name: users.display_name,
                avatar_url: users.avatar_url,
            }
        })
            .from(announcements)
            .leftJoin(users, eq(announcements.admin_id, users.id))
            .orderBy(desc(announcements.created_at));
    },

    // Create a new announcement
    async createAnnouncement(content: string, type: string = 'info', adminId?: number, imageUrl?: string) {
        // Optionally, we could deactivate all other announcements if we only want one active
        // await db.update(announcements).set({ is_active: false });

        const result = await db.insert(announcements)
            .values({
                content,
                type,
                is_active: true,
                admin_id: adminId,
                image_url: imageUrl,
            })
            .returning();
        return result[0];
    },

    // Toggle active status
    async toggleActive(id: number, is_active: boolean) {
        const result = await db.update(announcements)
            .set({ is_active })
            .where(eq(announcements.id, id))
            .returning();
        return result[0];
    },

    // Delete announcement
    async deleteAnnouncement(id: number) {
        await db.delete(announcements)
            .where(eq(announcements.id, id));
        return true;
    }
};
