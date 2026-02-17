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
    created_at: timestamp('created_at').defaultNow(),
});
