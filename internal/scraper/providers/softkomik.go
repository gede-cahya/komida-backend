package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/PuerkitoBio/goquery"
	"github.com/gede-cahya/komida-backend/internal/scraper"
)

type SoftkomikScraper struct {
	buildID string
}

func (s *SoftkomikScraper) Name() string { return "Softkomik" }

func (s *SoftkomikScraper) baseURL() string { return "https://softkomik.co/" }

func (s *SoftkomikScraper) reroute(link string) string {
	u, err := parseURL(link)
	if err != nil {
		return link
	}
	u.Scheme = "https"
	u.Host = "softkomik.co"
	return u.String()
}

func (s *SoftkomikScraper) getBuildID(ctx context.Context) string {
	if s.buildID != "" {
		return s.buildID
	}
	resp, err := fetchWithContext(ctx, s.baseURL(), defaultHeaders())
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	htmlBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return ""
	}
	html := string(htmlBytes)
	// Try 1: __NEXT_DATA__ JSON
	if m := regexp.MustCompile(`<script\s+id="__NEXT_DATA__"[^>]*>\s*([\s\S]*?)\s*</script>`).FindStringSubmatch(html); m != nil {
		var data map[string]any
		if err := json.Unmarshal([]byte(m[1]), &data); err == nil {
			if bid, ok := data["buildId"].(string); ok && bid != "" {
				s.buildID = bid
				return bid
			}
		}
	}
	// Try 2: regex search
	if m := regexp.MustCompile(`"buildId":"([^"]+)"`).FindStringSubmatch(html); m != nil {
		s.buildID = m[1]
		return m[1]
	}
	return ""
}

func (s *SoftkomikScraper) ScrapePopular(ctx context.Context) ([]scraper.ScrapedManga, error) {
	resp, err := fetchWithContext(ctx, s.baseURL(), defaultHeaders())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}
	var list []scraper.ScrapedManga
	seen := map[string]struct{}{}
	doc.Find(".item-komik").Each(func(_ int, el *goquery.Selection) {
		titleEl := el.Find(".item-title a")
		title := strings.TrimSpace(titleEl.Text())
		link, _ := titleEl.Attr("href")
		imgEl := el.Find(".img-komik-item img")
		image := coalesceAttr(imgEl, "data-src", "src", "data-lazy-src")
		if !strings.HasPrefix(image, "http") {
			image = resolveImage(image, s.baseURL())
		}
		chapter := strings.TrimSpace(el.Find("a[href*=\"/chapter/\"]").First().Text())
		if chapter == "" {
			chapter = strings.TrimSpace(el.Find(".chapter").Text())
		}
		if chapter == "" {
			chapter = "Chapter ?"
		}
		if title != "" && link != "" {
			fullLink := link
			if !strings.HasPrefix(link, "http") {
				fullLink = strings.TrimSuffix(s.baseURL(), "/") + link
			}
			if _, ok := seen[fullLink]; !ok {
				seen[fullLink] = struct{}{}
				list = append(list, scraper.ScrapedManga{
					Title:   strings.TrimSpace(strings.Replace(title, "Bahasa Indonesia", "", -1)),
					Image:   image,
					Source:  s.Name(),
					Chapter: chapter,
					Link:    fullLink,
				})
			}
		}
	})
	return list, nil
}

func (s *SoftkomikScraper) fetchMangaBasicInfo(ctx context.Context, slug string) *scraper.ScrapedManga {
	link := s.baseURL() + slug
	detail, err := s.ScrapeDetail(ctx, link)
	if err != nil {
		return nil
	}
	latestChapter := "Read Now"
	if len(detail.Chapters) > 0 {
		latestChapter = detail.Chapters[0].Title
	}
	return &scraper.ScrapedManga{
		Title:   detail.Title,
		Image:   detail.Image,
		Source:  s.Name(),
		Chapter: latestChapter,
		Link:    link,
	}
}

func (s *SoftkomikScraper) Search(ctx context.Context, query string) ([]scraper.ScrapedManga, error) {
	resp, err := fetchWithContext(ctx, s.baseURL()+"sitemap.xml", defaultHeaders())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	htmlBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	html := string(htmlBytes)

	normalized := strings.ToLower(strings.ReplaceAll(query, " ", "-"))
	re := regexp.MustCompile(`<loc>https://softkomik\.co/([^<\s]+)</loc>`)
	var slugs []string
	for _, m := range re.FindAllStringSubmatch(html, -1) {
		slug := strings.TrimSpace(m[1])
		if strings.Contains(slug, "/genre/") || strings.Contains(slug, "/type/") || strings.Contains(slug, "chapter/") {
			continue
		}
		if strings.Contains(strings.ToLower(slug), normalized) {
			slugs = append(slugs, slug)
		}
	}

	if len(slugs) == 0 {
		return nil, nil
	}

	maxResults := 15
	if len(slugs) > maxResults {
		slugs = slugs[:maxResults]
	}

	var results []scraper.ScrapedManga
	var wg sync.WaitGroup
	batchResults := make([]*scraper.ScrapedManga, len(slugs))

	for i, slug := range slugs {
		wg.Add(1)
		go func(idx int, slg string) {
			defer wg.Done()
			batchResults[idx] = s.fetchMangaBasicInfo(ctx, slg)
		}(i, slug)
	}
	wg.Wait()

	for _, r := range batchResults {
		if r != nil {
			results = append(results, *r)
		}
	}

	return results, nil
}

func (s *SoftkomikScraper) ScrapeDetail(ctx context.Context, link string) (*scraper.MangaDetail, error) {
	link = s.reroute(link)
	buildID := s.getBuildID(ctx)
	if buildID == "" {
		return nil, fmt.Errorf("could not get buildId")
	}
	u, err := parseURL(link)
	if err != nil {
		return nil, err
	}
	slug := strings.Trim(strings.TrimPrefix(u.Path, "/"), "/")
	if slug == "" {
		return nil, fmt.Errorf("could not extract slug")
	}
	jsonURL := fmt.Sprintf("%s_next/data/%s/%s.json", s.baseURL(), buildID, slug)
	data, err := s.fetchJSON(ctx, jsonURL)
	if err != nil {
		s.buildID = ""
		return nil, err
	}
	props := data["pageProps"]
	if props == nil {
		return nil, fmt.Errorf("no pageProps")
	}
	p, ok := props.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid pageProps")
	}
	var comic map[string]any
	if d, ok := p["data"].(map[string]any); ok {
		comic = d
	} else if c, ok := p["comic"].(map[string]any); ok {
		comic = c
	}
	if comic == nil {
		return nil, fmt.Errorf("no comic data")
	}
	title := strings.TrimSpace(strings.Replace(getString(comic, "title"), "Bahasa Indonesia", "", -1))
	var image string
	gambar := getString(comic, "gambar")
	if strings.HasPrefix(gambar, "http") {
		image = gambar
	} else if strings.HasPrefix(gambar, "image-cover/") || strings.HasPrefix(gambar, "uploads-cover-2/") {
		image = "https://cover.softdevices.my.id/softkomik-cover/" + gambar
	} else if gambar != "" {
		image = strings.TrimSuffix(s.baseURL(), "/") + "/" + strings.TrimPrefix(gambar, "/")
	}
	synopsis := getString(comic, "sinopsis")
	if synopsis == "" {
		synopsis = getString(comic, "description")
	}
	status := getString(comic, "status")
	if status == "" {
		status = "Ongoing"
	}
	var genres []string
	if g, ok := comic["Genre"].([]any); ok {
		for _, v := range g {
			if s, ok := v.(string); ok {
				genres = append(genres, s)
			} else if m, ok := v.(map[string]any); ok {
				if name, ok := m["name"].(string); ok {
					genres = append(genres, name)
				}
			}
		}
	} else if g, ok := comic["genres"].([]any); ok {
		for _, v := range g {
			if s, ok := v.(string); ok {
				genres = append(genres, s)
			} else if m, ok := v.(map[string]any); ok {
				if name, ok := m["name"].(string); ok {
					genres = append(genres, name)
				}
			}
		}
	}
	var chapters []scraper.MangaChapter
	latest := getString(comic, "latest_chapter")
	if latest != "" {
		numStr := regexp.MustCompile(`[^\d]`).ReplaceAllString(latest, "")
		latestNum, _ := strconv.ParseInt(numStr, 10, 64)
		if latestNum > 0 {
			updatedAt := getString(comic, "updated_at")
			for i := latestNum; i >= 1; i-- {
				chNum := fmt.Sprintf("%03d", i)
				chapters = append(chapters, scraper.MangaChapter{
					Title:    fmt.Sprintf("Chapter %d", i),
					Link:     fmt.Sprintf("%s/chapter/%s", link, chNum),
					Released: updatedAt,
				})
			}
		}
	}
	return &scraper.MangaDetail{
		Title:    title,
		Image:    image,
		Synopsis: synopsis,
		Genres:   genres,
		Status:   status,
		Author:   getString(comic, "author"),
		Rating:   float64(getInt(comic, "rating", "value")),
		Chapters: chapters,
	}, nil
}

func (s *SoftkomikScraper) ScrapeChapter(ctx context.Context, link string) (*scraper.ChapterData, error) {
	link = s.reroute(link)

	cmd := exec.CommandContext(ctx, "node", "/home/ubuntu/komida-backend/scrape_chapter.cjs", link)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("puppeteer execution failed: %v", err)
	}

	var result struct {
		Images []string `json:"images"`
		Prev   string   `json:"prev"`
		Next   string   `json:"next"`
		Error  string   `json:"error"`
	}

	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("failed to parse puppeteer output: %v, raw: %s", err, string(output))
	}

	if result.Error != "" {
		return nil, fmt.Errorf("puppeteer scraper error: %s", result.Error)
	}

	return &scraper.ChapterData{
		Images: result.Images,
		Next:   result.Next,
		Prev:   result.Prev,
	}, nil
}

func (s *SoftkomikScraper) ScrapeGenres(ctx context.Context) ([]scraper.GenreItem, error) {
	return nil, nil
}

func (s *SoftkomikScraper) ScrapeByGenre(ctx context.Context, genre string, page int) ([]scraper.ScrapedManga, error) {
	return nil, nil
}

func (s *SoftkomikScraper) fetchJSON(ctx context.Context, url string) (map[string]any, error) {
	resp, err := fetchWithContext(ctx, url, defaultHeaders())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}

func resolveImage(image, base string) string {
	if image == "" || strings.HasPrefix(image, "data:") {
		return ""
	}
	if strings.HasPrefix(image, "http") {
		return image
	}
	if strings.HasPrefix(image, "/_next/image") {
		if m := regexp.MustCompile(`url=([^&]+)`).FindStringSubmatch(image); m != nil {
			decoded, err := url.QueryUnescape(m[1])
			if err == nil {
				return decoded
			}
		}
		return base + image
	}
	return strings.TrimSuffix(base, "/") + "/" + strings.TrimPrefix(image, "/")
}

func getInt(m map[string]any, path ...string) int {
	if len(path) == 0 {
		return 0
	}
	v := m[path[0]]
	for _, k := range path[1:] {
		if mm, ok := v.(map[string]any); ok {
			v = mm[k]
		} else {
			return 0
		}
	}
	if f, ok := v.(float64); ok {
		return int(f)
	}
	return 0
}
