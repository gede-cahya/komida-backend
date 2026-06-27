package middleware

import (
	"net/http"
	"os"
	"strings"

	"github.com/gede-cahya/komida-backend/internal/api"
)

var allowedOrigins = []string{
	"localhost", "127.0.0.1", "komida.site", "vercel.app",
}

var publicPaths = []string{
	"/health", "/api/uploads", "/api/image/proxy",
	"/api/trending", "/api/recent", "/api/popular",
	"/api/genres", "/api/manga", "/public/files",
}

func APIKeyGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		if isPublicPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = r.Header.Get("Referer")
		}
		if isAllowedOrigin(origin) {
			next.ServeHTTP(w, r)
			return
		}
		apiKey := r.Header.Get("x-api-key")
		expectedKey := os.Getenv("API_KEY")
		if expectedKey == "" {
			api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "API key not configured"})
			return
		}
		if apiKey != expectedKey {
			api.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid or missing API key"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isPublicPath(path string) bool {
	for _, p := range publicPaths {
		if strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

func isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	for _, allowed := range allowedOrigins {
		if strings.Contains(origin, allowed) {
			return true
		}
	}
	return false
}
