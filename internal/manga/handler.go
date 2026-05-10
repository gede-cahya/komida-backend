package manga

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
)

type Handler struct {
	repo   *Repository
	logger *slog.Logger
}

func NewHandler(repo *Repository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, logger: logger}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/trending", h.trending)
	mux.HandleFunc("/api/recent", h.recent)
	mux.HandleFunc("/api/popular", h.popular)
	mux.HandleFunc("/api/genres", h.genres)
	mux.HandleFunc("/api/genres/", h.genre)
	mux.HandleFunc("/api/manga/search", h.search)
	mux.HandleFunc("/api/manga/slug/", h.slug)
}

func (h *Handler) trending(w http.ResponseWriter, r *http.Request) {
	items, err := h.repo.Trending(r.Context())
	h.writeResult(w, items, err)
}

func (h *Handler) recent(w http.ResponseWriter, r *http.Request) {
	items, err := h.repo.Recent(r.Context())
	h.writeResult(w, items, err)
}

func (h *Handler) popular(w http.ResponseWriter, r *http.Request) {
	page := intQuery(r, "page", 1)
	items, err := h.repo.Popular(r.Context(), page, 24)
	h.writeResult(w, items, err)
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeJSON(w, http.StatusOK, map[string]any{"results": []SearchItem{}})
		return
	}
	items, err := h.repo.Search(r.Context(), query)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": items})
}

func (h *Handler) slug(w http.ResponseWriter, r *http.Request) {
	slug := pathTail(r.URL.Path, "/api/manga/slug/")
	if slug == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Manga not found"})
		return
	}
	detail, err := h.repo.BySlug(r.Context(), slug)
	if err != nil {
		if IsNotFound(err) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Manga not found"})
			return
		}
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (h *Handler) genres(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/genres" {
		h.genre(w, r)
		return
	}
	genres, err := h.repo.Genres(r.Context())
	h.writeResult(w, genres, err)
}

func (h *Handler) genre(w http.ResponseWriter, r *http.Request) {
	genre := pathTail(r.URL.Path, "/api/genres/")
	if genre == "" {
		writeJSON(w, http.StatusOK, []SearchItem{})
		return
	}
	page := intQuery(r, "page", 1)
	items, err := h.repo.ByGenre(r.Context(), genre, page, 24)
	h.writeResult(w, items, err)
}

func (h *Handler) writeResult(w http.ResponseWriter, data any, err error) {
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (h *Handler) writeError(w http.ResponseWriter, err error) {
	if errors.Is(err, http.ErrAbortHandler) {
		return
	}
	h.logger.Error("manga handler failed", "error", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func intQuery(r *http.Request, key string, fallback int) int {
	value := r.URL.Query().Get(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
}

func pathTail(path string, prefix string) string {
	if len(path) < len(prefix) || path[:len(prefix)] != prefix {
		return ""
	}
	return path[len(prefix):]
}
