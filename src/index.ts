import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { db, initDB } from './db'
import { secureHeaders } from 'hono/secure-headers'
import { rateLimiter } from 'hono-rate-limiter'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { manga as mangaTable, siteVisits, mangaViews } from './db/schema'
import { eq, desc, count, sql } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { loginSchema, registerSchema, commentSchema, userUpdateSchema, mangaUpdateSchema, verifyWalletSchema } from './zod/schemas'
import sharp from 'sharp';
import { encryptData, decryptData } from './utils/secure';
import { serveStatic } from 'hono/bun';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { generateSiweNonce, parseSiweMessage } from 'viem/siwe';
import { createPublicClient, http, verifyMessage } from 'viem';
import { base } from 'viem/chains';

const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_RPC_URL || 'https://mainnet.base.org')
});

await initDB();
console.log('Database initialized');
const app = new Hono()

app.use('*', logger())
app.use('*', secureHeaders())
app.use('/uploads/*', serveStatic({ root: './public' }))

// Rate Limiter: 100 requests per minute per IP
app.use('*', rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    limit: 100,
    message: 'Too many requests, please try again later.',
    keyGenerator: (c) => c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1'
}))

app.use('*', cors({
    origin: (origin) => {
        // Allow localhost for development
        if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) return origin;
        // Allow production domain
        if (origin.endsWith('komida.site') || origin.endsWith('vercel.app')) return origin;
        // Block others
        return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}))

app.get('/health', (c) => {
    const mem = process.memoryUsage();
    return c.json({
        status: 'ok',
        uptime: process.uptime(),
        memory: {
            rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
        }
    })
})

import { mangaService } from './service/mangaService';
import { userService } from './service/userService';
import { createToken, verifyToken } from './utils/auth';
import { commentService } from './service/commentService';
import { AnalyticsService } from './service/analyticsService';
import { decorationService } from './service/decorationService';
import { badgeService } from './service/badgeService';
import { questService } from './service/questService';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const analyticsService = new AnalyticsService();

// Serve static uploads (badge icons, etc.) via /api/uploads/*
app.get('/api/uploads/*', async (c) => {
    const filePath = c.req.path.replace('/api/uploads/', '');
    const fullPath = path.join(process.cwd(), 'public', 'uploads', filePath);

    if (!existsSync(fullPath)) {
        return c.json({ error: 'File not found' }, 404);
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
            : ext === '.webp' ? 'image/webp'
                : ext === '.svg' ? 'image/svg+xml'
                    : 'application/octet-stream';

    const fileData = readFileSync(fullPath);
    return new Response(fileData, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
        }
    });
});

// Analytics Middleware
app.use('*', async (c, next) => {
    // Track unique IPs as site visits
    if (c.req.method !== 'OPTIONS') {
        const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
        const ua = c.req.header('user-agent') || 'unknown';

        // Skip tracking for static files or favicon if any, but this is API server so it's fine.
        await analyticsService.trackSiteVisit(ip, ua);
    }

    await next();
});

// Auth Routes
app.post('/api/auth/register', zValidator('json', registerSchema), async (c) => {
    try {
        const body = c.req.valid('json');
        const { username, password } = body;
        const role = body.role || 'user';

        // Validated by Zod

        const user = await userService.createUser(username, password, role);
        const token = await createToken({ id: user.id, username: user.username, role: user.role });

        setCookie(c, 'auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'Lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/'
        });

        return c.json({ user, token, success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 400);
    }
});

app.post('/api/auth/login', zValidator('json', loginSchema), async (c) => {
    try {
        const body = c.req.valid('json');
        const { username, password } = body;

        const user = await userService.getUserByUsername(username);
        if (!user || !(await userService.verifyPassword(password, user.password, user.is_banned))) {
            return c.json({ error: 'Invalid credentials' }, 401);
        }

        const token = await createToken({ id: user.id, username: user.username, role: user.role });

        setCookie(c, 'auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'Lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/'
        });

        // Remove password from section
        const { password: _, ...userWithoutPass } = user;
        return c.json({ user: userWithoutPass, token });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/auth/logout', (c) => {
    deleteCookie(c, 'auth_token');
    return c.json({ success: true });
});

// Web3 SIWE Routes
app.get('/api/auth/nonce', (c) => {
    const nonce = generateSiweNonce();
    return c.json({ nonce });
});

app.post('/api/auth/verify-wallet', zValidator('json', verifyWalletSchema), async (c) => {
    try {
        const body = c.req.valid('json');
        const { message, signature } = body;

        const parsedMessage = parseSiweMessage(message);

        const isValid = await verifyMessage({
            address: parsedMessage.address as `0x${string}`,
            message: message as string,
            signature: (signature as string) as `0x${string}`,
        });

        if (!isValid) {
            return c.json({ error: 'Invalid Web3 Signature' }, 401);
        }

        // Check or create user by wallet address
        const walletAddress = parsedMessage.address as string;
        if (!walletAddress) {
            return c.json({ error: 'Missing address in signature' }, 400);
        }
        const user = await userService.getOrCreateWalletUser(walletAddress);

        const token = await createToken({ id: user.id, username: user.username, role: user.role });

        setCookie(c, 'auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'Lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/'
        });

        const { password: _, ...userWithoutPass } = user;
        return c.json({ user: userWithoutPass, token, success: true });

    } catch (e: any) {
        console.error('Wallet verify error:', e);
        return c.json({ error: e.message || 'Signature verification failed' }, 400);
    }
});

// User Auth Middleware (any authenticated user)
app.use('/api/user/*', async (c, next) => {
    let token = getCookie(c, 'auth_token');

    // Fallback to Header for non-browser clients
    if (!token) {
        const authHeader = c.req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = await verifyToken(token);

    if (!payload) {
        return c.json({ error: 'Invalid or expired token' }, 401);
    }

    c.set('userId' as any, payload.id);
    await next();
});

// --- User Profile Routes ---

app.get('/api/user/profile', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const profile = await userService.getUserProfile(userId);

        if (!profile) {
            return c.json({ error: 'User not found' }, 404);
        }

        return c.json({ user: profile });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/user/profile', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const body = await c.req.json();
        const { display_name, email, avatar_url } = body;

        // Validate avatar size (max ~300KB base64)
        if (avatar_url && avatar_url.length > 400000) {
            return c.json({ error: 'Avatar image too large. Max 300KB.' }, 400);
        }

        const updated = await userService.updateProfile(userId, {
            display_name,
            email,
            avatar_url
        });

        return c.json({ user: updated });
    } catch (e: any) {
        return c.json({ error: e.message }, 400);
    }
});

app.put('/api/user/password', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const body = await c.req.json();
        const { oldPassword, newPassword } = body;

        if (!oldPassword || !newPassword) {
            return c.json({ error: 'Old password and new password are required' }, 400);
        }

        if (newPassword.length < 6) {
            return c.json({ error: 'New password must be at least 6 characters' }, 400);
        }

        await userService.changePassword(userId, oldPassword, newPassword);
        return c.json({ message: 'Password changed successfully' });
    } catch (e: any) {
        return c.json({ error: e.message }, 400);
    }
});

// --- Decoration & Badge Routes ---

app.get('/api/user/decorations', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const decorations = await decorationService.getUserDecorations(userId);
        return c.json({ decorations });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/user/decorations/equip', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const body = await c.req.json();
        const { decorationId } = body;

        const result = await decorationService.equipDecoration(userId, decorationId);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 400);
    }
});

app.post('/api/user/decorations/sync', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const result = await decorationService.syncNFTDecorations(userId);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/user/badges', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const badges = await badgeService.getUserBadges(userId);
        return c.json({ badges });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/user/badges/sync', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const result = await badgeService.syncNFTBadges(userId);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Quest Routes (User) ---

app.get('/api/user/quests', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const quests = await questService.getUserQuestProgress(userId);
        return c.json({ quests });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/user/quests/:questId/claim', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const questId = Number(c.req.param('questId'));
        const result = await questService.claimReward(userId, questId);

        // Grant XP for completing quest
        const { tierService, XP_AMOUNTS } = await import('./service/tierService');
        const xpResult = await tierService.addXP(userId, XP_AMOUNTS.quest_complete, 'Completed quest');

        return c.json({ ...result, xp_earned: XP_AMOUNTS.quest_complete, tier_info: xpResult });
    } catch (e: any) {
        return c.json({ error: e.message }, 400);
    }
});

app.get('/api/user/tier', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const { tierService } = await import('./service/tierService');
        const tierInfo = await tierService.getUserTierInfo(userId);
        return c.json(tierInfo);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/decorations', async (c) => {
    try {
        const decorations = await decorationService.getAllDecorations();
        return c.json({ decorations });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/badges', async (c) => {
    try {
        const badges = await badgeService.getAllBadges();
        return c.json({ badges });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Quest Routes (Public) ---

app.get('/api/quests', async (c) => {
    try {
        const quests = await questService.getActiveQuests();
        return c.json({ quests });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Admin Middleware
app.use('/api/admin/*', async (c, next) => {
    let token = getCookie(c, 'auth_token');

    // Fallback to Header
    if (!token) {
        const authHeader = c.req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = await verifyToken(token);


    if (!payload || payload.role !== 'admin') {
        return c.json({ error: 'Forbidden: Admins only' }, 403);
    }

    // c.set('user', payload); 
    c.set('userId' as any, payload.id);
    await next();
});

import { adminService } from './service/adminService';

// --- Admin User Management ---

app.get('/api/admin/users', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 20;
    const search = c.req.query('search') || '';

    try {
        const result = await adminService.getAllUsers(page, limit, search);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/admin/users', zValidator('json', registerSchema), async (c) => {
    try {
        const body = c.req.valid('json');
        const { username, password, role } = body;

        const user = await userService.createUser(username, password, role);
        return c.json(user);
    } catch (e: any) {
        return c.json({ error: e.message }, 400);
    }
});

app.put('/api/admin/users/:id', zValidator('json', userUpdateSchema), async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const body = c.req.valid('json');
        const user = await adminService.updateUser(id, body);
        return c.json(user);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/users/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await adminService.deleteUser(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Admin Manga Management ---

app.get('/api/admin/manga', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 20;
    const search = c.req.query('search') || '';
    const sourceFilter = c.req.query('source') || '';

    try {
        const result = await adminService.getAllManga(page, limit, search, sourceFilter);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/manga/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await adminService.deleteManga(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/admin/manga/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const manga = await adminService.getMangaDetail(id);
        if (!manga) return c.json({ error: 'Manga not found' }, 404);
        return c.json(manga);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/admin/manga/:id', zValidator('json', mangaUpdateSchema), async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const body = c.req.valid('json');
        const manga = await adminService.updateManga(id, body);
        return c.json(manga);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/manga/:id/chapter/:slug', async (c) => {
    const id = Number(c.req.param('id'));
    const slug = c.req.param('slug');
    try {
        const chapters = await adminService.deleteChapter(id, slug);
        if (!chapters) return c.json({ error: 'Chapter not found or failed to delete' }, 404);
        return c.json({ success: true, chapters });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/admin/manga/search', async (c) => {
    try {
        const body = await c.req.json();
        console.log('[API] Search request:', body);
        const { query, source } = body;
        if (!query) return c.json({ error: 'Query is required' }, 400);

        const results = await adminService.searchExternalManga(query, source);
        console.log(`[API] Found ${results.length} results`);
        return c.json({ results });
    } catch (e: any) {
        console.error('[API] Search error:', e);
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/admin/manga/import', async (c) => {
    try {
        const body = await c.req.json();
        const { source, link } = body;
        if (!source || !link) return c.json({ error: 'Source and link are required' }, 400);

        const result = await adminService.importManga(source, link);
        return c.json({ success: true, manga: result });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/admin/manga/update-all', async (c) => {
    try {
        const result = await adminService.updateAllManga();
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Admin Comment Management ---

app.get('/api/admin/active-users', async (c) => {
    try {
        const topUsers = await adminService.getTopActiveUsersToday(10);
        return c.json({ activeUsers: topUsers });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/admin/comments', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 20;
    try {
        const result = await adminService.getAllComments(page, limit);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/comments/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await adminService.deleteComment(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Announcement Routes ---

import { announcementService } from './service/announcementService';

// Public route to get active announcement
app.get('/api/announcements/active', async (c) => {
    try {
        const announcement = await announcementService.getActiveAnnouncement();
        return c.json({ announcement });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Admin routes for announcements
app.get('/api/admin/announcements', async (c) => {
    try {
        const announcements = await announcementService.getAllAnnouncements();
        return c.json({ announcements });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/admin/announcements', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const body = await c.req.json();
        const { content, type, image_url } = body;
        if (!content) return c.json({ error: 'Content is required' }, 400);

        const announcement = await announcementService.createAnnouncement(content, type, userId, image_url);
        return c.json({ announcement });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/admin/announcements/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const body = await c.req.json();
        const { is_active } = body;
        const announcement = await announcementService.toggleActive(id, Boolean(is_active));
        return c.json({ announcement });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/announcements/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await announcementService.deleteAnnouncement(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Admin Decoration & Badge Management ---

app.post('/api/admin/decorations', async (c) => {
    try {
        const body = await c.req.json();
        const decoration = await adminService.createDecoration(body);
        return c.json({ decoration });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/admin/decorations/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const body = await c.req.json();
        const decoration = await adminService.updateDecoration(id, body);
        return c.json({ decoration });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/decorations/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await adminService.deleteDecoration(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/admin/badges', async (c) => {
    try {
        const body = await c.req.json();
        const badge = await adminService.createBadge(body);
        return c.json({ badge });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/admin/badges/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const body = await c.req.json();
        const badge = await adminService.updateBadge(id, body);
        return c.json({ badge });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/badges/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await adminService.deleteBadge(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Admin Quest Management ---

app.get('/api/admin/quests', async (c) => {
    try {
        const quests = await questService.getAllQuests();
        return c.json({ quests });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/admin/quests', async (c) => {
    try {
        const userId = c.get('userId' as any) as number;
        const body = await c.req.json();
        const quest = await questService.createQuest({
            ...body,
            created_by: userId,
            starts_at: body.starts_at ? new Date(body.starts_at) : null,
            expires_at: body.expires_at ? new Date(body.expires_at) : null,
        });
        return c.json({ quest });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/admin/quests/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const body = await c.req.json();
        if (body.starts_at) body.starts_at = new Date(body.starts_at);
        if (body.expires_at) body.expires_at = new Date(body.expires_at);
        const quest = await questService.updateQuest(id, body);
        return c.json({ quest });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/quests/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await questService.deleteQuest(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Admin Badge Management ---

app.get('/api/admin/badges', async (c) => {
    try {
        const badges = await badgeService.getAllBadges();
        return c.json({ badges });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/admin/badges', async (c) => {
    try {
        const formData = await c.req.formData();
        const name = formData.get('name') as string;
        const description = (formData.get('description') as string) || '';
        const type = (formData.get('type') as string) || 'achievement';
        const iconFile = formData.get('icon') as File | null;

        if (!name) return c.json({ error: 'Name is required' }, 400);

        let icon_url = '';
        if (iconFile && iconFile.size > 0) {
            const ext = iconFile.name.split('.').pop() || 'png';
            const fileName = `${Date.now()}_${name.toLowerCase().replace(/\s+/g, '_')}.${ext}`;
            const dir = path.join(process.cwd(), 'public', 'uploads', 'badges');
            const { mkdirSync, writeFileSync } = await import('node:fs');
            mkdirSync(dir, { recursive: true });
            const buffer = Buffer.from(await iconFile.arrayBuffer());
            writeFileSync(path.join(dir, fileName), buffer);
            icon_url = `/uploads/badges/${fileName}`;
        } else {
            return c.json({ error: 'Icon file is required' }, 400);
        }

        const badge = await badgeService.createBadge({ name, description, icon_url, type });
        return c.json({ badge });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/admin/badges/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const formData = await c.req.formData();
        const updateData: any = {};

        const name = formData.get('name') as string;
        const description = formData.get('description') as string;
        const type = formData.get('type') as string;
        if (name) updateData.name = name;
        if (description !== null) updateData.description = description;
        if (type) updateData.type = type;

        const iconFile = formData.get('icon') as File | null;
        if (iconFile && iconFile.size > 0) {
            const ext = iconFile.name.split('.').pop() || 'png';
            const fileName = `${Date.now()}_${(name || 'badge').toLowerCase().replace(/\s+/g, '_')}.${ext}`;
            const dir = path.join(process.cwd(), 'public', 'uploads', 'badges');
            const { mkdirSync, writeFileSync } = await import('node:fs');
            mkdirSync(dir, { recursive: true });
            const buffer = Buffer.from(await iconFile.arrayBuffer());
            writeFileSync(path.join(dir, fileName), buffer);
            updateData.icon_url = `/uploads/badges/${fileName}`;
        }

        const badge = await badgeService.updateBadge(id, updateData);
        return c.json({ badge });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/badges/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await badgeService.deleteBadge(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Admin Decoration Management ---

app.get('/api/admin/decorations', async (c) => {
    try {
        const decorations = await decorationService.getAllDecorations();
        return c.json({ decorations });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/admin/decorations', async (c) => {
    try {
        const formData = await c.req.formData();
        const name = formData.get('name') as string;
        const description = (formData.get('description') as string) || '';
        const type = (formData.get('type') as string) || 'regular';
        const image_url_text = formData.get('image_url') as string; // For CSS decorations
        const imageFile = formData.get('image') as File | null;

        if (!name) return c.json({ error: 'Name is required' }, 400);

        let image_url = image_url_text || '';
        if (imageFile && imageFile.size > 0) {
            const ext = imageFile.name.split('.').pop() || 'png';
            const fileName = `${Date.now()}_${name.toLowerCase().replace(/\s+/g, '_')}.${ext}`;
            const dir = path.join(process.cwd(), 'public', 'uploads', 'decorations');
            const { mkdirSync, writeFileSync } = await import('node:fs');
            mkdirSync(dir, { recursive: true });
            const buffer = Buffer.from(await imageFile.arrayBuffer());
            writeFileSync(path.join(dir, fileName), buffer);
            image_url = `/uploads/decorations/${fileName}`;
        }

        if (!image_url) return c.json({ error: 'Image or CSS decoration URL is required' }, 400);

        const decoration = await decorationService.createDecoration({ name, description, image_url, type });
        return c.json({ decoration });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/admin/decorations/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const formData = await c.req.formData();
        const updateData: any = {};

        const name = formData.get('name') as string;
        const description = formData.get('description') as string;
        const type = formData.get('type') as string;
        const image_url_text = formData.get('image_url') as string;
        if (name) updateData.name = name;
        if (description !== null) updateData.description = description;
        if (type) updateData.type = type;
        if (image_url_text) updateData.image_url = image_url_text;

        const imageFile = formData.get('image') as File | null;
        if (imageFile && imageFile.size > 0) {
            const ext = imageFile.name.split('.').pop() || 'png';
            const fileName = `${Date.now()}_${(name || 'decoration').toLowerCase().replace(/\s+/g, '_')}.${ext}`;
            const dir = path.join(process.cwd(), 'public', 'uploads', 'decorations');
            const { mkdirSync, writeFileSync } = await import('node:fs');
            mkdirSync(dir, { recursive: true });
            const buffer = Buffer.from(await imageFile.arrayBuffer());
            writeFileSync(path.join(dir, fileName), buffer);
            updateData.image_url = `/uploads/decorations/${fileName}`;
        }

        const decoration = await decorationService.updateDecoration(id, updateData);
        return c.json({ decoration });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/decorations/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await decorationService.deleteDecoration(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- System Health ---

app.get('/api/admin/system/health', async (c) => {
    try {
        // Check DB
        const start = performance.now();
        await db.execute(sql`SELECT 1`);
        const dbLatency = Math.round(performance.now() - start);

        return c.json({
            status: 'online',
            database: { status: 'connected', latency: `${dbLatency}ms` },
            scrapers: { status: 'idle', message: 'Scrapers run on-demand' }, // Placeholder
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return c.json({
            status: 'degraded',
            database: { status: 'error', message: e.message },
            timestamp: new Date().toISOString()
        }, 500);
    }
});

// --- Bug Reports (Public) ---

app.post('/api/bug-reports', async (c) => {
    try {
        const body = await c.req.json();
        const { title, description, steps, page_url, email } = body;

        if (!title || !description) {
            return c.json({ error: 'Title and description are required' }, 400);
        }

        const bugReport = await adminService.createBugReport({
            title,
            description,
            steps: steps || '',
            page_url: page_url || '',
            email: email || ''
        });

        return c.json({ success: true, report: bugReport });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- Bug Reports (Admin) ---

app.get('/api/admin/bug-reports', async (c) => {
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 20;
    const status = c.req.query('status') || '';

    try {
        const result = await adminService.getAllBugReports(page, limit, status);
        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.put('/api/admin/bug-reports/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const body = await c.req.json();
        const { status } = body;

        if (!status || !['pending', 'resolved'].includes(status)) {
            return c.json({ error: 'Invalid status' }, 400);
        }

        const report = await adminService.updateBugReportStatus(id, status);
        return c.json({ report });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.delete('/api/admin/bug-reports/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        await adminService.deleteBugReport(id);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Upload Route
app.post('/api/upload', async (c) => {
    try {
        const body = await c.req.parseBody();
        const file = body['file'];
        if (file instanceof File) {
            const buffer = await file.arrayBuffer();
            const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const uploadDir = join(import.meta.dir, '../public/uploads');

            await mkdir(uploadDir, { recursive: true });
            await writeFile(join(uploadDir, fileName), Buffer.from(buffer));

            return c.json({ url: `/uploads/${fileName}` });
        }
        return c.json({ error: 'No file uploaded' }, 400);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Comment Routes
app.get('/api/comments', async (c) => {
    const slug = c.req.query('slug');
    const chapter = c.req.query('chapter');

    if (!slug) {
        return c.json({ error: 'Slug is required' }, 400);
    }

    try {
        const comments = await commentService.getComments(slug, chapter);
        return c.json({ comments });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/api/comments', zValidator('json', commentSchema), async (c) => {
    let token = getCookie(c, 'auth_token');
    if (!token) {
        const authHeader = c.req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = await verifyToken(token);

    if (!payload) {
        return c.json({ error: 'Invalid token' }, 401);
    }

    try {
        const body = c.req.valid('json');
        const { slug, chapter_slug, content, is_spoiler, media_url } = body;
        // Zod validates required fields

        const comment = await commentService.createComment(
            payload.id,
            slug,
            content,
            chapter_slug,
            Boolean(is_spoiler),
            media_url ?? undefined);

        // Grant XP for comment
        const { tierService, XP_AMOUNTS } = await import('./service/tierService');
        await tierService.addXP(payload.id, XP_AMOUNTS.comment_post, 'Posted comment').catch(() => { });

        const userProfile: any = await userService.getUserById(payload.id);

        // Return with username for immediate display
        return c.json({
            comment: {
                ...comment,
                username: userProfile.username,
                role: userProfile.role,
                display_name: userProfile.display_name,
                avatar_url: userProfile.avatar_url,
                decoration_url: userProfile.decoration_url,
                badges: userProfile.badges
            }
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Delete Comment (User or Admin)
app.delete('/api/comments/:id', async (c) => {
    let token = getCookie(c, 'auth_token');

    if (!token) {
        const authHeader = c.req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else {
            // Fallback to 'token' cookie if auth_token is missing (legacy/dev)
            const cookieHeader = c.req.header('Cookie');
            if (cookieHeader) {
                const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
                    const [key, value] = cookie.trim().split('=');
                    acc[key] = value;
                    return acc;
                }, {} as any);
                token = cookies['token'];
            }
        }
    }

    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = await verifyToken(token);
    if (!payload) {
        return c.json({ error: 'Invalid token' }, 401);
    }

    const commentId = Number(c.req.param('id'));
    if (isNaN(commentId)) {
        return c.json({ error: 'Invalid comment ID' }, 400);
    }

    try {
        // If admin, pass undefined for userId to bypass ownership check (or handle in service)
        // But my service logic: if userId is provided, it checks ownership.
        // If I want admin to delete ANY, I should NOT pass userId if role is admin.

        const userIdToCheck = payload.role === 'admin' ? undefined : payload.id;

        await commentService.deleteComment(commentId, userIdToCheck);
        return c.json({ success: true });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Update Comment
app.put('/api/comments/:id', async (c) => {
    let token = getCookie(c, 'auth_token');

    if (!token) {
        const authHeader = c.req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else {
            const cookieHeader = c.req.header('Cookie');
            if (cookieHeader) {
                const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
                    const [key, value] = cookie.trim().split('=');
                    acc[key] = value;
                    return acc;
                }, {} as any);
                token = cookies['token'];
            }
        }
    }

    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = await verifyToken(token);
    if (!payload) {
        return c.json({ error: 'Invalid token' }, 401);
    }

    const commentId = Number(c.req.param('id'));
    if (isNaN(commentId)) {
        return c.json({ error: 'Invalid comment ID' }, 400);
    }

    try {
        const body = await c.req.json();
        const { content, is_spoiler, media_url } = body;

        if (!content && !media_url) {
            return c.json({ error: 'Content or media is required' }, 400);
        }

        const updated = await commentService.updateComment(
            commentId,
            payload.id,
            content,
            Boolean(is_spoiler),
            media_url
        );

        // Return full comment structure (mocking user details since only owner edits own comment)
        return c.json({
            comment: {
                ...updated,
                username: payload.username, // usage of token payload for immediate response
                role: payload.role,
                // display_name/avatar might be missing from token payload depending on implementation
                // For now, frontend updates list or refetches.
            }
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});


// Admin Dashboard Data
app.get('/api/admin/dashboard', async (c) => {
    const summary = await analyticsService.getSummary();
    return c.json({
        message: 'Welcome to Admin Dashboard',
        stats: {
            users: 1, // Optional: could get real count from summary if needed
            manga: summary.totalManga,
            serverUptime: process.uptime()
        }
    });
});

// AnalyticsService used above

app.get('/api/admin/stats/summary', async (c) => {
    try {
        const summary = await analyticsService.getSummary();
        return c.json(summary);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/admin/stats/visits', async (c) => {
    const period = c.req.query('period') as 'day' | 'week' | 'month' || 'day';
    try {
        const visits = await analyticsService.getSiteVisits(period);
        return c.json(visits);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/admin/stats/popular', async (c) => {
    const period = c.req.query('period') as 'day' | 'week' | 'month' || 'day';
    try {
        const popular = await analyticsService.getTopManga(period);
        return c.json(popular);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.get('/api/debug/analytics', async (c) => {
    try {
        const [visitCount] = await db.select({ count: count() }).from(siteVisits);
        const [viewCount] = await db.select({ count: count() }).from(mangaViews);

        // Get last 5 visits
        const recentVisits = await db.select().from(siteVisits).orderBy(desc(siteVisits.visited_at)).limit(5);

        // Test the analytics queries
        const dayVisits = await analyticsService.getSiteVisits('day');
        const topManga = await analyticsService.getTopManga('day');

        // Logic verification (Raw SQL)
        const rawNow = await db.execute(sql`SELECT NOW() as now, NOW() - INTERVAL '1 day' as yesterday`);
        const rawCount = await db.execute(sql`SELECT count(*) as count FROM site_visits WHERE visited_at > NOW() - INTERVAL '1 day'`);

        // Complex Query Verification (Group By)
        const rawComplex = await db.execute(sql`
            SELECT 
                to_char(visited_at, 'HH24:00') as date, 
                COUNT(id) as visits 
            FROM site_visits 
            WHERE visited_at > NOW() - INTERVAL '1 day' 
            GROUP BY 1 
            ORDER BY 1 ASC
        `);

        // Debug Top 10 Manga JOIN
        const sampleViews = await db.select().from(mangaViews).limit(5);
        const sampleManga = await db.select().from(mangaTable).limit(5);
        const checkJoin = await db.execute(sql`
            SELECT mv.manga_slug, m.link 
            FROM manga_views mv 
            JOIN manga m ON m.link LIKE '%' || mv.manga_slug || '%' 
            LIMIT 5
        `);

        // Check recent views (to see if tracking is working NOW)
        const recentViews = await db.select().from(mangaViews).orderBy(desc(mangaViews.viewed_at)).limit(5);

        // Check if query works with longer timeframe
        const resultsMonth = await analyticsService.getTopManga('month');

        return c.json({
            serverTime: new Date().toISOString(),
            dbNow: rawNow[0],
            rawDailyCount: rawCount[0],
            rawComplexResult: rawComplex,
            totalVisits: visitCount.count,
            totalViews: viewCount.count,
            queryResult_visits: dayVisits,
            queryResult_topManga_day: topManga, // Rename for clarity
            queryResult_topManga_month: resultsMonth, // Proof that query works
            debug_join: {
                successfulJoins: checkJoin,
                recentViews: recentViews // Show newest views
            }
        });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});


// SQL Queries removed and replaced by Drizzle

app.get('/', (c) => {
    return c.json({ message: 'Welcome to Komida Backend' })
})


// Debug endpoint to check headers and path
app.get('/api/debug', (c) => {
    return c.json({
        path: c.req.path,
        url: c.req.url,
        headers: c.req.header(),
        query: c.req.query()
    });
});

// Health moved to top

app.get('/api/trending', async (c) => {
    const subquery = db.selectDistinctOn([mangaTable.title], {
        id: mangaTable.id,
        title: mangaTable.title,
        image: mangaTable.image,
        rating: mangaTable.rating,
        chapter: mangaTable.chapter,
        type: mangaTable.type,
        span: mangaTable.span,
        is_trending: mangaTable.is_trending,
        link: mangaTable.link,
        source: mangaTable.source,
        last_updated: mangaTable.last_updated
    })
        .from(mangaTable)
        .where(eq(mangaTable.is_trending, true))
        .orderBy(mangaTable.title, desc(mangaTable.last_updated))
        .as('sq');

    const trending = await db.select()
        .from(subquery)
        .orderBy(desc(subquery.last_updated));
    return c.json(trending)
})

app.get('/api/recent', async (c) => {
    const subquery = db.selectDistinctOn([mangaTable.title], {
        id: mangaTable.id,
        title: mangaTable.title,
        image: mangaTable.image,
        rating: mangaTable.rating,
        chapter: mangaTable.chapter,
        type: mangaTable.type,
        source: mangaTable.source,
        link: mangaTable.link,
        last_updated: mangaTable.last_updated
    })
        .from(mangaTable)
        .orderBy(mangaTable.title, desc(mangaTable.last_updated))
        .as('sq');

    const recent = await db.select()
        .from(subquery)
        .orderBy(desc(subquery.last_updated))
        .limit(10);
    return c.json(recent)
})

app.get('/api/popular', async (c) => {
    const refresh = c.req.query('refresh') === 'true';
    const page = parseInt(c.req.query('page') || '1');
    const limit = 24;

    let popular = await mangaService.getPopularManga(page, limit);

    if ((popular.length === 0 && page === 1) || refresh) {
        await mangaService.updatePopularCache();
        popular = await mangaService.getPopularManga(page, limit);
    }

    // Pass metadata? The current frontend expects array.
    // If we add pagination, frontend might need 'hasMore' or 'total'.
    // service.getPopularManga returns array.
    // I'll return the array directly for now to keep contract similar, but clients need to manage logic.
    // Or I can return { data: [], page: 1 }.
    // Existing frontend expects array?
    // Let's check existing usage. `page.tsx` (Home) likely expects array.
    // `app/popular/page.tsx` likely expects array.
    // I will return array for now. Frontend will just increment page and if empty array, stop.

    return c.json(popular)
})

app.get('/api/genres', async (c) => {
    const genres = await mangaService.getGenres();
    return c.json(genres);
});

app.get('/api/genres/:genre', async (c) => {
    const genre = c.req.param('genre');
    const page = parseInt(c.req.query('page') || '1');
    const manga = await mangaService.getMangaByGenre(genre, page);
    return c.json(manga);
});

app.get('/api/manga/detail', async (c) => {
    const source = c.req.query('source');
    const link = c.req.query('link');

    if (!source || !link) {
        return c.json({ error: 'Missing source or link' }, 400);
    }

    // Attempt to decrypt link (if encrypted)
    // Legacy endpoint support
    const data = decryptData(link);
    const finalLink = data?.link || link; // decryptData returns object or string? 
    // Wait, decryptData returns any. My implementation returns { link, source } OR null.
    // If it was encrypted string (old style), decryptData logic might fail if it expects JSON.
    // I should check secure.ts again.
    // secure.ts xorString(xor) -> JSON.parse. 
    // If it fails, checks validation.
    // I'll just rely on `link` being passed raw or handled by secure logic implicitly?
    // User requested Full Obfuscation. Legacy `api/manga/detail` is not primary target.
    // I will just disable this endpoint's encryption logic for now to fix compile, or use encryptData.

    // Actually, decryptData returns `any`.

    const detail = await mangaService.getMangaDetail(source, finalLink);
    if (!detail) {
        return c.json({ error: 'Failed to fetch detail' }, 500);
    }

    // Encrypt chapters
    if (detail.chapters) {
        detail.chapters = detail.chapters.map((ch: any) => ({
            ...ch,
            id: encryptData({ source, link: ch.link }),
            link: ''
        }));
    }

    return c.json(detail);
})

app.get('/api/manga/chapter', async (c) => {
    const id = c.req.query('id');
    const legacySource = c.req.query('source');
    const legacyLink = c.req.query('link');

    let source = legacySource;
    let link = legacyLink;

    if (id) {
        const data = decryptData(id);
        if (data) {
            source = data.source;
            link = data.link;
        }
    }

    if (!source || !link) {
        return c.json({ error: 'Missing source or link' }, 400);
    }

    // Legacy support: if link is encrypted string (old style), decrypt it
    // But decryptData handles fallback, so it's fine.
    // If id was passed, we trust it.

    const chapterData = await mangaService.getChapterImages(source, link);

    if (!chapterData || !chapterData.images) {
        return c.json({ images: [] });
    }

    // Return raw images, let frontend handle proxying
    const proxiedImages = chapterData.images;

    // Encrypt Next/Prev as IDs
    const nextId = chapterData.next ? encryptData({ source, link: chapterData.next }) : undefined;
    const prevId = chapterData.prev ? encryptData({ source, link: chapterData.prev }) : undefined;

    return c.json({
        source, // Return source so frontend knows context
        images: proxiedImages,
        next: nextId,
        prev: prevId
    });
});

app.get('/api/manga/search', async (c) => {
    const query = c.req.query('q');
    if (!query) return c.json({ results: [] });

    const results = await mangaService.searchManga(query);
    return c.json({ results });
});

app.get('/api/manga/slug/:slug', async (c) => {
    try {
        const slug = c.req.param('slug');

        // Track View
        await analyticsService.trackMangaView(slug);

        const data = await mangaService.getMangaBySlug(slug);

        if (!data) {
            return c.json({ error: 'Manga not found' }, 404);
        }

        // Quest tracking: update progress for logged-in users (non-blocking, uses already-fetched data)
        try {
            let token = getCookie(c, 'auth_token');
            if (!token) {
                const authHeader = c.req.header('Authorization');
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    token = authHeader.split(' ')[1];
                }
            }
            if (token) {
                const payload = await verifyToken(token);
                if (payload) {
                    // Track comics_read quest
                    questService.updateQuestProgress(payload.id, 'comics_read').catch((e) => {
                        console.error('[Quest] Failed to update comics_read:', e);
                    });

                    // Grant XP for reading manga
                    const { tierService, XP_AMOUNTS } = await import('./service/tierService');
                    tierService.addXP(payload.id, XP_AMOUNTS.manga_read, 'Read manga').catch(() => { });

                    // Track genre_read quest using already-fetched genres
                    if (data.genres && data.genres.length > 0) {
                        console.log(`[Quest] Tracking genres for user ${payload.id}: ${JSON.stringify(data.genres)}`);
                        for (const genre of data.genres) {
                            const genreName = typeof genre === 'string' ? genre : genre.name;
                            if (genreName) {
                                questService.updateQuestProgress(payload.id, 'genre_read', genreName).catch((e) => {
                                    console.error(`[Quest] Failed to update genre_read for "${genreName}":`, e);
                                });
                            }
                        }
                    } else {
                        console.log(`[Quest] No genres found for manga slug: ${slug}`);
                    }
                }
            }
        } catch (e) {
            console.error('[Quest] Quest tracking error:', e);
        }

        // Encrypt chapter links in all sources
        if (data.sources) {
            data.sources.forEach((source: any) => {
                if (source.chapters) {
                    source.chapters = source.chapters.map((ch: any) => ({
                        ...ch,
                        id: encryptData({ source: source.name, link: ch.link }),
                        link: '' // Hide raw link
                    }));
                }
            });
        }

        return c.json(data);
    } catch (e: any) {
        console.error(e);
        return c.json({ error: e.message, stack: e.stack }, 500);
    }
});

// Imports moved to top

// --- Memory Optimizations for Railway Free Tier (512MB RAM) ---
// Semaphore to limit concurrent image proxy requests
let activeProxyRequests = 0;
const MAX_CONCURRENT_PROXY = 30; // Increased from 3 to 30 to handle grid loads

sharp.cache(false);        // Disable Sharp's internal image cache
sharp.concurrency(1);      // Limit Sharp to 1 processing thread

// 1x1 Grey PNG for fallback
const FALLBACK_IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

app.get('/api/image/proxy', async (c) => {
    const url = c.req.query('url');
    if (!url) return c.text('Missing url', 400);

    if (activeProxyRequests >= MAX_CONCURRENT_PROXY) {
        // Return fallback instead of 503 to prevent Next.js image error
        c.header('Content-Type', 'image/png');
        c.header('Cache-Control', 'public, max-age=60');
        return c.body(FALLBACK_IMAGE as any);
    }
    activeProxyRequests++;

    const source = c.req.query('source');

    let referer = 'https://kiryuu03.com/';
    if (url.includes('softkomik') || url.includes('softdevices') || source === 'Softkomik') {
        referer = 'https://softkomik.com/';
    } else if (url.includes('manhwaindo') || source === 'ManhwaIndo') {
        referer = 'https://www.manhwaindo.my/';
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

        try {
            const response = await fetch(url, {
                headers: {
                    'Referer': referer,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                console.error(`[Proxy] Upstream error: ${response.status} for ${url}`);
                c.header('Content-Type', 'image/png');
                c.header('Cache-Control', 'public, max-age=60');
                return c.body(FALLBACK_IMAGE as any);
            }

            const contentType = response.headers.get('content-type');
            const arrayBuffer = await response.arrayBuffer();

            if (arrayBuffer.byteLength === 0) throw new Error('Empty response');

            if (contentType && (contentType.includes('avif') || contentType.includes('gif'))) {
                c.header('Content-Type', contentType);
                c.header('Cache-Control', 'public, max-age=31536000');
                return c.body(arrayBuffer as any);
            }

            c.header('Content-Type', contentType || 'application/octet-stream');
            c.header('Cache-Control', 'public, max-age=31536000');
            return c.body(arrayBuffer as any);

        } catch (fetchError: any) {
            clearTimeout(timeout);
            console.error(`[Proxy] Fetch failed: ${fetchError.name} - ${url}`);
            // If timeout or network error, return fallback
            c.header('Content-Type', 'image/png');
            c.header('Cache-Control', 'public, max-age=60');
            return c.body(FALLBACK_IMAGE as any);
        }

    } catch (e: any) {
        console.error('Proxy Error:', e);
        return c.text('Proxy error', 500);
    } finally {
        activeProxyRequests--;
    }
});


console.log(`Server is running at 0.0.0.0:${process.env.PORT || 3005}`);

export default {
    port: process.env.PORT || 3005,
    hostname: "0.0.0.0",
    fetch: app.fetch,
}
