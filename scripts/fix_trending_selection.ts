
import { db } from '../src/db';
import { manga } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';

async function fixTrending() {
    console.log('Fixing trending selection...');

    // 1. Marriagetoxin: Unset Softkomik, Set Kiryuu
    console.log('Fixing Marriagetoxin...');
    await db.update(manga)
        .set({ is_trending: false })
        .where(and(eq(manga.title, 'Marriagetoxin'), eq(manga.source, 'Softkomik')));

    await db.update(manga)
        .set({ is_trending: true })
        .where(and(eq(manga.title, 'Marriagetoxin'), eq(manga.source, 'Kiryuu')));

    // 2. Shibou Yuugi: Unset ManhwaIndo (HTTP), Set Kiryuu (HTTPS)
    console.log('Fixing Shibou Yuugi...');
    // Note: Title might vary slightly, checking DB output from before
    // ManhwaIndo: "Shibou Yuugi de Meshi wo Kuu."
    // Kiryuu: "Shibou Yuugi de Meshi wo Kuu."
    const title = 'Shibou Yuugi de Meshi wo Kuu.';

    await db.update(manga)
        .set({ is_trending: false })
        .where(and(eq(manga.title, title), eq(manga.source, 'ManhwaIndo')));

    await db.update(manga)
        .set({ is_trending: true })
        .where(and(eq(manga.title, title), eq(manga.source, 'Kiryuu')));

    // 3. The Nebula’s Civilization
    // ManhwaIndo is HTTP. Let's see if we have Kiryuu version?
    // Check DB first? I'll just assume yes or if not, keep ManhwaIndo (which returned 200).
    // Actually script output showed [ManhwaIndo] The Nebula’s Civilization 200 OK.
    // If user says it's broken, maybe try to switch to Kiryuu if exists.
    const nebulaTitle = 'The Nebula’s Civilization';
    await db.update(manga)
        .set({ is_trending: true })
        .where(and(eq(manga.title, nebulaTitle), eq(manga.source, 'Kiryuu')));

    // If Kiryuu exists, unset ManhwaIndo? 
    // I'll leave ManhwaIndo as is unless I confirm Kiryuu exists.
    // But if multiple are trending, logic might display duplicates?
    // "Popular" uses `getPopularManga` which returns list. Frontend maps list.
    // If multiple are trending, duplicates appear.
    // So I SHOULD unset ManhwaIndo if I set Kiryuu.

    const kiryuuNebula = await db.select().from(manga).where(and(eq(manga.title, nebulaTitle), eq(manga.source, 'Kiryuu')));
    if (kiryuuNebula.length > 0 && kiryuuNebula[0].image) {
        console.log('Switching Nebula to Kiryuu...');
        await db.update(manga)
            .set({ is_trending: false })
            .where(and(eq(manga.title, nebulaTitle), eq(manga.source, 'ManhwaIndo')));

        await db.update(manga)
            .set({ is_trending: true })
            .where(eq(manga.id, kiryuuNebula[0].id));
    }

    console.log('Done.');
    process.exit(0);
}

fixTrending();
