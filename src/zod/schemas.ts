import { z } from 'zod';

// User Auth Schemas
export const loginSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6),
});

export const registerSchema = z.object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
    password: z.string().min(6),
    role: z.enum(['user', 'admin']).optional().default('user'),
});

// Middleware
export const authHeaderSchema = z.object({
    authorization: z.string().optional(),
});

// Admin Schemas
export const userUpdateSchema = z.object({
    username: z.string().min(3).optional(),
    password: z.string().min(6).optional(), // Optional for update
    role: z.enum(['user', 'admin']).optional(),
    is_banned: z.boolean().optional(),
});

export const mangaUpdateSchema = z.object({
    title: z.string().min(1).optional(),
    image: z.string().url().optional(),
    status: z.string().optional(),
    author: z.string().optional(),
    synopsis: z.string().optional(),
    genres: z.string().optional(), // Can be JSON string or just string
});

export const commentSchema = z.object({
    content: z.string().min(1).max(1000),
    slug: z.string().min(1),
    chapter_slug: z.string().optional(),
    is_spoiler: z.boolean().optional(),
    media_url: z.string().optional(),
});
