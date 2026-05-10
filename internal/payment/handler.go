package payment

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/gede-cahya/komida-backend/internal/api"
	"github.com/gede-cahya/komida-backend/internal/middleware"
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
	mux.HandleFunc("/api/payment/qris", middleware.JWTAuth(h.qris))
	mux.HandleFunc("/api/payment/crypto", middleware.JWTAuth(h.crypto))
	mux.HandleFunc("/api/payment/verify", middleware.JWTAuth(h.verify))
	mux.HandleFunc("/api/payment/wallet-balance", h.walletBalance)
}

func (h *Handler) qris(w http.ResponseWriter, r *http.Request) {
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
		Amount       int  `json:"amount"`
		CreditAmount int  `json:"credit_amount"`
		ItemID       *int `json:"item_id"`
	}
	if err := api.JSONDecode(r, &body); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if body.Amount <= 0 {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid amount"})
		return
	}

	qrisID := fmt.Sprintf("qris-%d-%s", time.Now().UnixMilli(), randomString(6))
	itemName := "Credits"
	if body.ItemID != nil {
		itemName = fmt.Sprintf("Shop Item %d", *body.ItemID)
	}

	var txID int
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO transactions (user_id, transaction_type, amount, currency, status, payment_method, qris_transaction_id, item_purchased_id, item_name, credit_amount, created_at, updated_at)
		VALUES ($1, 'credit_purchase', $2, 'IDR', 'pending', 'qris', $3, $4, $5, $6, NOW(), NOW())
		RETURNING id`,
		u.ID, body.Amount, qrisID, body.ItemID, itemName, body.CreditAmount).Scan(&txID)
	if err != nil {
		h.logger.Error("failed to create qris transaction", "error", err)
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create transaction"})
		return
	}

	expiresAt := time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339)
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"transaction_id": strconv.Itoa(txID),
		"qr_url":         "https://api.midtrans.com/v2/qr/" + strconv.Itoa(txID),
		"amount":         body.Amount,
		"credit_amount":  body.CreditAmount,
		"expires_at":     expiresAt,
		"instructions": []string{
			"Open your e-wallet app (GoPay, OVO, DANA, ShopeePay, etc.)",
			"Scan the QR code displayed on screen",
			"Confirm the payment amount",
			"Wait for confirmation (usually instant)",
		},
	})
}

func (h *Handler) crypto(w http.ResponseWriter, r *http.Request) {
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
		AmountWei    string `json:"amount_wei"`
		CreditAmount int    `json:"credit_amount"`
	}
	if err := api.JSONDecode(r, &body); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if body.AmountWei == "" || body.AmountWei == "0" {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid amount"})
		return
	}

	// Mock payment address generation
	paymentAddress := "0x" + randomHex(40)
	var txID int
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO transactions (user_id, transaction_type, amount, currency, status, payment_method, tx_hash, credit_amount, created_at, updated_at)
		VALUES ($1, 'credit_purchase', $2, 'BASE', 'pending', 'base_chain', $3, $4, NOW(), NOW())
		RETURNING id`,
		u.ID, body.AmountWei, paymentAddress, body.CreditAmount).Scan(&txID)
	if err != nil {
		h.logger.Error("failed to create crypto transaction", "error", err)
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create transaction"})
		return
	}

	api.WriteJSON(w, http.StatusOK, map[string]any{
		"transaction_id":         strconv.Itoa(txID),
		"payment_address":        paymentAddress,
		"amount_wei":             body.AmountWei,
		"credit_amount":          body.CreditAmount,
		"network":                "Base Mainnet",
		"expires_at":             time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339),
		"confirmations_required": 12,
	})
}

func (h *Handler) verify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	transactionID := r.URL.Query().Get("transaction_id")
	if transactionID == "" {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing transaction_id"})
		return
	}
	txID, err := strconv.Atoi(transactionID)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid transaction_id"})
		return
	}

	var status, paymentMethod, txHash string
	var creditAmount int
	var userID int
	var createdAt time.Time
	err = h.pool.QueryRow(r.Context(), `
		SELECT status, payment_method, tx_hash, credit_amount, user_id, created_at
		FROM transactions WHERE id = $1`, txID).Scan(
		&status, &paymentMethod, &txHash, &creditAmount, &userID, &createdAt)
	if err != nil {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Transaction not found"})
		return
	}

	// Auto-complete for testing after 5 seconds
	if status == "pending" && paymentMethod == "qris" && time.Since(createdAt) > 5*time.Second {
		_, _ = h.pool.Exec(r.Context(), `UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = $1`, txID)
		// Add credits
		if creditAmount > 0 && userID > 0 {
			_, _ = h.pool.Exec(r.Context(), `
				INSERT INTO user_credits (user_id, balance, base_chain_balance)
				VALUES ($1, $2, '0')
				ON CONFLICT (user_id) DO UPDATE SET balance = user_credits.balance + EXCLUDED.balance, updated_at = NOW()`,
				userID, creditAmount)
		}
		status = "completed"
	}

	api.WriteJSON(w, http.StatusOK, map[string]any{
		"status":         status,
		"payment_method": paymentMethod,
		"tx_hash":        txHash,
		"credit_amount":  creditAmount,
	})
}

func (h *Handler) walletBalance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	// Mock wallet balance
	api.WriteJSON(w, http.StatusOK, map[string]any{
		"address":     "0x" + randomHex(40),
		"balance_eth": "1.25",
		"balance_wei": "1250000000000000000",
		"usd_value":   "2500.00",
		"network":     "Base Mainnet",
	})
}

func randomString(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)[:n]
}

func randomHex(n int) string {
	b := make([]byte, n/2)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
