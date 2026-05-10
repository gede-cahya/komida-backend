package shop

import (
	"log/slog"
	"net/http"

	"github.com/gede-cahya/komida-backend/internal/api"
	"github.com/gede-cahya/komida-backend/internal/middleware"
)

var defaultShopItems = []ShopItem{
	{ID: 1, ItemType: "decoration", ItemID: 1, Name: "Pop Art Action", Description: "Stand out with vibrant pop art style borders and action text!", PriceCredits: 200, PriceQRIS: 30000, PriceCrypto: "200000000000000", IsAvailable: true, ImageURL: "css:pop-art"},
	{ID: 2, ItemType: "decoration", ItemID: 2, Name: "Manga Speed Lines", Description: "Dynamic speed lines background for that manga protagonist feel.", PriceCredits: 250, PriceQRIS: 35000, PriceCrypto: "250000000000000", IsAvailable: true, ImageURL: "css:manga-speed"},
	{ID: 3, ItemType: "decoration", ItemID: 3, Name: "Cyberpunk Mecha", Description: "Futuristic HUD elements with neon glow effects.", PriceCredits: 300, PriceQRIS: 45000, PriceCrypto: "300000000000000", IsAvailable: true, ImageURL: "css:cyberpunk"},
	{ID: 4, ItemType: "decoration", ItemID: 4, Name: "Webtoon Panels", Description: "Colorful webtoon-style panel backgrounds.", PriceCredits: 250, PriceQRIS: 35000, PriceCrypto: "250000000000000", IsAvailable: true, ImageURL: "css:webtoon"},
	{ID: 5, ItemType: "decoration", ItemID: 5, Name: "Halftone Noir", Description: "Classic comic book halftone pattern with noir aesthetics.", PriceCredits: 200, PriceQRIS: 30000, PriceCrypto: "200000000000000", IsAvailable: true, ImageURL: "css:halftone"},
	{ID: 101, ItemType: "credit_pack", ItemID: 1, Name: "Starter Pack", Description: "100 Credits - Perfect for first-time buyers", PriceCredits: 0, PriceQRIS: 15000, PriceCrypto: "100000000000000", IsAvailable: true, ImageURL: "/shop/credit-pack.svg"},
	{ID: 102, ItemType: "credit_pack", ItemID: 2, Name: "Gamer Pack", Description: "550 Credits (500 + 50 Bonus) - Best Value!", PriceCredits: 0, PriceQRIS: 70000, PriceCrypto: "500000000000000", IsAvailable: true, ImageURL: "/shop/credit-pack.svg"},
}

type ShopItem struct {
	ID           int    `json:"id"`
	ItemType     string `json:"item_type"`
	ItemID       int    `json:"item_id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	PriceCredits int    `json:"price_credits"`
	PriceQRIS    int    `json:"price_qris"`
	PriceCrypto  string `json:"price_crypto"`
	IsAvailable  bool   `json:"is_available"`
	ImageURL     string `json:"image_url"`
}

type Handler struct {
	repo   *Repository
	logger *slog.Logger
}

func NewHandler(repo *Repository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, logger: logger}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/shop/items", h.items)
	mux.HandleFunc("/api/shop/credit-packs", h.creditPacks)
	mux.HandleFunc("/api/shop/decorations", h.decorations)
	mux.HandleFunc("/api/shop/purchase", middleware.JWTAuth(h.purchase))
	mux.HandleFunc("/api/user/transactions", middleware.JWTAuth(h.transactions))
}

func (h *Handler) items(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var available []ShopItem
	for _, item := range defaultShopItems {
		if item.IsAvailable {
			available = append(available, item)
		}
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"items": available})
}

func (h *Handler) creditPacks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var packs []ShopItem
	for _, item := range defaultShopItems {
		if item.IsAvailable && item.ItemType == "credit_pack" {
			packs = append(packs, item)
		}
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"credit_packs": packs})
}

func (h *Handler) decorations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var decos []ShopItem
	for _, item := range defaultShopItems {
		if item.IsAvailable && item.ItemType == "decoration" {
			decos = append(decos, item)
		}
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"decorations": decos})
}

func (h *Handler) purchase(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	u := middleware.GetUser(r)
	if u == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	var body struct {
		ItemID int `json:"item_id"`
	}
	if err := api.JSONDecode(r, &body); err != nil || body.ItemID == 0 {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "item_id is required"})
		return
	}
	result, err := h.repo.PurchaseItemWithCredits(r.Context(), u.ID, body.ItemID)
	if err != nil {
		h.logger.Warn("purchase failed", "user", u.ID, "item", body.ItemID, "error", err)
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) transactions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	u := middleware.GetUser(r)
	if u == nil {
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	txs, err := h.repo.GetUserTransactions(r.Context(), u.ID)
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]any{"transactions": txs})
}
