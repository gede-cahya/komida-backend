package manga

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gede-cahya/komida-backend/internal/scraper"
	"github.com/gede-cahya/komida-backend/internal/scraper/providers"
)

type ScraperHandler struct {
	providers []scraper.Provider
	logger    *slog.Logger
}

func NewScraperHandler(logger *slog.Logger) *ScraperHandler {
	return &ScraperHandler{
		providers: []scraper.Provider{
			providers.NewKiryuu(),
			&providers.ManhwaIndoScraper{},
			&providers.SoftkomikScraper{},
			&providers.KeikomikScraper{},
		},
		logger: logger,
	}
}

func (h *ScraperHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/manga/detail", h.detail)
	mux.HandleFunc("/api/manga/chapter", h.chapter)
	mux.HandleFunc("/api/manga/external-search", h.externalSearch)
}

func (h *ScraperHandler) detail(w http.ResponseWriter, r *http.Request) {
	source := r.URL.Query().Get("source")
	link := r.URL.Query().Get("link")
	if source == "" || link == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing source or link"})
		return
	}

	p := h.findProvider(source)
	if p == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Provider not found: " + source})
		return
	}

	detail, err := p.ScrapeDetail(r.Context(), link)
	if err != nil {
		h.logger.Warn("scrape detail failed", "source", source, "link", link, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch detail"})
		return
	}
	if detail == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch detail"})
		return
	}

	if detail.Chapters != nil {
		encrypted := make([]map[string]any, 0, len(detail.Chapters))
		for _, ch := range detail.Chapters {
			encrypted = append(encrypted, map[string]any{
				"title":    ch.Title,
				"link":     "",
				"released": ch.Released,
				"id":       encryptChapterID(source, ch.Link),
			})
		}
		detail.Chapters = nil // avoid leaking raw chapters
		resp := struct {
			Title    string           `json:"title"`
			Image    string           `json:"image"`
			Synopsis string           `json:"synopsis"`
			Genres   []string         `json:"genres"`
			Author   string           `json:"author"`
			Status   string           `json:"status"`
			Rating   float64          `json:"rating"`
			Chapters []map[string]any `json:"chapters"`
		}{
			Title:    detail.Title,
			Image:    secureImageURL(detail.Image),
			Synopsis: detail.Synopsis,
			Genres:   detail.Genres,
			Author:   detail.Author,
			Status:   detail.Status,
			Rating:   detail.Rating,
			Chapters: encrypted,
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	writeJSON(w, http.StatusOK, detail)
}

func (h *ScraperHandler) chapter(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	legacySource := r.URL.Query().Get("source")
	legacyLink := r.URL.Query().Get("link")

	source := legacySource
	link := legacyLink

	if id != "" {
		payload, err := decryptChapterID(id)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid chapter id"})
			return
		}
		source = payload.Source
		link = payload.Link
	}

	if source == "" || link == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing source or link"})
		return
	}

	p := h.findProvider(source)
	if p == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Provider not found: " + source})
		return
	}

	data, err := p.ScrapeChapter(r.Context(), link)
	needsFallback := err != nil || data == nil || len(data.Images) == 0
	if !needsFallback && data != nil && len(data.Images) > 0 {
		if !probeFirstImage(r.Context(), data.Images[0], source) {
			h.logger.Warn("primary images blocked upstream (403), triggering fallback", "source", source, "first_image", data.Images[0])
			needsFallback = true
		}
	}
	if needsFallback {
		h.logger.Warn("scrape chapter failed, attempting fallback to other providers", "source", source, "link", link, "error", err)
		mangaSlug := extractMangaSlug(link)
		targetChapterNum := cleanChapterNumber(extractChapterNumber(link))
		if mangaSlug != "" && targetChapterNum != "" {
			query := strings.ReplaceAll(mangaSlug, "-", " ")
			for _, otherP := range h.providers {
				if otherP.Name() == source {
					continue
				}
				h.logger.Info("attempting fallback provider", "provider", otherP.Name(), "query", query)
				results, searchErr := otherP.Search(r.Context(), query)
				if searchErr != nil || len(results) == 0 {
					if strings.Contains(mangaSlug, "-") {
						words := strings.Split(mangaSlug, "-")
						var fallbackQueries []string
						for _, w := range words {
							if len(w) > 3 && w != "read" && w != "chapter" && w != "manga" {
								fallbackQueries = append(fallbackQueries, w)
							}
						}
						for i := 0; i < len(fallbackQueries); i++ {
							for j := i + 1; j < len(fallbackQueries); j++ {
								if len(fallbackQueries[i]) < len(fallbackQueries[j]) {
									fallbackQueries[i], fallbackQueries[j] = fallbackQueries[j], fallbackQueries[i]
								}
							}
						}
						for _, q := range fallbackQueries {
							results, searchErr = otherP.Search(r.Context(), q)
							if searchErr == nil && len(results) > 0 {
								break
							}
						}
					}
				}
				if searchErr == nil && len(results) > 0 {
					var bestMatch *scraper.ScrapedManga
					for _, res := range results {
						resSlug := extractMangaSlug(res.Link)
						if cleanSlug(res.Title) == mangaSlug || resSlug == mangaSlug || strings.Contains(resSlug, mangaSlug) || strings.Contains(mangaSlug, resSlug) {
							bestMatch = &res
							break
						}
					}
					if bestMatch != nil {
						h.logger.Info("found fallback match", "provider", otherP.Name(), "link", bestMatch.Link)
						detail, detailErr := otherP.ScrapeDetail(r.Context(), bestMatch.Link)
						if detailErr == nil && detail != nil && len(detail.Chapters) > 0 {
							var matchingChapterLink string
							for _, ch := range detail.Chapters {
								chNum := cleanChapterNumber(extractChapterNumber(ch.Link))
								if chNum == targetChapterNum || strings.Contains(ch.Title, "Chapter "+targetChapterNum) || strings.HasSuffix(ch.Title, " "+targetChapterNum) {
									matchingChapterLink = ch.Link
									break
								}
							}
							if matchingChapterLink != "" {
								h.logger.Info("found fallback chapter", "provider", otherP.Name(), "link", matchingChapterLink)
								fallbackData, fallbackErr := otherP.ScrapeChapter(r.Context(), matchingChapterLink)
								if fallbackErr == nil && fallbackData != nil && len(fallbackData.Images) > 0 {
									h.logger.Info("successfully resolved fallback chapter", "provider", otherP.Name(), "image_count", len(fallbackData.Images))
									data = fallbackData
									source = otherP.Name()
									link = matchingChapterLink
									err = nil
									break
								}
							}
						}
					}
				}
			}
		}
	}

	if err != nil {
		h.logger.Warn("scrape chapter fallback failed", "source", source, "link", link, "error", err)
		writeJSON(w, http.StatusOK, map[string]any{"images": []string{}, "source": source})
		return
	}
	if data == nil {
		writeJSON(w, http.StatusOK, map[string]any{"images": []string{}, "source": source})
		return
	}

	var nextID, prevID string
	if data.Next != "" {
		nextID = encryptChapterID(source, data.Next)
	}
	if data.Prev != "" {
		prevID = encryptChapterID(source, data.Prev)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"source": source,
		"images": data.Images,
		"next":   nextID,
		"prev":   prevID,
	})
}

func (h *ScraperHandler) externalSearch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeJSON(w, http.StatusOK, map[string]any{"results": []scraper.ScrapedManga{}})
		return
	}

	var allResults []scraper.ScrapedManga
	for _, p := range h.providers {
		results, err := p.Search(r.Context(), query)
		if err != nil {
			h.logger.Warn("search failed", "provider", p.Name(), "error", err)
			continue
		}
		allResults = append(allResults, results...)
	}

	seen := map[string]struct{}{}
	unique := make([]scraper.ScrapedManga, 0, len(allResults))
	for _, m := range allResults {
		key := m.Title
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, m)
	}

	writeJSON(w, http.StatusOK, map[string]any{"results": unique})
}

func (h *ScraperHandler) findProvider(name string) scraper.Provider {
	for _, p := range h.providers {
		if p.Name() == name {
			return p
		}
	}
	return nil
}

func cleanSlug(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "’", "")
	s = strings.ReplaceAll(s, "'", "")
	s = strings.ReplaceAll(s, " ", "-")
	reg := regexp.MustCompile(`[^\w\-]+`)
	s = reg.ReplaceAllString(s, "")
	reg2 := regexp.MustCompile(`-+`)
	s = reg2.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func extractMangaSlug(link string) string {
	u, err := url.Parse(link)
	if err != nil {
		return ""
	}
	path := strings.Trim(u.Path, "/")
	parts := strings.Split(path, "/")
	for i, part := range parts {
		if (part == "manga" || part == "komik" || part == "series" || part == "read") && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	if len(parts) > 0 {
		return parts[0]
	}
	return ""
}

func extractChapterNumber(link string) string {
	re := regexp.MustCompile(`(?i)(?:chapter|ch|chap)[-/]?([0-9.]+)`)
	match := re.FindStringSubmatch(link)
	if len(match) > 1 {
		return match[1]
	}
	parts := strings.Split(strings.Trim(link, "/"), "/")
	if len(parts) > 0 {
		last := parts[len(parts)-1]
		re2 := regexp.MustCompile(`([0-9.]+)`)
		match2 := re2.FindStringSubmatch(last)
		if len(match2) > 0 {
			return match2[0]
		}
	}
	return ""
}

func cleanChapterNumber(num string) string {
	if strings.Contains(num, ".") {
		parts := strings.Split(num, ".")
		if len(parts) > 1 && len(parts[1]) >= 5 {
			return parts[0]
		}
	}
	return num
}

// probeFirstImage does a quick HEAD request on the first image URL to check
// if the upstream server is actually serving images or blocking with 403.
func probeFirstImage(ctx context.Context, imageURL string, source string) bool {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, imageURL, nil)
	if err != nil {
		return false
	}
	// Set appropriate referer based on source
	switch strings.ToLower(source) {
	case "kiryuu":
		req.Header.Set("Referer", "https://kiryuuid.net/")
	case "softkomik":
		req.Header.Set("Referer", "https://softkomik.co/")
	case "manhwaindo":
		req.Header.Set("Referer", "https://www.manhwaindo.my/")
	default:
		req.Header.Set("Referer", imageURL)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 400
}
