package quest

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
	mux.HandleFunc("/api/quests", h.activeQuests)
	mux.HandleFunc("/api/user/quests", middleware.JWTAuth(h.userQuests))
	mux.HandleFunc("/api/user/quests/", middleware.JWTAuth(h.userQuestDetail))
	mux.HandleFunc("/api/admin/quests", middleware.AdminOnly(h.adminQuestsRoot))
	mux.HandleFunc("/api/admin/quests/", middleware.AdminOnly(h.adminQuestsDetail))
}

func extractQuestID(path string) (int, error) {
	// /api/user/quests/123/claim or /api/admin/quests/123
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, p := range parts {
		if p == "quests" && i+1 < len(parts) {
			return strconv.Atoi(parts[i+1])
		}
	}
	return 0, strconv.ErrRange
}

func (h *Handler) activeQuests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	quests, err := h.repo.GetActiveQuests(r.Context())
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"quests": quests})
}

func (h *Handler) userQuests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	user := middleware.GetUser(r)
	if user == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	quests, err := h.repo.GetUserQuestProgress(r.Context(), user.ID)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"quests": quests})
}

func (h *Handler) userQuestDetail(w http.ResponseWriter, r *http.Request) {
	questID, err := extractQuestID(r.URL.Path)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid quest ID"})
		return
	}
	if strings.HasSuffix(r.URL.Path, "/claim") && r.Method == http.MethodPost {
		h.claimReward(w, r, questID)
		return
	}
	api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
}

func (h *Handler) claimReward(w http.ResponseWriter, r *http.Request, questID int) {
	user := middleware.GetUser(r)
	if user == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	if err := h.repo.ClaimReward(r.Context(), user.ID, questID); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Rewards claimed!",
	})
}

func (h *Handler) adminQuestsRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		quests, err := h.repo.GetAllQuests(r.Context())
		if err != nil {
			api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		api.WriteJSON(w, http.StatusOK, map[string]any{"quests": quests})
		return
	}
	if r.Method == http.MethodPost {
		var body CreateQuestInput
		if err := api.JSONDecode(r, &body); err != nil {
			api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
			return
		}
		user := middleware.GetUser(r)
		if user == nil {
			api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
			return
		}
		quest, err := h.repo.CreateQuest(r.Context(), body, user.ID)
		if err != nil {
			api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		api.WriteJSON(w, http.StatusOK, map[string]any{"quest": quest})
		return
	}
	api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
}

func (h *Handler) adminQuestsDetail(w http.ResponseWriter, r *http.Request) {
	questID, err := extractQuestID(r.URL.Path)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid quest ID"})
		return
	}
	if r.Method == http.MethodPut {
		var body UpdateQuestInput
		if err := api.JSONDecode(r, &body); err != nil {
			api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
			return
		}
		quest, err := h.repo.UpdateQuest(r.Context(), questID, body)
		if err != nil {
			api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		api.WriteJSON(w, http.StatusOK, map[string]any{"quest": quest})
		return
	}
	if r.Method == http.MethodDelete {
		if err := h.repo.DeleteQuest(r.Context(), questID); err != nil {
			api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		api.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
		return
	}
	api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
}
