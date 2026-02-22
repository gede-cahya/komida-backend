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
    wallet_address: text('wallet_address').unique(),
    is_banned: boolean('is_banned').default(false),
    xp: integer('xp').default(0),
    tier: integer('tier').default(1),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        uniqueIndex('idx_users_username').on(table.username),
    ];
});

export const dailyUserActivity = pgTable('daily_user_activity', {
    id: serial('id').primaryKey(),
    user_id: integer('user_id').notNull().references(() => users.id),
    date: text('date').notNull(), // stored as YYYY-MM-DD
    xp_gained: integer('xp_gained').default(0),
    actions_count: integer('actions_count').default(0),
}, (table) => {
    return [
        uniqueIndex('idx_daily_activity_user_date').on(table.user_id, table.date),
        index('idx_daily_activity_date').on(table.date)
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

export const decorations = pgTable('decorations', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    image_url: text('image_url').notNull(),
    type: text('type').default('regular'), // regular, nft, seasonal
    nft_contract_address: text('nft_contract_address'),
    nft_token_id: text('nft_token_id'),
    created_at: timestamp('created_at').defaultNow(),
});

export const badges = pgTable('badges', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    icon_url: text('icon_url').notNull(),
    type: text('type').default('regular'), // regular, nft, achievement
    nft_contract_address: text('nft_contract_address'),
    nft_token_id: text('nft_token_id'),
    created_at: timestamp('created_at').defaultNow(),
});

export const userDecorations = pgTable('user_decorations', {
    id: serial('id').primaryKey(),
    user_id: integer('user_id').notNull().references(() => users.id),
    decoration_id: integer('decoration_id').notNull().references(() => decorations.id),
    is_equipped: boolean('is_equipped').default(false),
    acquired_at: timestamp('acquired_at').defaultNow(),
}, (table) => {
    return [
        index('idx_user_decorations_user').on(table.user_id),
        uniqueIndex('idx_user_decorations_unique').on(table.user_id, table.decoration_id),
    ];
});

export const userBadges = pgTable('user_badges', {
    id: serial('id').primaryKey(),
    user_id: integer('user_id').notNull().references(() => users.id),
    badge_id: integer('badge_id').notNull().references(() => badges.id),
    is_equipped: boolean('is_equipped').default(true), // Users can have multiple badges equipped usually
    acquired_at: timestamp('acquired_at').defaultNow(),
}, (table) => {
    return [
        index('idx_user_badges_user').on(table.user_id),
        uniqueIndex('idx_user_badges_unique').on(table.user_id, table.badge_id),
    ];
});

export const quests = pgTable('quests', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    quest_type: text('quest_type').notNull(), // genre_read, comics_read, chapters_read
    target_value: integer('target_value').default(1),
    target_genre: text('target_genre'), // for genre-based quests
    reward_type: text('reward_type').notNull().default('badge'), // badge, decoration, both
    reward_badge_id: integer('reward_badge_id').references(() => badges.id),
    reward_decoration_id: integer('reward_decoration_id').references(() => decorations.id),
    is_active: boolean('is_active').default(true),
    created_by: integer('created_by').references(() => users.id),
    starts_at: timestamp('starts_at'),
    expires_at: timestamp('expires_at'),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        index('idx_quests_active').on(table.is_active),
        index('idx_quests_type').on(table.quest_type),
    ];
});

export const userQuests = pgTable('user_quests', {
    id: serial('id').primaryKey(),
    user_id: integer('user_id').notNull().references(() => users.id),
    quest_id: integer('quest_id').notNull().references(() => quests.id),
    progress: integer('progress').default(0),
    is_completed: boolean('is_completed').default(false),
    completed_at: timestamp('completed_at'),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        index('idx_user_quests_user').on(table.user_id),
        index('idx_user_quests_quest').on(table.quest_id),
        uniqueIndex('idx_user_quests_unique').on(table.user_id, table.quest_id),
    ];
});

export const bugReports = pgTable('bug_reports', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    steps: text('steps'),
    page_url: text('page_url'),
    email: text('email'),
    status: text('status').default('pending'),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => {
    return [
        index('idx_bug_reports_status').on(table.status),
        index('idx_bug_reports_created').on(table.created_at),
    ];
});
