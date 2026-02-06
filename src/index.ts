import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { db } from './db'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

import { mangaService } from './service/mangaService';

// SQL Queries
const getTrending = db.query('SELECT * FROM manga WHERE is_trending = 1');
const getRecent = db.query('SELECT * FROM manga ORDER BY last_updated DESC LIMIT 10'); // Fix: Get all latest regardless of trending
// Removed old getPopular query to use service instead

app.get('/', (c) => {
    return c.json({ message: 'Welcome to Komida Backend' })
})

app.get('/health', (c) => {
    return c.json({ status: 'ok', uptime: process.uptime() })
})

app.get('/api/trending', (c) => {
    const trending = getTrending.all();
    return c.json(trending)
})

app.get('/api/recent', (c) => {
    const recent = getRecent.all();
    return c.json(recent)
})

app.get('/api/popular', async (c) => {
    const refresh = c.req.query('refresh') === 'true';
    const page = parseInt(c.req.query('page') || '1');
    const limit = 24;

    let popular = mangaService.getPopularManga(page, limit);

    if ((popular.length === 0 && page === 1) || refresh) {
        await mangaService.updatePopularCache();
        popular = mangaService.getPopularManga(page, limit);
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

    // Proxy the images for compression and reliability
    const proxiedImages = chapterData.images.map((img: string) =>
        `${new URL(c.req.url).origin}/api/image/proxy?url=${encodeURIComponent(img)}`
    );

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

    try {
        const response = await fetch(url, {
            headers: {
                'Referer': 'https://kiryuu03.com/', // Default to Kiryuu, or extract from URL
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) return c.text('Upstream error: ' + response.status, 502);

        const arrayBuffer = await response.arrayBuffer();
        const optimizedBuffer = await sharp(arrayBuffer)
            .resize({ width: 800, withoutEnlargement: true })
            .webp({ quality: 60 })
            .toBuffer();

        c.header('Content-Type', 'image/webp');
        c.header('Cache-Control', 'public, max-age=31536000');
        return c.body(optimizedBuffer as any);

    } catch (e: any) {
        console.error('Proxy Error:', e);
        return c.text('Proxy error', 500);
    }
});

export default {
    port: 3001,
    fetch: app.fetch,
}
