
import { db } from '../src/db';
import { manga } from '../src/db/schema';
import { like, or } from 'drizzle-orm';

async function checkImages() {
    console.log('Checking DB images...');
    const results = await db.select({
        title: manga.title,
        image: manga.image,
        source: manga.source,
        link: manga.link
    }).from(manga).where(
        or(
            like(manga.title, '%Marriagetoxin%'),
            like(manga.title, '%Shibou Yuugi%'),
            like(manga.title, '%Nebula%')
        )
    );

    for (const m of results) {
        console.log(`\nTitle: ${m.title}`);
        console.log(`Image: ${m.image}`);
        console.log(`Source: ${m.source}`);
        console.log(`Link: ${m.link}`);
    }
    process.exit(0);
}

checkImages();
