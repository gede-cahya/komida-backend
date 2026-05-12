package imageproxy

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"time"
)

var fallbackImage = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
	0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x64, 0xf8, 0xcf, 0x50,
	0x0f, 0x00, 0x03, 0x86, 0x01, 0x80, 0x5a, 0x34, 0x7d, 0x6b, 0x00, 0x00,
	0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
}

type Server struct {
	cfg      Config
	cache    *Cache
	client   *http.Client
	resolver *net.Resolver
	sem      chan struct{}
	logger   *slog.Logger
}

func NewServer(cfg Config, logger *slog.Logger) *Server {
	resolver := net.DefaultResolver
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   cfg.FetchTimeout,
			KeepAlive: 30 * time.Second,
			Resolver:  resolver,
		}).DialContext,
		TLSHandshakeTimeout: cfg.FetchTimeout,
	}
	return &Server{
		cfg:      cfg,
		cache:    NewCache(cfg.CacheDir, cfg.CacheTTL, cfg.CacheMaxBytes),
		client:   &http.Client{Timeout: cfg.FetchTimeout, Transport: transport},
		resolver: resolver,
		sem:      make(chan struct{}, cfg.MaxConcurrency),
		logger:   logger,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	s.Register(mux)
	return mux
}

func (s *Server) Register(mux *http.ServeMux) {
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/api/image/proxy", s.proxy)
}

func (s *Server) StartCleanup(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.CleanupInterval)
	go func() {
		defer ticker.Stop()
		_ = s.cache.Cleanup()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := s.cache.Cleanup(); err != nil {
					s.logger.Error("image cache cleanup failed", "error", err)
				}
			}
		}
	}()
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, `{"status":"ok","service":"imageproxy"}`)
}

func (s *Server) proxy(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		http.Error(w, "Missing url", http.StatusBadRequest)
		return
	}
	if cached, err := s.cache.Get(rawURL, false); err == nil {
		writeImage(w, cached.ContentType, "HIT", "public, max-age=604800", cached.Data)
		return
	}
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	default:
		writeFallback(w, "BUSY")
		return
	}
	parsed, err := validateImageURL(rawURL, s.cfg.AllowPrivateIPs, s.resolver)
	if err != nil {
		s.logger.Warn("blocked image proxy request", "url", rawURL, "error", err)
		if errors.Is(err, errBlockedTarget) {
			http.Error(w, "Blocked url", http.StatusBadRequest)
			return
		}
		http.Error(w, "Invalid url", http.StatusBadRequest)
		return
	}
	source := r.URL.Query().Get("source")
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, parsed.String(), nil)
	if err != nil {
		http.Error(w, "Invalid url", http.StatusBadRequest)
		return
	}
	req.Header.Set("Referer", refererFor(parsed.String(), source))
	req.Header.Set("User-Agent", browserUserAgent)
	resp, err := s.client.Do(req)
	if err != nil {
		s.logger.Warn("image upstream fetch failed", "url", rawURL, "error", err)
		s.writeStaleOrFallback(w, rawURL)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		s.logger.Warn("image upstream returned non-ok", "url", rawURL, "status", resp.StatusCode)
		s.writeStaleOrFallback(w, rawURL)
		return
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}
	if !isImageContentType(contentType) {
		s.logger.Warn("image upstream returned non-image content", "url", rawURL, "contentType", contentType)
		s.writeStaleOrFallback(w, rawURL)
		return
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, s.cfg.MaxImageBytes+1))
	if err != nil || len(body) == 0 || int64(len(body)) > s.cfg.MaxImageBytes {
		s.logger.Warn("image upstream body rejected", "url", rawURL, "size", len(body), "error", err)
		s.writeStaleOrFallback(w, rawURL)
		return
	}
	if err := s.cache.Set(rawURL, body, contentType); err != nil {
		s.logger.Warn("image cache write failed", "url", rawURL, "error", err)
	}
	writeImage(w, contentType, "MISS", "public, max-age=31536000", body)
}

func (s *Server) writeStaleOrFallback(w http.ResponseWriter, rawURL string) {
	if cached, err := s.cache.Get(rawURL, true); err == nil {
		writeImage(w, cached.ContentType, "STALE", "public, max-age=60", cached.Data)
		return
	}
	writeFallback(w, "BYPASS")
}

func writeImage(w http.ResponseWriter, contentType string, cacheStatus string, cacheControl string, body []byte) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("X-Cache", cacheStatus)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func writeFallback(w http.ResponseWriter, cacheStatus string) {
	writeImage(w, "image/png", cacheStatus, "public, max-age=60", fallbackImage)
}

func writeJSON(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}
