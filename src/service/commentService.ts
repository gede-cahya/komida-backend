import { db } from '../db';
import { comments as commentsTable, users as usersTable, userDecorations as userDecorationsTable, decorations as decorationsTable, userBadges as userBadgesTable, badges as badgesTable } from '../db/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';

export class CommentService {

    // Get comments for a slug (and optional chapter)
    async getComments(slug: string, chapterSlug?: string) {
        const query = db.select({
            id: commentsTable.id,
            user_id: commentsTable.user_id,
            slug: commentsTable.slug,
            chapter_slug: commentsTable.chapter_slug,
            content: commentsTable.content,
            created_at: commentsTable.created_at,
            is_spoiler: commentsTable.is_spoiler,
            media_url: commentsTable.media_url,
            username: usersTable.username,
            role: usersTable.role,
            display_name: usersTable.display_name,
            avatar_url: usersTable.avatar_url
        })
            .from(commentsTable)
            .innerJoin(usersTable, eq(commentsTable.user_id, usersTable.id))
            .where(
                and(
                    eq(commentsTable.slug, slug),
                    chapterSlug ? eq(commentsTable.chapter_slug, chapterSlug) : isNull(commentsTable.chapter_slug)
                )
            )
            .orderBy(desc(commentsTable.created_at));

        const comments = await query;

        // Enrich comments with badges and active decoration
        const enrichedComments = await Promise.all(comments.map(async (comment: any) => {
            const [decoration] = await db.select({
                image_url: decorationsTable.image_url
            })
                .from(userDecorationsTable)
                .innerJoin(decorationsTable, eq(userDecorationsTable.decoration_id, decorationsTable.id))
                .where(
                    and(
                        eq(userDecorationsTable.user_id, comment.user_id),
                        eq(userDecorationsTable.is_equipped, true)
                    )
                )
                .limit(1);

            const badges = await db.select({
                name: badgesTable.name,
                icon_url: badgesTable.icon_url
            })
                .from(userBadgesTable)
                .innerJoin(badgesTable, eq(userBadgesTable.badge_id, badgesTable.id))
                .where(
                    and(
                        eq(userBadgesTable.user_id, comment.user_id),
                        eq(userBadgesTable.is_equipped, true)
                    )
                );

            return {
                ...comment,
                decoration_url: decoration?.image_url || null,
                badges
            };
        }));

        return enrichedComments;
    }

    async createComment(userId: number, slug: string, content: string | undefined, chapterSlug?: string | null, isSpoiler: boolean = false, mediaUrl?: string | null) {
        const results = await db.insert(commentsTable).values({
            user_id: userId,
            slug,
            chapter_slug: chapterSlug || null,
            content: content || '',
            is_spoiler: isSpoiler,
            media_url: mediaUrl || null
        }).returning();

        return results[0];
    }

    async deleteComment(commentId: number, userId?: number) {
        // 1. Check if comment exists
        const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId));

        if (!comment) {
            throw new Error('Comment not found');
        }

        // 2. Check ownership if userId is provided
        if (userId && comment.user_id !== userId) {
            throw new Error('Unauthorized: You can only delete your own comments');
        }

        // 3. Delete
        await db.delete(commentsTable).where(eq(commentsTable.id, commentId));
        return true;
    }

    async updateComment(commentId: number, userId: number, content: string, isSpoiler: boolean, mediaUrl?: string | null) {
        // 1. Check if comment exists
        const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, commentId));

        if (!comment) {
            throw new Error('Comment not found');
        }

        // 2. Check ownership (Strictly owner only for now)
        if (comment.user_id !== userId) {
            throw new Error('Unauthorized: You can only edit your own comments');
        }

        // 3. Update
        const [updated] = await db.update(commentsTable)
            .set({
                content,
                is_spoiler: isSpoiler,
                media_url: mediaUrl || null
                // updated_at: new Date() // Schema doesn't have updated_at yet, skip for now
            })
            .where(eq(commentsTable.id, commentId))
            .returning();

        return updated;
    }
}

export const commentService = new CommentService();
