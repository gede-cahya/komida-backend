package scraper

import "context"

type ScrapedManga struct {
	Title           string  `json:"title"`
	Image           string  `json:"image"`
	Source          string  `json:"source"`
	Chapter         string  `json:"chapter"`
	PreviousChapter *string `json:"previous_chapter,omitempty"`
	Link            string  `json:"link"`
	Rating          float64 `json:"rating"`
}

type MangaChapter struct {
	Title    string `json:"title"`
	Link     string `json:"link"`
	Released string `json:"released,omitempty"`
}

type MangaDetail struct {
	Title    string         `json:"title"`
	Image    string         `json:"image"`
	Synopsis string         `json:"synopsis"`
	Genres   []string       `json:"genres"`
	Author   string         `json:"author"`
	Status   string         `json:"status"`
	Rating   float64        `json:"rating"`
	Chapters []MangaChapter `json:"chapters"`
}

type ChapterData struct {
	Images []string `json:"images"`
	Next   string   `json:"next,omitempty"`
	Prev   string   `json:"prev,omitempty"`
}

type GenreItem struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type Provider interface {
	Name() string
	ScrapePopular(ctx context.Context) ([]ScrapedManga, error)
	ScrapeDetail(ctx context.Context, link string) (*MangaDetail, error)
	ScrapeChapter(ctx context.Context, link string) (*ChapterData, error)
	ScrapeGenres(ctx context.Context) ([]GenreItem, error)
	ScrapeByGenre(ctx context.Context, genre string, page int) ([]ScrapedManga, error)
	Search(ctx context.Context, query string) ([]ScrapedManga, error)
}
