import { db } from '../db';
import { comments as commentsTable, users as usersTable } from '../db/schema';
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
            username: usersTable.username,
            role: usersTable.role
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

        return await query;
    }

    async createComment(userId: number, slug: string, content: string, chapterSlug?: string) {
        const results = await db.insert(commentsTable).values({
            user_id: userId,
            slug,
            chapter_slug: chapterSlug || null,
            content
        }).returning();

        return results[0];
    }
}

export const commentService = new CommentService();
