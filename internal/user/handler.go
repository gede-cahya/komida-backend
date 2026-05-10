package user

import (
	"log/slog"
	"net/http"

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
	mux.HandleFunc("/api/user/me", middleware.JWTAuth(h.me))
	mux.HandleFunc("/api/user/profile", middleware.JWTAuth(h.updateProfile))
	mux.HandleFunc("/api/user/decorations", middleware.JWTAuth(h.decorations))
	mux.HandleFunc("/api/user/badges", middleware.JWTAuth(h.badges))
	mux.HandleFunc("/api/user/credits", middleware.JWTAuth(h.credits))
	mux.HandleFunc("/api/user/inventory", middleware.JWTAuth(h.inventory))
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	u := middleware.GetUser(r)
	if u == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	profile, err := h.repo.GetByID(r.Context(), u.ID)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if profile == nil {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "User not found"})
		return
	}
	api.WriteJSON(w, http.StatusOK, profile)
}

func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	u := middleware.GetUser(r)
	if u == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	var input UpdateProfileInput
	if err := api.JSONDecode(r, &input); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	profile, err := h.repo.UpdateProfile(r.Context(), u.ID, input)
	if err != nil {
		api.WriteJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, profile)
}

func (h *Handler) decorations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	u := middleware.GetUser(r)
	if u == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	decorations, err := h.repo.GetUserDecorations(r.Context(), u.ID)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"decorations": decorations})
}

func (h *Handler) badges(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	u := middleware.GetUser(r)
	if u == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	badges, err := h.repo.GetUserBadges(r.Context(), u.ID)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"badges": badges})
}

func (h *Handler) credits(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	u := middleware.GetUser(r)
	if u == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	credits, err := h.repo.GetUserCredits(r.Context(), u.ID)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"credits": credits})
}

func (h *Handler) inventory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	u := middleware.GetUser(r)
	if u == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	inventory, err := h.repo.GetUserInventory(r.Context(), u.ID)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"inventory": inventory})
}
