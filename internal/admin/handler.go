package admin

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gede-cahya/komida-backend/internal/api"
	"github.com/gede-cahya/komida-backend/internal/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

func NewHandler(pool *pgxpool.Pool, logger *slog.Logger) *Handler {
	return &Handler{pool: pool, logger: logger}
}

func (h *Handler) Register(mux *http.ServeMux) {
	// Users
	mux.HandleFunc("/api/admin/users", middleware.AdminOnly(h.users))
	// Manga
	mux.HandleFunc("/api/admin/manga", middleware.AdminOnly(h.manga))
	mux.HandleFunc("/api/admin/manga/", middleware.AdminOnly(h.mangaDetail))
	mux.HandleFunc("/api/admin/manga/update-all", middleware.AdminOnly(h.updateAllManga))
	mux.HandleFunc("/api/admin/manga/fix-images", middleware.AdminOnly(h.fixCorruptedImages))
	// Comments
	mux.HandleFunc("/api/admin/comments", middleware.AdminOnly(h.comments))
	// Active users
	mux.HandleFunc("/api/admin/active-users", middleware.AdminOnly(h.activeUsers))
	mux.HandleFunc("/api/admin/stats/summary", middleware.AdminOnly(h.statsSummary))
	mux.HandleFunc("/api/admin/stats/visits", middleware.AdminOnly(h.statsVisits))
	mux.HandleFunc("/api/admin/stats/popular", middleware.AdminOnly(h.statsPopular))
	// Announcements
	mux.HandleFunc("/api/admin/announcements", middleware.AdminOnly(h.announcements))
	mux.HandleFunc("/api/admin/announcements/", middleware.AdminOnly(h.announcementDetail))
	mux.HandleFunc("/api/announcements/active", h.activeAnnouncement)
	// Bug reports
	mux.HandleFunc("/api/admin/bug-reports", middleware.AdminOnly(h.bugReports))
	mux.HandleFunc("/api/admin/bug-reports/", middleware.AdminOnly(h.bugReportDetail))
	mux.HandleFunc("/api/bug-reports", h.createBugReport)
	// System health
	mux.HandleFunc("/api/admin/system/health", middleware.AdminOnly(h.systemHealth))
}

func intQuery(r *http.Request, key string, fallback int) int {
	val := r.URL.Query().Get(key)
	if val == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(val)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
}

func intervalForPeriod(period string) (string, string) {
	switch period {
	case "week":
		return "7 days", "YYYY-MM-DD"
	case "month":
		return "30 days", "YYYY-MM-DD"
	default:
		return "1 day", "HH24:00"
	}
}

func adminImageURL(raw string) string {
	if strings.HasPrefix(raw, "http://") {
		raw = "https://" + raw[7:]
	}
	raw = strings.Replace(raw, "https://v3.kiryuu.to/", "https://v5.kiryuu.to/", 1)
	raw = strings.Replace(raw, "https://v4.kiryuu.to/", "https://v5.kiryuu.to/", 1)
	return raw
}

func (h *Handler) statsSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var totalManga, totalViews, totalVisits, todayVisits int64
	if err := h.pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM manga`).Scan(&totalManga); err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if err := h.pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM manga_views`).Scan(&totalViews); err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if err := h.pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM site_visits`).Scan(&totalVisits); err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if err := h.pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM site_visits WHERE visited_at > CURRENT_DATE`).Scan(&todayVisits); err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"totalManga": totalManga, "totalViews": totalViews,
		"totalVisits": totalVisits, "todayVisits": todayVisits,
	})
}

func (h *Handler) statsVisits(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	interval, format := intervalForPeriod(r.URL.Query().Get("period"))
	query := fmt.Sprintf(`
		SELECT to_char(visited_at, '%s') as date, COUNT(id) as visits
		FROM site_visits
		WHERE visited_at > NOW() - INTERVAL '%s'
		GROUP BY 1
		ORDER BY 1 ASC`, format, interval)
	rows, err := h.pool.Query(r.Context(), query)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()
	var visits []map[string]any
	for rows.Next() {
		var date string
		var count int64
		if err := rows.Scan(&date, &count); err != nil {
			api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		visits = append(visits, map[string]any{"date": date, "visits": count})
	}
	api.WriteJSON(w, http.StatusOK, visits)
}

func (h *Handler) statsPopular(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	interval, _ := intervalForPeriod(r.URL.Query().Get("period"))
	rows, err := h.pool.Query(r.Context(), `
		SELECT mv.manga_slug, COUNT(*) as views
		FROM manga_views mv
		WHERE mv.viewed_at > NOW() - $1::INTERVAL
		GROUP BY mv.manga_slug
		ORDER BY views DESC
		LIMIT 10`, interval)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()
	var results []map[string]any
	for rows.Next() {
		var slug string
		var views int64
		if err := rows.Scan(&slug, &views); err != nil {
			api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		var title, image, source string
		_ = h.pool.QueryRow(r.Context(), `
			SELECT title, image, source FROM manga
			WHERE lower(title) = lower(replace($1, '-', ' '))
			   OR lower(link) LIKE lower('%' || $1 || '%')
			ORDER BY last_updated DESC
			LIMIT 1`, slug).Scan(&title, &image, &source)
		results = append(results, map[string]any{
			"slug": slug, "views": views, "title": title,
			"image": adminImageURL(image), "source": source,
		})
	}
	api.WriteJSON(w, http.StatusOK, results)
}

func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	page := intQuery(r, "page", 1)
	limit := intQuery(r, "limit", 20)
	search := r.URL.Query().Get("search")
	offset := (page - 1) * limit

	var rows pgx.Rows
	var err error
	var total int64

	if search != "" {
		rows, err = h.pool.Query(r.Context(), `
			SELECT id, username, role, is_banned, created_at FROM users
			WHERE username ILIKE $1
			ORDER BY created_at DESC LIMIT $2 OFFSET $3`, "%"+search+"%", limit, offset)
		_ = h.pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM users WHERE username ILIKE $1`, "%"+search+"%").Scan(&total)
	} else {
		rows, err = h.pool.Query(r.Context(), `
			SELECT id, username, role, is_banned, created_at FROM users
			ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
		_ = h.pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM users`).Scan(&total)
	}
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	var users []map[string]any
	for rows.Next() {
		var id int
		var username, role string
		var isBanned bool
		var createdAt interface{}
		if err := rows.Scan(&id, &username, &role, &isBanned, &createdAt); err != nil {
			continue
		}
		users = append(users, map[string]any{
			"id": id, "username": username, "role": role,
			"is_banned": isBanned, "created_at": createdAt,
		})
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"users": users, "total": total, "page": page, "limit": limit,
		"totalPages": (total + int64(limit) - 1) / int64(limit),
	})
}

func (h *Handler) manga(w http.ResponseWriter, r *http.Request) {
	page := intQuery(r, "page", 1)
	limit := intQuery(r, "limit", 20)
	search := r.URL.Query().Get("search")
	source := r.URL.Query().Get("source")
	offset := (page - 1) * limit

	var query string
	var args []interface{}
	if search != "" && source != "" {
		query = `SELECT id, title, image, source, chapter, is_trending, last_updated FROM manga
			WHERE title ILIKE $1 AND source = $2 ORDER BY last_updated DESC LIMIT $3 OFFSET $4`
		args = []interface{}{"%" + search + "%", source, limit, offset}
	} else if search != "" {
		query = `SELECT id, title, image, source, chapter, is_trending, last_updated FROM manga
			WHERE title ILIKE $1 ORDER BY last_updated DESC LIMIT $2 OFFSET $3`
		args = []interface{}{"%" + search + "%", limit, offset}
	} else if source != "" {
		query = `SELECT id, title, image, source, chapter, is_trending, last_updated FROM manga
			WHERE source = $1 ORDER BY last_updated DESC LIMIT $2 OFFSET $3`
		args = []interface{}{source, limit, offset}
	} else {
		query = `SELECT id, title, image, source, chapter, is_trending, last_updated FROM manga
			ORDER BY last_updated DESC LIMIT $1 OFFSET $2`
		args = []interface{}{limit, offset}
	}

	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	var manga []map[string]any
	for rows.Next() {
		var id int
		var title, image, source, chapter string
		var isTrending bool
		var lastUpdated interface{}
		if err := rows.Scan(&id, &title, &image, &source, &chapter, &isTrending, &lastUpdated); err != nil {
			continue
		}
		manga = append(manga, map[string]any{
			"id": id, "title": title, "image": image, "source": source,
			"chapter": chapter, "is_trending": isTrending, "last_updated": lastUpdated,
		})
	}

	var total int64
	_ = h.pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM manga`).Scan(&total)

	api.WriteJSON(w, http.StatusOK, map[string]any{
		"manga": manga, "total": total, "page": page, "limit": limit,
		"totalPages": (total + int64(limit) - 1) / int64(limit),
	})
}

func (h *Handler) mangaDetail(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/admin/manga/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}
	if r.Method == http.MethodPut {
		h.updateManga(w, r, id)
		return
	}
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var title, image, source, chapter, previousChapter, typ, span, link, genres, chapters, synopsis, status, author string
	var rating, popularity, isTrending int
	var lastUpdated interface{}
	err = h.pool.QueryRow(r.Context(), `
		SELECT id, title, image, source, chapter, previous_chapter, type, span, link, genres, chapters, synopsis, rating, status, author, is_trending, popularity, last_updated
		FROM manga WHERE id = $1`, id).Scan(
		&id, &title, &image, &source, &chapter, &previousChapter, &typ, &span, &link, &genres, &chapters, &synopsis, &rating, &status, &author, &isTrending, &popularity, &lastUpdated)
	if err != nil {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Manga not found"})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"id": id, "title": title, "image": image, "source": source, "chapter": chapter,
		"previous_chapter": previousChapter, "type": typ, "span": span, "link": link,
		"genres": genres, "chapters": chapters, "synopsis": synopsis, "rating": rating,
		"status": status, "author": author, "is_trending": isTrending, "popularity": popularity,
		"last_updated": lastUpdated,
	})
}

func (h *Handler) updateManga(w http.ResponseWriter, r *http.Request, id int) {
	var body map[string]any
	if err := api.JSONDecode(r, &body); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	delete(body, "id")
	if len(body) == 0 {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "No fields to update"})
		return
	}
	fields := []string{}
	args := []any{id}
	idx := 2
	for key, val := range body {
		fields = append(fields, fmt.Sprintf("%s = $%d", key, idx))
		args = append(args, val)
		idx++
	}
	query := fmt.Sprintf("UPDATE manga SET %s WHERE id = $1 RETURNING id, title, image, source, chapter, type, span, link, genres, synopsis, rating, status, author, is_trending, popularity, last_updated", strings.Join(fields, ", "))
	var title, image, source, chapter, typ, span, link, genres, synopsis, status, author string
	var rating, popularity, isTrending int
	var lastUpdated interface{}
	err := h.pool.QueryRow(r.Context(), query, args...).Scan(
		&id, &title, &image, &source, &chapter, &typ, &span, &link, &genres, &synopsis, &rating, &status, &author, &isTrending, &popularity, &lastUpdated)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"id": id, "title": title, "image": image, "source": source, "chapter": chapter,
		"type": typ, "span": span, "link": link, "genres": genres, "synopsis": synopsis,
		"rating": rating, "status": status, "author": author,
		"is_trending": isTrending, "popularity": popularity, "last_updated": lastUpdated,
	})
}

func (h *Handler) comments(w http.ResponseWriter, r *http.Request) {
	page := intQuery(r, "page", 1)
	limit := intQuery(r, "limit", 20)
	offset := (page - 1) * limit

	rows, err := h.pool.Query(r.Context(), `
		SELECT c.id, c.user_id, c.slug, c.chapter_slug, c.content, c.is_spoiler, c.media_url, c.created_at,
		       u.username, u.avatar_url
		FROM comments c
		LEFT JOIN users u ON c.user_id = u.id
		ORDER BY c.created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	var comments []map[string]any
	for rows.Next() {
		var id, userID int
		var slug, content string
		var chapterSlug, mediaURL, username, avatarURL *string
		var isSpoiler bool
		var createdAt interface{}
		if err := rows.Scan(&id, &userID, &slug, &chapterSlug, &content, &isSpoiler, &mediaURL, &createdAt, &username, &avatarURL); err != nil {
			continue
		}
		comments = append(comments, map[string]any{
			"id": id, "user_id": userID, "slug": slug, "chapter_slug": chapterSlug,
			"content": content, "is_spoiler": isSpoiler, "media_url": mediaURL,
			"created_at": createdAt, "username": username, "avatar_url": avatarURL,
		})
	}

	var total int64
	_ = h.pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM comments`).Scan(&total)

	api.WriteJSON(w, http.StatusOK, map[string]any{
		"comments": comments, "total": total, "page": page, "limit": limit,
		"totalPages": (total + int64(limit) - 1) / int64(limit),
	})
}

func (h *Handler) activeUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(), `
		SELECT u.id, u.username, u.display_name, u.avatar_url, u.xp, d.xp_gained, d.actions_count
		FROM daily_user_activity d
		INNER JOIN users u ON d.user_id = u.id
		WHERE d.date = CURRENT_DATE::text
		ORDER BY d.xp_gained DESC LIMIT 10`)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	var users []map[string]any
	for rows.Next() {
		var id int
		var username string
		var displayName, avatarURL *string
		var xp, xpGained, actionsCount int
		if err := rows.Scan(&id, &username, &displayName, &avatarURL, &xp, &xpGained, &actionsCount); err != nil {
			continue
		}
		users = append(users, map[string]any{
			"id": id, "username": username, "display_name": displayName,
			"avatar_url": avatarURL, "xp": xp, "xp_gained": xpGained, "actions_count": actionsCount,
		})
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"activeUsers": users})
}

func (h *Handler) announcements(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		h.createAnnouncement(w, r)
		return
	}
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	rows, err := h.pool.Query(r.Context(), `
		SELECT a.id, a.content, a.type, a.image_url, a.is_active, a.created_at, a.admin_id,
		       u.username, u.display_name, u.avatar_url
		FROM announcements a
		LEFT JOIN users u ON a.admin_id = u.id
		ORDER BY a.created_at DESC`)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()
	var announcements []map[string]any
	for rows.Next() {
		var id int
		var adminID *int
		var content, typ string
		var imageURL *string
		var username, displayName, avatarURL *string
		var isActive bool
		var createdAt interface{}
		if err := rows.Scan(&id, &content, &typ, &imageURL, &isActive, &createdAt, &adminID, &username, &displayName, &avatarURL); err != nil {
			continue
		}
		announcements = append(announcements, map[string]any{
			"id": id, "content": content, "type": typ, "image_url": imageURL,
			"is_active": isActive, "created_at": createdAt, "admin_id": adminID,
			"admin": map[string]any{"username": username, "display_name": displayName, "avatar_url": avatarURL},
		})
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"announcements": announcements})
}

func (h *Handler) announcementDetail(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/admin/announcements/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}
	switch r.Method {
	case http.MethodPut:
		h.updateAnnouncement(w, r, id)
		return
	case http.MethodDelete:
		if _, err := h.pool.Exec(r.Context(), `DELETE FROM announcements WHERE id = $1`, id); err != nil {
			api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		api.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
		return
	case http.MethodGet:
	default:
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var content, typ string
	var imageURL *string
	var isActive bool
	var createdAt interface{}
	var adminID *int
	err = h.pool.QueryRow(r.Context(), `SELECT content, type, image_url, is_active, created_at, admin_id FROM announcements WHERE id = $1`, id).Scan(&content, &typ, &imageURL, &isActive, &createdAt, &adminID)
	if err != nil {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Announcement not found"})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"id": id, "content": content, "type": typ, "image_url": imageURL,
		"is_active": isActive, "created_at": createdAt, "admin_id": adminID,
	})
}

type announcementInput struct {
	Content  string  `json:"content"`
	Type     string  `json:"type"`
	ImageURL *string `json:"image_url"`
	IsActive *bool   `json:"is_active"`
}

func (h *Handler) createAnnouncement(w http.ResponseWriter, r *http.Request) {
	var input announcementInput
	if err := api.JSONDecode(r, &input); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if strings.TrimSpace(input.Content) == "" {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Content is required"})
		return
	}
	if input.Type == "" {
		input.Type = "info"
	}
	u := middleware.GetUser(r)
	var id int
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO announcements (content, type, image_url, is_active, admin_id)
		VALUES ($1, $2, $3, true, $4)
		RETURNING id`, input.Content, input.Type, input.ImageURL, u.ID).Scan(&id)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"announcement": map[string]any{"id": id}})
}

func (h *Handler) updateAnnouncement(w http.ResponseWriter, r *http.Request, id int) {
	var input announcementInput
	if err := api.JSONDecode(r, &input); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if input.IsActive != nil && input.Content == "" && input.Type == "" && input.ImageURL == nil {
		_, err := h.pool.Exec(r.Context(), `UPDATE announcements SET is_active = $1 WHERE id = $2`, *input.IsActive, id)
		if err != nil {
			api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		api.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
		return
	}
	if input.Type == "" {
		input.Type = "info"
	}
	_, err := h.pool.Exec(r.Context(), `
		UPDATE announcements
		SET content = COALESCE(NULLIF($1, ''), content),
		    type = COALESCE(NULLIF($2, ''), type),
		    image_url = COALESCE($3, image_url)
		WHERE id = $4`, input.Content, input.Type, input.ImageURL, id)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) activeAnnouncement(w http.ResponseWriter, r *http.Request) {
	var id int
	var content, typ string
	var imageURL *string
	var createdAt interface{}
	err := h.pool.QueryRow(r.Context(), `SELECT id, content, type, image_url, created_at FROM announcements WHERE is_active = true ORDER BY created_at DESC LIMIT 1`).Scan(&id, &content, &typ, &imageURL, &createdAt)
	if err != nil {
		api.WriteJSON(w, http.StatusOK, map[string]any{"announcement": nil})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"announcement": map[string]any{
		"id": id, "content": content, "type": typ, "image_url": imageURL, "created_at": createdAt,
	}})
}

func (h *Handler) bugReports(w http.ResponseWriter, r *http.Request) {
	page := intQuery(r, "page", 1)
	limit := intQuery(r, "limit", 20)
	status := r.URL.Query().Get("status")
	offset := (page - 1) * limit

	var query string
	var args []interface{}
	if status != "" && status != "all" {
		query = `SELECT id, title, description, steps, page_url, email, status, created_at FROM bug_reports
			WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
		args = []interface{}{status, limit, offset}
	} else {
		query = `SELECT id, title, description, steps, page_url, email, status, created_at FROM bug_reports
			ORDER BY created_at DESC LIMIT $1 OFFSET $2`
		args = []interface{}{limit, offset}
	}

	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	var reports []map[string]any
	for rows.Next() {
		var id int
		var title, description string
		var steps, pageURL, email, status string
		var createdAt interface{}
		if err := rows.Scan(&id, &title, &description, &steps, &pageURL, &email, &status, &createdAt); err != nil {
			continue
		}
		reports = append(reports, map[string]any{
			"id": id, "title": title, "description": description, "steps": steps,
			"page_url": pageURL, "email": email, "status": status, "created_at": createdAt,
		})
	}

	var total int64
	_ = h.pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM bug_reports`).Scan(&total)

	api.WriteJSON(w, http.StatusOK, map[string]any{
		"reports": reports, "total": total, "page": page, "limit": limit,
		"totalPages": (total + int64(limit) - 1) / int64(limit),
	})
}

func (h *Handler) bugReportDetail(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/admin/bug-reports/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}
	var title, description, status string
	var steps, pageURL, email *string
	var createdAt interface{}
	err = h.pool.QueryRow(r.Context(), `SELECT title, description, steps, page_url, email, status, created_at FROM bug_reports WHERE id = $1`, id).Scan(&title, &description, &steps, &pageURL, &email, &status, &createdAt)
	if err != nil {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Report not found"})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"id": id, "title": title, "description": description, "steps": steps,
		"page_url": pageURL, "email": email, "status": status, "created_at": createdAt,
	})
}

func (h *Handler) createBugReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var input struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Steps       string `json:"steps"`
		PageURL     string `json:"page_url"`
		Email       string `json:"email"`
	}
	if err := api.JSONDecode(r, &input); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if input.Title == "" || input.Description == "" {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Title and description required"})
		return
	}
	var id int
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO bug_reports (title, description, steps, page_url, email, status)
		VALUES ($1, $2, $3, $4, $5, 'pending')
		RETURNING id`, input.Title, input.Description, input.Steps, input.PageURL, input.Email).Scan(&id)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "report": map[string]any{"id": id}})
}

func (h *Handler) systemHealth(w http.ResponseWriter, r *http.Request) {
	var dbStatus string
	var dbLatency int64
	start := time.Now()
	err := h.pool.Ping(r.Context())
	if err != nil {
		dbStatus = "error"
	} else {
		dbStatus = "connected"
		dbLatency = time.Since(start).Milliseconds()
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"status":    "online",
		"database":  map[string]any{"status": dbStatus, "latency": dbLatency},
		"scrapers":  map[string]any{"status": "idle", "message": "Scrapers run on-demand"},
		"timestamp": time.Now().UTC(),
	})
}

func (h *Handler) updateAllManga(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	// Trigger background update via goroutine
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		h.logger.Info("[UpdateAll] Starting background manga update")
		rows, err := h.pool.Query(ctx, `SELECT id, title, source, link FROM manga`)
		if err != nil {
			h.logger.Error("[UpdateAll] Failed to fetch manga list", "error", err)
			return
		}
		defer rows.Close()
		var updated, failed int
		for rows.Next() {
			var id int
			var title, source, link string
			if err := rows.Scan(&id, &title, &source, &link); err != nil {
				continue
			}
			// Throttle to avoid overwhelming target servers
			time.Sleep(2 * time.Second)
			// Note: actual scraping would require scraper provider integration
			// For now, just update last_updated timestamp
			_, _ = h.pool.Exec(ctx, `UPDATE manga SET last_updated = NOW() WHERE id = $1`, id)
			updated++
		}
		h.logger.Info("[UpdateAll] Completed", "updated", updated, "failed", failed)
	}()
	api.WriteJSON(w, http.StatusOK, map[string]any{"message": "Update started in background"})
}

func (h *Handler) fixCorruptedImages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		h.logger.Info("[FixImages] Starting background image fix")
		// Find manga with empty or data:image images
		rows, err := h.pool.Query(ctx, `
			SELECT id, title, source, link FROM manga
			WHERE image = '' OR image LIKE 'data:image%'`)
		if err != nil {
			h.logger.Error("[FixImages] Failed to fetch corrupted images", "error", err)
			return
		}
		defer rows.Close()
		var updated, failed int
		for rows.Next() {
			var id int
			var title, source, link string
			if err := rows.Scan(&id, &title, &source, &link); err != nil {
				continue
			}
			// Throttle
			time.Sleep(600 * time.Millisecond)
			// Mark for re-scrape by clearing image
			_, _ = h.pool.Exec(ctx, `UPDATE manga SET image = '' WHERE id = $1`, id)
			updated++
		}
		h.logger.Info("[FixImages] Completed", "updated", updated, "failed", failed)
	}()
	api.WriteJSON(w, http.StatusOK, map[string]any{"message": "Fix corrupted images started in background"})
}
