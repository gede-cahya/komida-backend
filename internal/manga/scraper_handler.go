package manga

import (
	"log/slog"
	"net/http"

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
			Image:    detail.Image,
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
		// decrypt is not needed for Go-to-Go; but Bun sends encrypted ids.
		// We keep Bun endpoint for encrypted ids until full cutover.
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Encrypted id not supported in Go scraper yet"})
		return
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
	if err != nil {
		h.logger.Warn("scrape chapter failed", "source", source, "link", link, "error", err)
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
