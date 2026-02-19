import { pgTable, serial, text, real, boolean, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const manga = pgTable('manga', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    image: text('image').notNull(),
    rating: real('rating'),
    chapter: text('chapter'),
    previous_chapter: text('previous_chapter'),
    type: text('type'),
    span: text('span'),
    is_trending: boolean('is_trending').default(false),
    popularity: integer('popularity').default(0),
    link: text('link'),
    source: text('source'),
    chapters: text('chapters'), // JSON stringified
    genres: text('genres'),   // JSON stringified
    synopsis: text('synopsis'),
    status: text('status'),
    author: text('author'),
    last_updated: timestamp('last_updated').defaultNow(),
}, (table) => {
    return [
        index('idx_manga_title').on(table.title),
        index('idx_manga_link').on(table.link),
        index('idx_manga_trending').on(table.is_trending),
    ];
});

export const mangaViews = pgTable('manga_views', {
    id: serial('id').primaryKey(),
    manga_slug: text('manga_slug').notNull(),
    viewed_at: timestamp('viewed_at').defaultNow(),
}, (table) => {
    return [
        index('idx_manga_views_slug').on(table.manga_slug),
        index('idx_manga_views_date').on(table.viewed_at),
    ];
});

export const siteVisits = pgTable('site_visits', {
    id: serial('id').primaryKey(),
    ip_hash: text('ip_hash'),
    visited_at: timestamp('visited_at').defaultNow(),
    user_agent: text('user_agent'),
}, (table) => {
    return [
        index('idx_site_visits_date').on(table.visited_at),
    ];
});

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    username: text('username').notNull().unique(),
    password: text('password').notNull(),
    role: text('role').default('user'),
    email: text('email'),
    display_name: text('display_name'),
    avatar_url: text('avatar_url'),
    is_banned: boolean('is_banned').default(false),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        uniqueIndex('idx_users_username').on(table.username),
    ];
});

export const comments = pgTable('comments', {
    id: serial('id').primaryKey(),
    user_id: integer('user_id').notNull().references(() => users.id),
    slug: text('slug').notNull(),
    chapter_slug: text('chapter_slug'),
    content: text('content').notNull(),
    is_spoiler: boolean('is_spoiler').default(false),
    media_url: text('media_url'),
    created_at: timestamp('created_at').defaultNow(),
});

export const chapterCache = pgTable('chapter_cache', {
    id: serial('id').primaryKey(),
    source: text('source').notNull(),
    link: text('link').notNull(),
    images: text('images').notNull(), // JSON stringified array of URLs
    next_slug: text("next_slug"),
    prev_slug: text("prev_slug"),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        index('idx_chapter_cache_lookup').on(table.source, table.link),
    ];
});

export const announcements = pgTable('announcements', {
    id: serial('id').primaryKey(),
    content: text('content').notNull(),
    type: text('type').default('info'), // info, warning, success, etc.
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at').defaultNow(),
    expires_at: timestamp('expires_at'),
    admin_id: integer('admin_id').references(() => users.id),
    image_url: text('image_url'),
}, (table) => {
    return [
        index('idx_announcements_active').on(table.is_active),
        index('idx_announcements_created').on(table.created_at),
    ];
});

// Duplicate removed
