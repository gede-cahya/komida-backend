package web3wallet

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/gede-cahya/komida-backend/internal/api"
	"github.com/gede-cahya/komida-backend/internal/jwt"
	"github.com/gede-cahya/komida-backend/internal/user"
)

type Handler struct {
	repo   UserRepo
	logger *slog.Logger
}

type UserRepo interface {
	GetOrCreateByWallet(ctx context.Context, walletAddress string) (*user.Profile, error)
}

func NewHandler(repo UserRepo, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, logger: logger}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/auth/nonce", h.nonce)
	mux.HandleFunc("/api/auth/verify-wallet", h.verifyWallet)
}

func (h *Handler) nonce(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate nonce"})
		return
	}
	api.WriteJSON(w, http.StatusOK, map[string]string{"nonce": hex.EncodeToString(nonce)})
}

func (h *Handler) verifyWallet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	var body struct {
		Message   string `json:"message"`
		Signature string `json:"signature"`
	}
	if err := api.JSONDecode(r, &body); err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}

	// Extract address from SIWE message
	address, err := extractAddressFromMessage(body.Message)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid SIWE message"})
		return
	}

	// Verify signature
	if err := verifySignature(address, body.Message, body.Signature); err != nil {
		h.logger.Warn("wallet signature verification failed", "address", address, "error", err)
		api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid Web3 Signature"})
		return
	}

	// Get or create user by wallet address
	user, err := h.repo.GetOrCreateByWallet(r.Context(), address)
	if err != nil {
		h.logger.Error("failed to get/create wallet user", "error", err)
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to process wallet user"})
		return
	}

	token, err := jwt.Create(jwt.Payload{ID: user.ID, Username: user.Username, Role: user.Role})
	if err != nil {
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create token"})
		return
	}

	api.WriteJSON(w, http.StatusOK, map[string]any{
		"user":    user,
		"token":   token,
		"success": true,
	})
}

func extractAddressFromMessage(msg string) (string, error) {
	// SIWE format: "... wants you to sign in with your Ethereum account:\n0x...\n..."
	re := regexp.MustCompile(`0x[a-fA-F0-9]{40}`)
	matches := re.FindAllString(msg, -1)
	if len(matches) == 0 {
		return "", fmt.Errorf("no address found in message")
	}
	return matches[0], nil
}

func verifySignature(address, message, signature string) error {
	addr := common.HexToAddress(address)
	if addr == common.HexToAddress("0x0") {
		return fmt.Errorf("invalid address")
	}

	sigBytes, err := hex.DecodeString(strings.TrimPrefix(signature, "0x"))
	if err != nil {
		return err
	}

	if len(sigBytes) != 65 {
		return fmt.Errorf("invalid signature length")
	}

	// Adjust recovery id
	if sigBytes[64] >= 27 {
		sigBytes[64] -= 27
	}

	// EIP-191 prefix
	prefix := fmt.Sprintf("\x19Ethereum Signed Message:\n%d", len(message))
	fullMsg := prefix + message
	hash := crypto.Keccak256Hash([]byte(fullMsg))

	pubKey, err := crypto.SigToPub(hash.Bytes(), sigBytes)
	if err != nil {
		return err
	}

	recoveredAddr := crypto.PubkeyToAddress(*pubKey)
	if recoveredAddr != addr {
		return fmt.Errorf("signature address mismatch")
	}

	return nil
}
