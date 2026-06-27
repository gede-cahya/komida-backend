package imageproxy

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gede-cahya/komida-backend/internal/scraper"
	"github.com/gede-cahya/komida-backend/internal/scraper/providers"
	"github.com/jackc/pgx/v5/pgxpool"
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
	pool     *pgxpool.Pool
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

	target, _ := url.Parse("http://localhost:4000")
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.Host = target.Host
		},
	}
	mux.Handle("/public/files/", proxy)
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

func (s *Server) SetDB(pool *pgxpool.Pool) {
	s.pool = pool
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS komida_image_shares (
			url_hash VARCHAR(64) PRIMARY KEY,
			share_token VARCHAR(255) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		s.logger.Error("failed to create komida_image_shares table", "error", err)
	} else {
		s.logger.Info("komida_image_shares table initialized")
	}
}

func hashURL(rawURL string) string {
	h := md5.New()
	h.Write([]byte(rawURL))
	return hex.EncodeToString(h.Sum(nil))
}

func (s *Server) proxy(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		http.Error(w, "Missing url", http.StatusBadRequest)
		return
	}
	originalURL := rawURL
	rawURL = rerouteUpstreamURL(rawURL)

	// 1. Check if we already have a 9Drive share token for this URL
	if s.pool != nil {
		var shareToken string
		hash := hashURL(rawURL)
		err := s.pool.QueryRow(r.Context(), "SELECT share_token FROM komida_image_shares WHERE url_hash = $1", hash).Scan(&shareToken)
		if err == nil && shareToken != "" {
			http.Redirect(w, r, "/public/files/"+shareToken+"/preview", http.StatusMovedPermanently)
			return
		}
	} else {
		hash := hashURL(rawURL)
		token := getNineDriveToken()
		ninedriveClient := &http.Client{Timeout: 60 * time.Second}
		if fileId, err := findIn9Drive(r.Context(), ninedriveClient, token, hash); err == nil && fileId != "" {
			if shareToken, err := create9DriveShare(r.Context(), ninedriveClient, token, fileId); err == nil && shareToken != "" {
				http.Redirect(w, r, "/public/files/"+shareToken+"/preview", http.StatusMovedPermanently)
				return
			}
		}
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
		newURL, healErr := s.healMangaCover(r.Context(), originalURL)
		if healErr == nil && newURL != "" {
			http.Redirect(w, r, "/api/image/proxy?url="+url.QueryEscape(newURL)+"&source="+source, http.StatusMovedPermanently)
			return
		} else if healErr != nil {
			s.logger.Warn("self-heal cover failed", "url", originalURL, "error", healErr)
		}
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

	// 2. Upload to 9Drive and share it
	hash := hashURL(rawURL)
	ext := extensionFromMime(contentType)
	filename := hash + ext
	token := getNineDriveToken()
	ninedriveClient := &http.Client{Timeout: 60 * time.Second}
	bgCtx := context.Background()

	fileId, uploadErr := uploadTo9Drive(bgCtx, ninedriveClient, token, filename, contentType, body)
	if uploadErr == nil {
		shareToken, shareErr := create9DriveShare(bgCtx, ninedriveClient, token, fileId)
		if shareErr == nil {
			if s.pool != nil {
				_, dbErr := s.pool.Exec(bgCtx, "INSERT INTO komida_image_shares (url_hash, share_token) VALUES ($1, $2) ON CONFLICT (url_hash) DO NOTHING", hash, shareToken)
				if dbErr != nil {
					s.logger.Error("failed to insert share mapping", "error", dbErr)
				}
			}
			_ = s.cache.Set(rawURL, body, contentType)
			http.Redirect(w, r, "/public/files/"+shareToken+"/preview", http.StatusMovedPermanently)
			return
		} else {
			s.logger.Error("failed to create 9drive share", "error", shareErr)
		}
	} else {
		s.logger.Error("failed to upload to 9drive", "error", uploadErr)
	}

	if err := s.cache.Set(rawURL, body, contentType); err != nil {
		s.logger.Warn("image cache write failed", "url", rawURL, "error", err)
	}
	writeImage(w, contentType, "MISS", "public, max-age=31536000", body)
}

func getNineDriveToken() string {
	if t := os.Getenv("NINEDRIVE_TOKEN"); t != "" {
		return t
	}
	return "9d_live_ALhIbWpJvDaFk0Pu7f7Qx-z0g95Ad1YY1rcEzyYomBc"
}

func extensionFromMime(mime string) string {
	switch mime {
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ".jpg"
	}
}

func uploadTo9Drive(ctx context.Context, client *http.Client, token string, filename string, contentType string, data []byte) (string, error) {
	var b bytes.Buffer
	w := multipart.NewWriter(&b)

	meta := []map[string]string{
		{
			"fieldName": "file-0",
			"fileName":  filename,
			"mimeType":  contentType,
			"sizeBytes": strconv.Itoa(len(data)),
		},
	}
	metaBytes, _ := json.Marshal(meta)
	if err := w.WriteField("filesMeta", string(metaBytes)); err != nil {
		return "", err
	}

	part, err := w.CreateFormFile("file-0", filename)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(data); err != nil {
		return "", err
	}
	w.Close()

	req, err := http.NewRequestWithContext(ctx, "POST", "http://localhost:4000/api/v1/uploads", &b)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("upload failed: status=%d, body=%s", resp.StatusCode, string(body))
	}

	var result struct {
		Files []struct {
			Id string `json:"id"`
		} `json:"files"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Files) == 0 {
		return "", fmt.Errorf("no files returned in upload response")
	}

	return result.Files[0].Id, nil
}

func create9DriveShare(ctx context.Context, client *http.Client, token string, fileId string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("http://localhost:4000/api/v1/files/%s/share", fileId), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("share failed: status=%d, body=%s", resp.StatusCode, string(body))
	}

	var result struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	parsed, err := url.Parse(result.URL)
	if err != nil {
		return "", err
	}
	parts := strings.Split(parsed.Path, "/")
	if len(parts) == 0 {
		return "", fmt.Errorf("invalid share URL path: %s", parsed.Path)
	}
	shareToken := parts[len(parts)-1]
	return shareToken, nil
}

func findIn9Drive(ctx context.Context, client *http.Client, token string, q string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "http://localhost:4000/api/v1/files?q="+url.QueryEscape(q), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("files query failed: status=%d", resp.StatusCode)
	}

	var result struct {
		Files []struct {
			Id   string `json:"id"`
			Name string `json:"name"`
		} `json:"files"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	for _, f := range result.Files {
		if strings.Contains(f.Name, q) {
			return f.Id, nil
		}
	}
	return "", nil
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

func (s *Server) healMangaCover(ctx context.Context, oldURL string) (string, error) {
	if s.pool == nil {
		return "", errors.New("no database connection")
	}

	var title, link, source string
	err := s.pool.QueryRow(ctx, "SELECT title, link, source FROM manga WHERE image = $1 LIMIT 1", oldURL).Scan(&title, &link, &source)
	if err != nil {
		return "", fmt.Errorf("find manga by image: %w", err)
	}

	s.logger.Info("attempting to self-heal cover image", "title", title, "source", source)

	var provider interface {
		ScrapeDetail(ctx context.Context, link string) (*scraper.MangaDetail, error)
	}

	switch strings.ToLower(source) {
	case "kiryuu":
		provider = providers.NewKiryuu()
	case "softkomik":
		provider = &providers.SoftkomikScraper{}
	case "manhwaindo":
		provider = &providers.ManhwaIndoScraper{}
	case "keikomik":
		provider = &providers.KeikomikScraper{}
	default:
		return "", fmt.Errorf("unsupported self-heal source: %s", source)
	}

	detail, err := provider.ScrapeDetail(ctx, link)
	if err != nil {
		return "", fmt.Errorf("scrape detail for self-heal: %w", err)
	}
	if detail == nil || detail.Image == "" {
		return "", errors.New("scraped cover image is empty")
	}

	// Update the database with the new cover image URL
	_, err = s.pool.Exec(ctx, "UPDATE manga SET image = $1 WHERE title = $2 AND source = $3", detail.Image, title, source)
	if err != nil {
		s.logger.Warn("failed to update manga cover image in DB", "error", err)
	}

	s.logger.Info("successfully self-healed cover image", "title", title, "new_url", detail.Image)
	return detail.Image, nil
}
