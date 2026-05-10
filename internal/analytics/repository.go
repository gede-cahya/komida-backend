package analytics

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) TrackMangaView(ctx context.Context, slug string) error {
	_, err := r.pool.Exec(ctx, `INSERT INTO manga_views (manga_slug, viewed_at) VALUES ($1, NOW())`, slug)
	return err
}

func (r *Repository) TrackSiteVisit(ctx context.Context, ipHash, userAgent string) error {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM site_visits
			WHERE ip_hash = $1 AND visited_at > NOW() - INTERVAL '30 minutes'
		)`, ipHash).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	_, err = r.pool.Exec(ctx, `INSERT INTO site_visits (ip_hash, user_agent, visited_at) VALUES ($1, $2, NOW())`, ipHash, userAgent)
	return err
}

func (r *Repository) TopManga(ctx context.Context, period string) ([]TopMangaResult, error) {
	interval := "1 day"
	if period == "week" {
		interval = "7 days"
	} else if period == "month" {
		interval = "30 days"
	}
	rows, err := r.pool.Query(ctx, `
		SELECT mv.manga_slug as slug, COUNT(*) as views
		FROM manga_views mv
		WHERE mv.viewed_at > NOW() - $1::INTERVAL
		GROUP BY mv.manga_slug
		ORDER BY views DESC
		LIMIT 10`, interval)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []TopMangaResult
	for rows.Next() {
		var slug string
		var views int64
		if err := rows.Scan(&slug, &views); err != nil {
			return nil, err
		}
		// Find matching manga
		var title, image, source *string
		_ = r.pool.QueryRow(ctx, `
			SELECT title, image, source FROM manga
			WHERE link LIKE $1 OR title LIKE $1
			LIMIT 1`, "%"+slug+"%").Scan(&title, &image, &source)
		results = append(results, TopMangaResult{
			Slug:   slug,
			Views:  views,
			Title:  strVal(title),
			Image:  strVal(image),
			Source: strVal(source),
		})
	}
	return results, rows.Err()
}

func (r *Repository) SiteVisits(ctx context.Context, period string) ([]VisitResult, error) {
	interval := "1 day"
	dateFormat := "HH24:00"
	if period == "week" {
		interval = "7 days"
		dateFormat = "YYYY-MM-DD"
	} else if period == "month" {
		interval = "30 days"
		dateFormat = "YYYY-MM-DD"
	}
	query := fmt.Sprintf(`
		SELECT to_char(visited_at, '%s') as date, COUNT(id) as visits
		FROM site_visits
		WHERE visited_at > NOW() - INTERVAL '%s'
		GROUP BY 1
		ORDER BY 1 ASC`, dateFormat, interval)
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []VisitResult
	for rows.Next() {
		var v VisitResult
		if err := rows.Scan(&v.Date, &v.Visits); err != nil {
			return nil, err
		}
		results = append(results, v)
	}
	return results, rows.Err()
}

func (r *Repository) Summary(ctx context.Context) (*Summary, error) {
	var s Summary
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM manga`).Scan(&s.TotalManga)
	if err != nil {
		return nil, err
	}
	err = r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM manga_views`).Scan(&s.TotalViews)
	if err != nil {
		return nil, err
	}
	err = r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM site_visits`).Scan(&s.TotalVisits)
	if err != nil {
		return nil, err
	}
	err = r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM site_visits WHERE visited_at > CURRENT_DATE`).Scan(&s.TodayVisits)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func strVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

type TopMangaResult struct {
	Slug   string `json:"slug"`
	Views  int64  `json:"views"`
	Title  string `json:"title"`
	Image  string `json:"image"`
	Source string `json:"source"`
}

type VisitResult struct {
	Date   string `json:"date"`
	Visits int64  `json:"visits"`
}

type Summary struct {
	TotalManga  int64 `json:"totalManga"`
	TotalViews  int64 `json:"totalViews"`
	TotalVisits int64 `json:"totalVisits"`
	TodayVisits int64 `json:"todayVisits"`
}
