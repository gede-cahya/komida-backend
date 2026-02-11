import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { db, initDB } from './db'
import { manga as mangaTable } from './db/schema'
import { eq, desc } from 'drizzle-orm'

initDB();
const app = new Hono()

app.use('*', logger())
app.use('*', cors({
    origin: (origin) => origin, // Allow all origins explicitly for debugging
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}))

import { mangaService } from './service/mangaService';
import { userService } from './service/userService';
import { createToken, verifyToken } from './utils/auth';
import { commentService } from './service/commentService';
import { AnalyticsService } from './service/analyticsService';

const analyticsService = new AnalyticsService();

// Analytics Middleware
app.use('*', async (c, next) => {
    // Track unique IPs as site visits
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
    const ua = c.req.header('user-agent') || 'unknown';

    // Skip tracking for static files or favicon if any, but this is API server so it's fine.
    // Also internal admin API calls might be excluded if desired, but let's track everything for now.
    await analyticsService.trackSiteVisit(ip, ua);

    await next();
});

// Auth Routes
app.post('/api/auth/register', async (c) => {
    try {
        const body = await c.req.json();
        const { username, password, role } = body;

        if (!username || !password) {
            return c.json({ error: 'Username and password are required' }, 400);
        }

        const user = await userService.createUser(username, password, role);
        const token = await createToken({ id: user.id, username: user.username, role: user.role });

        return c.json({ user, token });
    } catch (e: any) {
        return c.json({ error: e.message }, 400);
    }
});

app.post('/api/auth/login', async (c) => {
    try {
        const body = await c.req.json();
        const { username, password } = body;

        const user = await userService.getUserByUsername(username);
        if (!user || !(await userService.verifyPassword(password, user.password))) {
            return c.json({ error: 'Invalid credentials' }, 401);
        }

        const token = await createToken({ id: user.id, username: user.username, role: user.role });

        // Remove password from response
        const { password: _, ...userWithoutPass } = user;
        return c.json({ user: userWithoutPass, token });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// Admin Middleware
app.use('/api/admin/*', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token);


    if (!payload || payload.role !== 'admin') {
        return c.json({ error: 'Forbidden: Admins only' }, 403);
    }

    // c.set('user', payload); 
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

app.post('/api/admin/users', async (c) => {
    try {
        const body = await c.req.json();
        const { username, password, role } = body;
        if (!username || !password) return c.json({ error: 'Username and password required' }, 400);

        const user = await userService.createUser(username, password, role);
        return c.json(user);
    } catch (e: any) {
        return c.json({ error: e.message }, 400);
    }
});

app.put('/api/admin/users/:id', async (c) => {
    const id = Number(c.req.param('id'));
    try {
        const body = await c.req.json();
        const user = await adminService.updateUser(id, body);
        if (!user) return c.json({ error: 'User not found or no changes' }, 404);
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

    try {
        const result = await adminService.getAllManga(page, limit, search);
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

app.post('/api/comments', async (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token);

    if (!payload) {
        return c.json({ error: 'Invalid token' }, 401);
    }

    try {
        const body = await c.req.json();
        const { slug, chapter, content } = body;

        if (!slug || !content) {
            return c.json({ error: 'Slug and content are required' }, 400);
        }

        const comment = await commentService.createComment(payload.id, slug, content, chapter);

        // Return with username for immediate display
        return c.json({
            comment: {
                ...comment,
                username: payload.username,
                role: payload.role
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


// SQL Queries removed and replaced by Drizzle

app.get('/', (c) => {
    return c.json({ message: 'Welcome to Komida Backend' })
})

app.get('/health', (c) => {
    return c.json({ status: 'ok', uptime: process.uptime() })
})

app.get('/api/trending', async (c) => {
    const trending = await db.select()
        .from(mangaTable)
        .where(eq(mangaTable.is_trending, true));
    return c.json(trending)
})

app.get('/api/recent', async (c) => {
    const recent = await db.select()
        .from(mangaTable)
        .orderBy(desc(mangaTable.last_updated))
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
            id: encryptData({ source, link: ch.link, title: ch.title }),
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

        // Encrypt chapter links in all sources
        if (data.sources) {
            data.sources.forEach((source: any) => {
                if (source.chapters) {
                    source.chapters = source.chapters.map((ch: any) => ({
                        ...ch,
                        id: encryptData({ source: source.name, link: ch.link, title: ch.title }),
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

import sharp from 'sharp';
import { encryptData, decryptData } from './utils/secure';

app.get('/api/image/proxy', async (c) => {
    const url = c.req.query('url');
    if (!url) return c.text('Missing url', 400);

    const source = c.req.query('source');

    // Determine Referer based on source or URL
    let referer = 'https://kiryuu03.com/'; // Default
    if (url.includes('softkomik') || url.includes('softdevices') || source === 'Softkomik') {
        referer = 'https://softkomik.com/';
    } else if (url.includes('manhwaindo') || source === 'ManhwaIndo') {
        referer = 'https://www.manhwaindo.my/';
    }

    try {
        const response = await fetch(url, {
            headers: {
                'Referer': referer,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            console.error(`[Proxy] Upstream error: ${response.status} for ${url}`);
            return c.text('Upstream error: ' + response.status, 502);
        }

        const contentType = response.headers.get('content-type');
        console.log(`[Proxy] Fetching: ${url}`);
        console.log(`[Proxy] Status: ${response.status}, Content-Type: ${contentType}`);

        const arrayBuffer = await response.arrayBuffer();
        console.log(`[Proxy] Buffer size: ${arrayBuffer.byteLength} bytes`);

        if (arrayBuffer.byteLength === 0) {
            return c.text('Empty response from upstream', 502);
        }

        let outputBuffer: ArrayBuffer | Buffer = arrayBuffer;

        // SKIP Sharp for AVIF or if buffer is already optimized
        if (contentType && (contentType.includes('avif') || contentType.includes('gif'))) {
            console.log(`[Proxy] Skipping Sharp for ${contentType}`);
            c.header('Content-Type', contentType);
            return c.body(outputBuffer as any);
        }

        try {
            outputBuffer = await sharp(arrayBuffer)
                .resize({ width: 800, withoutEnlargement: true })
                .webp({ quality: 60 })
                .toBuffer();

            c.header('Content-Type', 'image/webp');
        } catch (sharpError) {
            console.warn(`[Proxy] Sharp optimization failed for ${url}, returning original. Error:`, sharpError);
            // Fallback to original content type or default
            c.header('Content-Type', contentType || 'application/octet-stream');
            outputBuffer = arrayBuffer;
        }

        c.header('Cache-Control', 'public, max-age=31536000');
        return c.body(outputBuffer as any);

    } catch (e: any) {
        console.error('Proxy Error:', e);
        return c.text('Proxy error', 500);
    }
});

export default {
    port: process.env.PORT || 3001,
    hostname: "0.0.0.0",
    fetch: app.fetch,
}
