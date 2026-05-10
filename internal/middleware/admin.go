package middleware

import (
	"context"
	"net/http"

	"github.com/gede-cahya/komida-backend/internal/api"
	"github.com/gede-cahya/komida-backend/internal/jwt"
)

func AdminOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := extractToken(r)
		if token == "" {
			api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Missing token"})
			return
		}
		payload, err := jwt.Verify(token)
		if err != nil {
			api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid token"})
			return
		}
		if payload.Role != "admin" {
			api.WriteJSON(w, http.StatusForbidden, map[string]string{"error": "Admins only"})
			return
		}
		ctx := r.Context()
		ctx = context.WithValue(ctx, UserContextKey, payload)
		next(w, r.WithContext(ctx))
	}
}
