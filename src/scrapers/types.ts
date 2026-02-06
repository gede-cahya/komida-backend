export enum MangaSource {
    KIRYUU = 'Kiryuu',
    MANHWAINDO = 'ManhwaIndo',
    SHINIGAMI = 'Shinigami',
}

export interface ScrapedManga {
    title: string;
    image: string;
    source: MangaSource;
    chapter: string; // "Chapter 123"
    rating?: number;
    previous_chapter?: string;
    link: string; // URL to the manga
}

export interface MangaChapter {
    title: string;
    link: string;
    released?: string; // e.g. "2 days ago"
}

export interface MangaDetail {
    title: string;
    image: string;
    synopsis: string;
    genres: string[];
    author?: string;
    status?: string;
    rating?: number;
    chapters: MangaChapter[];
}

export interface ChapterData {
    images: string[];
    next?: string;
    prev?: string;
}

export interface ScraperProvider {
    name: MangaSource;
    scrapePopular(): Promise<ScrapedManga[]>;
    scrapeDetail(link: string): Promise<MangaDetail | null>;
    scrapeChapter(link: string): Promise<ChapterData | null>;
}

