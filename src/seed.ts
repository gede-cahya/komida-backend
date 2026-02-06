import { db, initDB } from './db';

// Initialize DB first
initDB();

const TRENDING_ITEMS = [
    {
        title: "Jujutsu Kaisen",
        image: "https://images.unsplash.com/photo-1621416896709-399691921c56?q=80&w=600&auto=format&fit=crop",
        rating: 4.8,
        chapter: 248,
        previous_chapter: 247,
        type: "Manga",
        span: "md:col-span-2 md:row-span-2",
        is_trending: true,
        popularity: 100
    },
    {
        title: "One Piece",
        image: "https://images.unsplash.com/photo-1599508704512-2f19efd1e35f?q=80&w=600&auto=format&fit=crop",
        rating: 4.9,
        chapter: 1105,
        previous_chapter: 1104,
        type: "Manga",
        span: "md:col-span-1 md:row-span-2",
        is_trending: true,
        popularity: 95
    },
    {
        title: "Chainsaw Man",
        image: "https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?q=80&w=600&auto=format&fit=crop",
        rating: 4.7,
        chapter: 153,
        previous_chapter: 152,
        type: "Manga",
        span: "col-span-1 row-span-1",
        is_trending: true,
        popularity: 90
    },
    {
        title: "Blue Lock",
        image: "https://images.unsplash.com/photo-1622358826620-1a74d2216bf3?q=80&w=600&auto=format&fit=crop",
        rating: 4.6,
        chapter: 249,
        previous_chapter: 248,
        type: "Manga",
        span: "col-span-1 row-span-1",
        is_trending: true,
        popularity: 85
    }
];

const RECENT_UPDATES = [
    {
        title: "Sakamoto Days",
        image: "https://images.unsplash.com/photo-1560942485-b2a11cc13456?q=80&w=400&auto=format&fit=crop",
        rating: 4.7,
        chapter: 151,
        previous_chapter: 150,
        is_trending: false,
        last_updated: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
        popularity: 80
    },
    {
        title: "Dandadan",
        image: "https://images.unsplash.com/photo-1620608930761-9c1626c99026?q=80&w=400&auto=format&fit=crop",
        rating: 4.8,
        chapter: 136,
        previous_chapter: 135,
        is_trending: false,
        last_updated: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
        popularity: 75
    },
    {
        title: "Kaiju No. 8",
        image: "https://images.unsplash.com/photo-1629858686161-246e72d65d4b?q=80&w=400&auto=format&fit=crop",
        rating: 4.6,
        chapter: 101,
        previous_chapter: 100,
        is_trending: false,
        last_updated: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
        popularity: 70
    },
    {
        title: "Spy x Family",
        image: "https://images.unsplash.com/photo-1606663889134-b1dedb5ed8b7?q=80&w=400&auto=format&fit=crop",
        rating: 4.9,
        chapter: 92,
        previous_chapter: 91,
        is_trending: false,
        last_updated: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
        popularity: 88
    },
    {
        title: "Oshi no Ko",
        image: "https://images.unsplash.com/photo-1512418490979-92798cec1380?q=80&w=400&auto=format&fit=crop",
        rating: 4.8,
        chapter: 139,
        previous_chapter: 138,
        is_trending: false,
        last_updated: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        popularity: 82
    },
    {
        title: "Choujin X",
        image: "https://images.unsplash.com/photo-1605273391745-db637add0fc2?q=80&w=400&auto=format&fit=crop",
        rating: 4.5,
        chapter: 48,
        previous_chapter: 47,
        is_trending: false,
        last_updated: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
        popularity: 60
    }
];

const POPULAR_ITEMS = [
    {
        title: "Solo Leveling",
        image: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600&auto=format&fit=crop",
        rating: 4.9,
        chapter: 200,
        previous_chapter: 199,
        type: "Manhwa",
        span: "col-span-1",
        is_trending: false,
        popularity: 98
    },
    {
        title: "Berserk",
        image: "https://images.unsplash.com/photo-1541562232579-512a21360020?q=80&w=600&auto=format&fit=crop",
        rating: 5.0,
        chapter: 375,
        previous_chapter: 374,
        type: "Manga",
        span: "col-span-1",
        is_trending: false,
        popularity: 99
    },
    {
        title: "Vagabond",
        image: "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?q=80&w=600&auto=format&fit=crop",
        rating: 4.9,
        chapter: 327,
        previous_chapter: 326,
        type: "Manga",
        span: "col-span-1",
        is_trending: false,
        popularity: 96
    },
    {
        title: "Vinland Saga",
        image: "https://images.unsplash.com/photo-1514539079130-25950c84af65?q=80&w=600&auto=format&fit=crop",
        rating: 4.8,
        chapter: 209,
        previous_chapter: 208,
        type: "Manga",
        span: "col-span-1",
        is_trending: false,
        popularity: 92
    },
    {
        title: "Kingdom",
        image: "https://images.unsplash.com/photo-1532012197267-da84d127e765?q=80&w=600&auto=format&fit=crop",
        rating: 4.8,
        chapter: 786,
        previous_chapter: 785,
        type: "Manga",
        span: "col-span-1",
        is_trending: false,
        popularity: 94
    }
];

const insert = db.prepare(`
    INSERT INTO manga (title, image, rating, chapter, previous_chapter, type, span, is_trending, popularity, last_updated)
    VALUES ($title, $image, $rating, $chapter, $previous_chapter, $type, $span, $is_trending, $popularity, $last_updated)
`);

const scrub = db.run("DELETE FROM manga"); // CLEAR ALL DATA
console.log(`Cleared ${scrub.changes} entries`);

const insertBooks = db.transaction(books => {
    for (const book of books) insert.run(book);
});

console.log("Seeding Trending...");
insertBooks(TRENDING_ITEMS.map(i => ({
    $title: i.title,
    $image: i.image,
    $rating: i.rating,
    $chapter: i.chapter,
    $previous_chapter: i.previous_chapter,
    $type: i.type,
    $span: i.span,
    $is_trending: 1,
    $popularity: i.popularity,
    $last_updated: new Date().toISOString()
})));

console.log("Seeding Recent...");
insertBooks(RECENT_UPDATES.map(i => ({
    $title: i.title,
    $image: i.image,
    $rating: i.rating,
    $chapter: i.chapter,
    $previous_chapter: i.previous_chapter,
    $type: "Manga",
    $span: "col-span-1",
    $is_trending: 0,
    $popularity: i.popularity,
    $last_updated: i.last_updated
})));

console.log("Seeding Popular...");
insertBooks(POPULAR_ITEMS.map(i => ({
    $title: i.title,
    $image: i.image,
    $rating: i.rating,
    $chapter: i.chapter,
    $previous_chapter: i.previous_chapter,
    $type: i.type,
    $span: i.span,
    $is_trending: 0,
    $popularity: i.popularity,
    $last_updated: new Date().toISOString()
})));

console.log("Database seeded successfully via Bundle!");
