package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/gede-cahya/komida-backend/internal/api"
	"github.com/gede-cahya/komida-backend/internal/jwt"
)

type contextKey string

const UserContextKey contextKey = "user"

func JWTAuth(next http.HandlerFunc) http.HandlerFunc {
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
		ctx := context.WithValue(r.Context(), UserContextKey, payload)
		next(w, r.WithContext(ctx))
	}
}

func GetUser(r *http.Request) *jwt.Payload {
	v := r.Context().Value(UserContextKey)
	if v == nil {
		return nil
	}
	return v.(*jwt.Payload)
}

func extractToken(r *http.Request) string {
	// Check cookie first
	cookie, err := r.Cookie("auth_token")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}
	// Fallback to Authorization header
	bearer := r.Header.Get("Authorization")
	if strings.HasPrefix(bearer, "Bearer ") {
		return strings.TrimPrefix(bearer, "Bearer ")
	}
	return ""
}
