
import { db } from '../db';

export class CommentService {

    // Get comments for a slug (and optional chapter)
    async getComments(slug: string, chapterSlug?: string) {
        let queryStr = `
            SELECT c.*, u.username, u.role 
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.slug = $slug
        `;

        const params: any = { $slug: slug };

        if (chapterSlug) {
            queryStr += ` AND c.chapter_slug = $chapterSlug`;
            params.$chapterSlug = chapterSlug;
        } else {
            // For manga detail, only show general comments (where chapter_slug is null)
            // Or show all? Usually separate. Let's assume separate.
            // If chapterSlug is undefined, we assume we want manga-level comments.
            queryStr += ` AND c.chapter_slug IS NULL`;
        }

        queryStr += ` ORDER BY c.created_at DESC`;

        const query = db.query(queryStr);
        return query.all(params) as any[];
    }

    async createComment(userId: number, slug: string, content: string, chapterSlug?: string) {
        const query = db.prepare(`
            INSERT INTO comments (user_id, slug, chapter_slug, content)
            VALUES ($userId, $slug, $chapterSlug, $content)
            RETURNING *
        `);

        return query.get({
            $userId: userId,
            $slug: slug,
            $chapterSlug: chapterSlug || null,
            $content: content
        }) as any;
    }
}

export const commentService = new CommentService();
