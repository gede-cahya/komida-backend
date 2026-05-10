package manga

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Trending(ctx context.Context) ([]ListItem, error) {
	return r.queryList(ctx, `
		SELECT id, title, image, rating, chapter, type, span, is_trending, link, source,
		       to_char(last_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_updated
		FROM (
			SELECT DISTINCT ON (title) id, title, image, rating, chapter, type, span, is_trending, link, source, last_updated
			FROM manga
			WHERE is_trending = true
			ORDER BY title, last_updated DESC
		) sq
		ORDER BY last_updated DESC`)
}

func (r *Repository) Recent(ctx context.Context) ([]ListItem, error) {
	return r.queryList(ctx, `
		SELECT id, title, image, rating, chapter, type, NULL::text AS span, NULL::boolean AS is_trending, link, source,
		       to_char(last_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_updated
		FROM (
			SELECT DISTINCT ON (title) id, title, image, rating, chapter, type, link, source, last_updated
			FROM manga
			ORDER BY title, last_updated DESC
		) sq
		ORDER BY last_updated DESC
		LIMIT 10`)
}

func (r *Repository) Popular(ctx context.Context, page int, limit int) ([]ListItem, error) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 24
	}
	offset := (page - 1) * limit
	return r.queryList(ctx, `
		SELECT id, title, image, rating, chapter, type, span, NULL::boolean AS is_trending, link, source,
		       to_char(last_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_updated
		FROM (
			SELECT DISTINCT ON (title) id, title, image, rating, chapter, type, span, link, source, last_updated
			FROM manga
			WHERE is_trending = true
			ORDER BY title, last_updated DESC
		) sq
		ORDER BY last_updated DESC
		LIMIT $1 OFFSET $2`, limit, offset)
}

func (r *Repository) Search(ctx context.Context, query string) ([]SearchItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, title, image, rating, chapter, previous_chapter, type, span, is_trending, popularity,
		       link, source, COALESCE(chapters, '[]'), COALESCE(genres, '[]'), synopsis, status, author,
		       to_char(last_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_updated
		FROM manga
		WHERE title ILIKE $1
		ORDER BY title ASC, last_updated DESC`, "%"+query+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]SearchItem, 0)
	seen := map[string]struct{}{}
	for rows.Next() {
		var item SearchItem
		var chapters string
		var genres string
		if err := rows.Scan(&item.ID, &item.Title, &item.Image, &item.Rating, &item.Chapter, &item.PreviousChapter, &item.Type, &item.Span, &item.IsTrending, &item.Popularity, &item.Link, &item.Source, &chapters, &genres, &item.Synopsis, &item.Status, &item.Author, &item.LastUpdated); err != nil {
			return nil, err
		}
		key := strings.ToLower(strings.TrimSpace(item.Title))
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		item.Image = secureImageURL(item.Image)
		item.Chapters = validJSON(chapters, []byte("[]"))
		item.Genres = validJSON(genres, []byte("[]"))
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) BySlug(ctx context.Context, slug string) (*Detail, error) {
	titlePart := strings.ReplaceAll(slug, "-", "%")
	rows, err := r.pool.Query(ctx, `
		SELECT id, title, image, rating, link, source, COALESCE(chapters, '[]'), COALESCE(genres, '[]'), synopsis, status, author
		FROM manga
		WHERE title LIKE $1 OR link LIKE $2
		ORDER BY last_updated DESC`, "%"+titlePart+"%", "%"+slug+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var records []detailRecord
	for rows.Next() {
		var rec detailRecord
		if err := rows.Scan(&rec.ID, &rec.Title, &rec.Image, &rec.Rating, &rec.Link, &rec.Source, &rec.Chapters, &rec.Genres, &rec.Synopsis, &rec.Status, &rec.Author); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, pgx.ErrNoRows
	}
	primary := records[0]
	sources := make([]SourceDetail, 0, len(records))
	for _, rec := range records {
		chapters := encryptChapters(validJSON(rec.Chapters, []byte("[]")), valueOrEmpty(rec.Source))
		sources = append(sources, SourceDetail{
			Name:     valueOrEmpty(rec.Source),
			Link:     valueOrEmpty(rec.Link),
			Rating:   valueOrZero(rec.Rating),
			Chapters: chapters,
			Image:    secureImageURL(rec.Image),
		})
	}
	return &Detail{
		Title:    primary.Title,
		Image:    secureImageURL(primary.Image),
		Author:   valueOrDefault(primary.Author, "Unknown"),
		Status:   valueOrDefault(primary.Status, "Ongoing"),
		Genres:   validJSON(primary.Genres, []byte("[]")),
		Synopsis: valueOrEmpty(primary.Synopsis),
		Sources:  sources,
	}, nil
}

func (r *Repository) Genres(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT COALESCE(genres, '[]') FROM manga WHERE genres IS NOT NULL AND jsonb_array_length(genres) > 0`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	seen := map[string]struct{}{}
	genres := make([]string, 0)
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var parsed []string
		if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
			continue
		}
		for _, genre := range parsed {
			genre = strings.TrimSpace(genre)
			if genre == "" {
				continue
			}
			key := strings.ToLower(genre)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			genres = append(genres, genre)
		}
	}
	return genres, rows.Err()
}

func (r *Repository) ByGenre(ctx context.Context, genre string, page int, limit int) ([]SearchItem, error) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 24
	}
	offset := (page - 1) * limit
	rows, err := r.pool.Query(ctx, `
		SELECT id, title, image, rating, chapter, previous_chapter, type, span, is_trending, popularity,
		       link, source, COALESCE(chapters, '[]'), COALESCE(genres, '[]'), synopsis, status, author,
		       to_char(last_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_updated
		FROM manga
		WHERE genres::text ILIKE $1
		ORDER BY last_updated DESC
		LIMIT $2 OFFSET $3`, "%"+genre+"%", limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]SearchItem, 0)
	seen := map[string]struct{}{}
	for rows.Next() {
		var item SearchItem
		var chapters string
		var genres string
		if err := rows.Scan(&item.ID, &item.Title, &item.Image, &item.Rating, &item.Chapter, &item.PreviousChapter, &item.Type, &item.Span, &item.IsTrending, &item.Popularity, &item.Link, &item.Source, &chapters, &genres, &item.Synopsis, &item.Status, &item.Author, &item.LastUpdated); err != nil {
			return nil, err
		}
		key := strings.ToLower(strings.TrimSpace(item.Title))
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		item.Image = secureImageURL(item.Image)
		item.Chapters = validJSON(chapters, []byte("[]"))
		item.Genres = validJSON(genres, []byte("[]"))
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) queryList(ctx context.Context, sql string, args ...any) ([]ListItem, error) {
	rows, err := r.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]ListItem, 0)
	for rows.Next() {
		var item ListItem
		if err := rows.Scan(&item.ID, &item.Title, &item.Image, &item.Rating, &item.Chapter, &item.Type, &item.Span, &item.IsTrending, &item.Link, &item.Source, &item.LastUpdated); err != nil {
			return nil, fmt.Errorf("scan manga list item: %w", err)
		}
		item.Image = secureImageURL(item.Image)
		items = append(items, item)
	}
	return items, rows.Err()
}

func IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

type detailRecord struct {
	ID       int
	Title    string
	Image    string
	Rating   *float64
	Link     *string
	Source   *string
	Chapters string
	Genres   string
	Synopsis *string
	Status   *string
	Author   *string
}

func secureImageURL(url string) string {
	if strings.HasPrefix(url, "http://") {
		return "https://" + url[7:]
	}
	return url
}

func validJSON(raw string, fallback []byte) json.RawMessage {
	if json.Valid([]byte(raw)) {
		return json.RawMessage(raw)
	}
	return json.RawMessage(fallback)
}

func encryptChapters(raw json.RawMessage, source string) json.RawMessage {
	var chapters []map[string]any
	if err := json.Unmarshal(raw, &chapters); err != nil {
		return raw
	}
	for _, chapter := range chapters {
		link, ok := chapter["link"].(string)
		if !ok || link == "" {
			continue
		}
		chapter["id"] = encryptChapterID(source, link)
		chapter["link"] = ""
	}
	encoded, err := json.Marshal(chapters)
	if err != nil {
		return raw
	}
	return encoded
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func valueOrDefault(value *string, fallback string) string {
	if value == nil || *value == "" {
		return fallback
	}
	return *value
}

func valueOrZero(value *float64) float64 {
	if value == nil {
		return 0
	}
	return *value
}
