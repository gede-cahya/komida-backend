package comment

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) GetBySlug(ctx context.Context, slug string, chapterSlug *string) ([]Comment, error) {
	var rows pgx.Rows
	var err error
	if chapterSlug != nil {
		rows, err = r.pool.Query(ctx, `
			SELECT c.id, c.user_id, c.slug, c.chapter_slug, c.content, c.is_spoiler, c.media_url, c.created_at,
			       u.username, u.role, u.display_name, u.avatar_url, u.xp
			FROM comments c
			INNER JOIN users u ON c.user_id = u.id
			WHERE c.slug = $1 AND c.chapter_slug = $2
			ORDER BY c.created_at DESC`, slug, *chapterSlug)
	} else {
		rows, err = r.pool.Query(ctx, `
			SELECT c.id, c.user_id, c.slug, c.chapter_slug, c.content, c.is_spoiler, c.media_url, c.created_at,
			       u.username, u.role, u.display_name, u.avatar_url, u.xp
			FROM comments c
			INNER JOIN users u ON c.user_id = u.id
			WHERE c.slug = $1 AND c.chapter_slug IS NULL
			ORDER BY c.created_at DESC`, slug)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	comments := make([]Comment, 0)
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.ID, &c.UserID, &c.Slug, &c.ChapterSlug, &c.Content, &c.IsSpoiler, &c.MediaURL, &c.CreatedAt,
			&c.Username, &c.Role, &c.DisplayName, &c.AvatarURL, &c.XP); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, rows.Err()
}

func (r *Repository) Create(ctx context.Context, userID int, slug string, input CreateInput) (*Comment, error) {
	var c Comment
	err := r.pool.QueryRow(ctx, `
		INSERT INTO comments (user_id, slug, chapter_slug, content, is_spoiler, media_url)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, user_id, slug, chapter_slug, content, is_spoiler, media_url, created_at`,
		userID, slug, input.ChapterSlug, input.Content, input.IsSpoiler, input.MediaURL,
	).Scan(&c.ID, &c.UserID, &c.Slug, &c.ChapterSlug, &c.Content, &c.IsSpoiler, &c.MediaURL, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) GetByID(ctx context.Context, id int) (*Comment, error) {
	var c Comment
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, slug, chapter_slug, content, is_spoiler, media_url, created_at
		FROM comments WHERE id = $1`, id,
	).Scan(&c.ID, &c.UserID, &c.Slug, &c.ChapterSlug, &c.Content, &c.IsSpoiler, &c.MediaURL, &c.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (r *Repository) Delete(ctx context.Context, commentID int) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM comments WHERE id = $1`, commentID)
	return err
}

func (r *Repository) Update(ctx context.Context, commentID int, input UpdateInput) (*Comment, error) {
	var c Comment
	err := r.pool.QueryRow(ctx, `
		UPDATE comments SET content = $1, is_spoiler = $2, media_url = $3
		WHERE id = $4
		RETURNING id, user_id, slug, chapter_slug, content, is_spoiler, media_url, created_at`,
		input.Content, input.IsSpoiler, input.MediaURL, commentID,
	).Scan(&c.ID, &c.UserID, &c.Slug, &c.ChapterSlug, &c.Content, &c.IsSpoiler, &c.MediaURL, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) Enrich(ctx context.Context, comments []Comment) ([]Comment, error) {
	for i := range comments {
		c := &comments[i]
		// Decoration
		var decorationURL *string
		_ = r.pool.QueryRow(ctx, `
			SELECT d.image_url FROM user_decorations ud
			INNER JOIN decorations d ON ud.decoration_id = d.id
			WHERE ud.user_id = $1 AND ud.is_equipped = true LIMIT 1`, c.UserID,
		).Scan(&decorationURL)
		c.DecorationURL = decorationURL

		// Badges
		rows, err := r.pool.Query(ctx, `
			SELECT b.name, b.icon_url FROM user_badges ub
			INNER JOIN badges b ON ub.badge_id = b.id
			WHERE ub.user_id = $1 AND ub.is_equipped = true`, c.UserID)
		if err == nil {
			for rows.Next() {
				var b Badge
				_ = rows.Scan(&b.Name, &b.IconURL)
				c.Badges = append(c.Badges, b)
			}
			rows.Close()
		}

		// Tier info (simplified - hardcoded tiers matching tierService)
		c.TierInfo = tierFromXP(c.XP)
	}
	return comments, nil
}

func tierFromXP(xp int) *TierInfo {
	// Matching Komida tier system
	tiers := []TierInfo{
		{Tier: 1, Name: "Newbie", MinXP: 0, MaxXP: 99, Color: "#808080", IconURL: ""},
		{Tier: 2, Name: "Reader", MinXP: 100, MaxXP: 499, Color: "#4CAF50", IconURL: ""},
		{Tier: 3, Name: "Enthusiast", MinXP: 500, MaxXP: 999, Color: "#2196F3", IconURL: ""},
		{Tier: 4, Name: "Otaku", MinXP: 1000, MaxXP: 4999, Color: "#FF9800", IconURL: ""},
		{Tier: 5, Name: "Sensei", MinXP: 5000, MaxXP: 9999, Color: "#F44336", IconURL: ""},
		{Tier: 6, Name: "Legend", MinXP: 10000, MaxXP: 9999999, Color: "#9C27B0", IconURL: ""},
	}
	for _, t := range tiers {
		if xp >= t.MinXP && xp <= t.MaxXP {
			return &t
		}
	}
	return &tiers[0]
}
