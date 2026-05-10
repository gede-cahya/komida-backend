package tier

import (
	"log/slog"
	"net/http"

	"github.com/gede-cahya/komida-backend/internal/api"
	"github.com/gede-cahya/komida-backend/internal/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

var tiers = []TierInfo{
	{Tier: 1, Name: "Newbie", Color: "#9CA3AF", Gradient: "from-gray-400 to-gray-500", MinXP: 0, Icon: "🌱"},
	{Tier: 2, Name: "Reader", Color: "#22C55E", Gradient: "from-green-400 to-emerald-500", MinXP: 100, Icon: "📖"},
	{Tier: 3, Name: "Bookworm", Color: "#3B82F6", Gradient: "from-blue-400 to-indigo-500", MinXP: 500, Icon: "📚"},
	{Tier: 4, Name: "Otaku", Color: "#A855F7", Gradient: "from-purple-400 to-violet-500", MinXP: 2000, Icon: "🎌"},
	{Tier: 5, Name: "Weeb Lord", Color: "#F59E0B", Gradient: "from-amber-400 to-yellow-500", MinXP: 5000, Icon: "👑"},
	{Tier: 6, Name: "Legendary", Color: "#EF4444", Gradient: "from-red-400 to-rose-500", MinXP: 15000, Icon: "🔥"},
}

type TierInfo struct {
	Tier     int    `json:"tier"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	Gradient string `json:"gradient"`
	MinXP    int    `json:"minXP"`
	Icon     string `json:"icon"`
}

type Handler struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

func NewHandler(pool *pgxpool.Pool, logger *slog.Logger) *Handler {
	return &Handler{pool: pool, logger: logger}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/user/tier", middleware.JWTAuth(h.userTier))
}

func getTierFromXP(xp int) TierInfo {
	current := tiers[0]
	for _, t := range tiers {
		if xp >= t.MinXP {
			current = t
		}
	}
	return current
}

func getNextTier(xp int) *TierInfo {
	current := getTierFromXP(xp)
	for _, t := range tiers {
		if t.Tier == current.Tier+1 {
			return &t
		}
	}
	return nil
}

func getProgressToNext(xp int) map[string]any {
	current := getTierFromXP(xp)
	next := getNextTier(xp)
	if next == nil {
		return map[string]any{"current": xp, "needed": xp, "percent": 100}
	}
	xpInTier := xp - current.MinXP
	xpNeeded := next.MinXP - current.MinXP
	percent := 100
	if xpNeeded > 0 {
		percent = (xpInTier * 100) / xpNeeded
		if percent > 100 {
			percent = 100
		}
	}
	return map[string]any{
		"current": xpInTier,
		"needed":  xpNeeded,
		"percent": percent,
	}
}

func (h *Handler) userTier(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	user := middleware.GetUser(r)
	if user == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var xp int
	err := h.pool.QueryRow(r.Context(), `SELECT xp FROM users WHERE id = $1`, user.ID).Scan(&xp)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	tierInfo := getTierFromXP(xp)
	nextTier := getNextTier(xp)
	progress := getProgressToNext(xp)

	api.WriteJSON(w, http.StatusOK, map[string]any{
		"xp":        xp,
		"tier":      tierInfo,
		"next_tier": nextTier,
		"progress":  progress,
		"all_tiers": tiers,
	})
}
