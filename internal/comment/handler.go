package comment

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/gede-cahya/komida-backend/internal/api"
	"github.com/gede-cahya/komida-backend/internal/middleware"
)

type Handler struct {
	repo   *Repository
	logger *slog.Logger
}

func NewHandler(repo *Repository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, logger: logger}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/comments", h.route)
	mux.HandleFunc("/api/comments/", h.route)
}

func (h *Handler) route(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case r.Method == http.MethodGet && path == "/api/comments":
		h.list(w, r)
	case r.Method == http.MethodGet && strings.HasPrefix(path, "/api/comments/"):
		h.list(w, r)
	case r.Method == http.MethodPost && path == "/api/comments":
		middleware.JWTAuth(h.create)(w, r)
	case r.Method == http.MethodPut && strings.HasPrefix(path, "/api/comments/"):
		middleware.JWTAuth(h.update)(w, r)
	case r.Method == http.MethodDelete && strings.HasPrefix(path, "/api/comments/"):
		middleware.JWTAuth(h.delete)(w, r)
	default:
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
	}
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimPrefix(r.URL.Path, "/api/comments/")
	if r.URL.Path == "/api/comments" {
		slug = r.URL.Query().Get("slug")
	}
	if slug == "" {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing slug"})
		return
	}
	var chapterSlug *string
	if ch := r.URL.Query().Get("chapter"); ch != "" {
		chapterSlug = &ch
	}
	comments, err := h.repo.GetBySlug(r.Context(), slug, chapterSlug)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	comments, err = h.repo.Enrich(r.Context(), comments)
	if err != nil {
		h.logger.Warn("comment enrich failed", "error", err)
	}
	api.WriteJSON(w, http.StatusOK, comments)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	slug := r.URL.Query().Get("slug")
	if slug == "" {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing slug"})
		return
	}
	var input CreateInput
	if err := api.JSONDecode(r, &input); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	u := middleware.GetUser(r)
	comment, err := h.repo.Create(r.Context(), u.ID, slug, input)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, comment)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/comments/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid comment ID"})
		return
	}
	var input UpdateInput
	if err := api.JSONDecode(r, &input); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	u := middleware.GetUser(r)
	existing, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if existing == nil {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Comment not found"})
		return
	}
	if existing.UserID != u.ID {
		api.WriteJSON(w, http.StatusForbidden, map[string]string{"error": "Unauthorized"})
		return
	}
	updated, err := h.repo.Update(r.Context(), id, input)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/comments/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid comment ID"})
		return
	}
	u := middleware.GetUser(r)
	existing, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if existing == nil {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Comment not found"})
		return
	}
	if existing.UserID != u.ID {
		api.WriteJSON(w, http.StatusForbidden, map[string]string{"error": "Unauthorized"})
		return
	}
	if err := h.repo.Delete(r.Context(), id); err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]string{"message": "Deleted"})
}
