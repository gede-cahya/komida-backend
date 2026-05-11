package auth

import (
	"log/slog"
	"net/http"

	"github.com/gede-cahya/komida-backend/internal/api"
	"github.com/gede-cahya/komida-backend/internal/jwt"
	"github.com/gede-cahya/komida-backend/internal/user"
)

type Handler struct {
	repo   *user.Repository
	logger *slog.Logger
}

func NewHandler(repo *user.Repository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, logger: logger}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/auth/register", h.register)
	mux.HandleFunc("/api/auth/login", h.login)
	mux.HandleFunc("/api/auth/logout", h.logout)
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var input user.RegisterInput
	if err := api.JSONDecode(r, &input); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if input.Username == "" || input.Password == "" {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Username and password required"})
		return
	}

	u, err := h.repo.Create(r.Context(), input.Username, input.Password, "user")
	if err != nil {
		api.WriteJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}

	token, err := jwt.Create(jwt.Payload{ID: u.ID, Username: u.Username, Role: u.Role})
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Token generation failed"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400,
	})

	api.WriteJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user": map[string]any{
			"id":       u.ID,
			"username": u.Username,
			"role":     u.Role,
		},
	})
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var input user.LoginInput
	if err := api.JSONDecode(r, &input); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}

	u, err := h.repo.VerifyPassword(r.Context(), input.Username, input.Password)
	if err != nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	token, err := jwt.Create(jwt.Payload{ID: u.ID, Username: u.Username, Role: u.Role})
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Token generation failed"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400,
	})

	api.WriteJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user": map[string]any{
			"id":       u.ID,
			"username": u.Username,
			"role":     u.Role,
		},
	})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	api.WriteJSON(w, http.StatusOK, map[string]string{"message": "Logged out"})
}
