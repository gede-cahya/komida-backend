package analytics

import (
	"crypto/sha256"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gede-cahya/komida-backend/internal/api"
)

type Handler struct {
	repo   *Repository
	logger *slog.Logger
}

func NewHandler(repo *Repository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, logger: logger}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/analytics/track/view", h.trackView)
	mux.HandleFunc("/api/analytics/track/visit", h.trackVisit)
	mux.HandleFunc("/api/analytics/top-manga", h.topManga)
	mux.HandleFunc("/api/analytics/site-visits", h.siteVisits)
	mux.HandleFunc("/api/analytics/summary", h.summary)
}

func (h *Handler) trackView(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	slug := r.URL.Query().Get("slug")
	if slug == "" {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing slug"})
		return
	}
	if err := h.repo.TrackMangaView(r.Context(), slug); err != nil {
		h.logger.Warn("track view failed", "error", err)
	}
	api.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) trackVisit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	ipHash := hashIP(r.RemoteAddr)
	userAgent := r.Header.Get("User-Agent")
	if err := h.repo.TrackSiteVisit(r.Context(), ipHash, userAgent); err != nil {
		h.logger.Warn("track visit failed", "error", err)
	}
	api.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *Handler) topManga(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "day"
	}
	results, err := h.repo.TopManga(r.Context(), period)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, results)
}

func (h *Handler) siteVisits(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "day"
	}
	results, err := h.repo.SiteVisits(r.Context(), period)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, results)
}

func (h *Handler) summary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.repo.Summary(r.Context())
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, summary)
}

func hashIP(ip string) string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(ip)))
}
