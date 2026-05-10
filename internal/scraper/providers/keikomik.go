package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gede-cahya/komida-backend/internal/scraper"
)

type KeikomikScraper struct{}

func (k *KeikomikScraper) Name() string    { return "Keikomik" }
func (k *KeikomikScraper) baseURL() string { return "https://keikomik.web.id" }

func (k *KeikomikScraper) defaultHeaders() map[string]string {
	return map[string]string{
		"User-Agent":      userAgent,
		"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
		"Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
		"Cache-Control":   "no-cache",
	}
}

func (k *KeikomikScraper) fetchPage(ctx context.Context, url string) (string, error) {
	resp, err := fetchWithContext(ctx, url, k.defaultHeaders())
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	htmlBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(htmlBytes), nil
}

func (k *KeikomikScraper) extractNextData(html string) map[string]any {
	m := regexp.MustCompile(`<script\s+id="__NEXT_DATA__"[^>]*>\s*([\s\S]*?)\s*</script>`).FindStringSubmatch(html)
	if m == nil {
		return nil
	}
	var data map[string]any
	if err := json.Unmarshal([]byte(m[1]), &data); err != nil {
		return nil
	}
	return data
}

func (k *KeikomikScraper) fetchMangaBasicInfo(ctx context.Context, slug string) *scraper.ScrapedManga {
	html, err := k.fetchPage(ctx, fmt.Sprintf("%s/komik/%s", k.baseURL(), slug))
	if err != nil {
		return nil
	}
	data := k.extractNextData(html)
	item := getNestedMap(data, "props", "pageProps", "item")
	if item == nil {
		return nil
	}
	title := getString(item, "name")
	if title == "" {
		title = getString(item, "name2")
	}
	if title == "" {
		title = slug
	}
	image := getString(item, "image")
	komikObj := getMap(item, "Komik")
	var ids []int
	for key := range komikObj {
		if n, err := strconv.Atoi(key); err == nil {
			ids = append(ids, n)
		}
	}
	sort.Sort(sort.Reverse(sort.IntSlice(ids)))
	latest := ""
	if len(ids) > 0 {
		latest = fmt.Sprintf("Chapter %d", ids[0])
	}
	prev := ""
	if len(ids) > 1 {
		prev = fmt.Sprintf("Chapter %d", ids[1])
	}
	return &scraper.ScrapedManga{
		Title:           title,
		Image:           image,
		Source:          k.Name(),
		Chapter:         latest,
		PreviousChapter: strPtr(prev),
		Link:            fmt.Sprintf("%s/komik/%s", k.baseURL(), slug),
	}
}

func (k *KeikomikScraper) ScrapePopular(ctx context.Context) ([]scraper.ScrapedManga, error) {
	return k.scrapePopularPage(ctx, 1)
}

func (k *KeikomikScraper) scrapePopularPage(ctx context.Context, page int) ([]scraper.ScrapedManga, error) {
	html, err := k.fetchPage(ctx, fmt.Sprintf("%s/sitemap.xml", k.baseURL()))
	if err != nil {
		return nil, err
	}
	type entry struct {
		slug    string
		lastmod int64
	}
	var entries []entry
	re := regexp.MustCompile(`<url>\s*<loc>https://keikomik\.web\.id/komik/([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>`)
	for _, m := range re.FindAllStringSubmatch(html, -1) {
		slug := strings.TrimSpace(m[1])
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(m[2]))
		if err == nil {
			entries = append(entries, entry{slug: slug, lastmod: t.Unix()})
		}
	}
	if len(entries) == 0 {
		return nil, nil
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].lastmod > entries[j].lastmod })
	itemsPerPage := 24
	start := (page - 1) * itemsPerPage
	if start >= len(entries) {
		return nil, nil
	}
	slice := entries[start:]
	if len(slice) > itemsPerPage {
		slice = slice[:itemsPerPage]
	}
	var results []scraper.ScrapedManga
	batch := 5
	for i := 0; i < len(slice); i += batch {
		end := i + batch
		if end > len(slice) {
			end = len(slice)
		}
		batchResults := make([]*scraper.ScrapedManga, end-i)
		for j := i; j < end; j++ {
			idx := j - i
			e := slice[j]
			go func(idx int, slug string) {
				batchResults[idx] = k.fetchMangaBasicInfo(ctx, slug)
			}(idx, e.slug)
		}
		// Wait for batch
		time.Sleep(200 * time.Millisecond)
		for _, r := range batchResults {
			if r != nil {
				results = append(results, *r)
			}
		}
	}
	return results, nil
}

func (k *KeikomikScraper) Search(ctx context.Context, query string) ([]scraper.ScrapedManga, error) {
	html, err := k.fetchPage(ctx, fmt.Sprintf("%s/sitemap.xml", k.baseURL()))
	if err != nil {
		return nil, err
	}
	normalized := strings.ToLower(strings.ReplaceAll(query, " ", "-"))
	re := regexp.MustCompile(`https://keikomik\.web\.id/komik/([^<\s]+)`)
	var slugs []string
	for _, m := range re.FindAllStringSubmatch(html, -1) {
		slug := strings.TrimSpace(m[1])
		if strings.Contains(strings.ToLower(slug), normalized) {
			slugs = append(slugs, slug)
		}
	}
	if len(slugs) == 0 {
		return nil, nil
	}
	if len(slugs) > 10 {
		slugs = slugs[:10]
	}
	var results []scraper.ScrapedManga
	for _, slug := range slugs {
		if info := k.fetchMangaBasicInfo(ctx, slug); info != nil {
			results = append(results, *info)
		}
	}
	return results, nil
}

func (k *KeikomikScraper) ScrapeDetail(ctx context.Context, link string) (*scraper.MangaDetail, error) {
	html, err := k.fetchPage(ctx, link)
	if err != nil {
		return nil, err
	}
	data := k.extractNextData(html)
	item := getNestedMap(data, "props", "pageProps", "item")
	if item == nil {
		return nil, fmt.Errorf("no item data")
	}
	slug := strings.TrimPrefix(link, k.baseURL()+"/komik/")
	slug = strings.Trim(slug, "/")
	title := getString(item, "name")
	if title == "" {
		title = getString(item, "name2")
	}
	if title == "" {
		title = slug
	}
	image := getString(item, "image")
	synopsis := getString(item, "description")
	var genres []string
	if g, ok := item["genre"].([]any); ok {
		for _, v := range g {
			if s, ok := v.(string); ok {
				genres = append(genres, s)
			}
		}
	}
	author := getString(item, "author")
	if author == "" {
		author = "Unknown"
	}
	status := getString(item, "status")
	if status == "" {
		status = "Unknown"
	}
	rating := 0.0
	if r, ok := item["rating"].(string); ok {
		rating, _ = strconv.ParseFloat(r, 64)
	}
	komikObj := getMap(item, "Komik")
	var chapterIDs []int
	for key := range komikObj {
		if n, err := strconv.Atoi(key); err == nil {
			chapterIDs = append(chapterIDs, n)
		}
	}
	sort.Sort(sort.Reverse(sort.IntSlice(chapterIDs)))
	var chapters []scraper.MangaChapter
	for _, chId := range chapterIDs {
		chData := komikObj[strconv.Itoa(chId)]
		var released string
		if m, ok := chData.(map[string]any); ok {
			rawDate := getString(m, "UpdateAt", "CreateAt")
			if rawDate != "" {
				if t, err := time.Parse(time.RFC3339, rawDate); err == nil {
					released = t.Format("02 Jan 2006")
				}
			}
		}
		chapters = append(chapters, scraper.MangaChapter{
			Title:    fmt.Sprintf("Chapter %d", chId),
			Link:     fmt.Sprintf("%s/chapter/%s-chapter-%d", k.baseURL(), slug, chId),
			Released: released,
		})
	}
	return &scraper.MangaDetail{
		Title:    title,
		Image:    image,
		Synopsis: synopsis,
		Genres:   genres,
		Author:   author,
		Status:   status,
		Rating:   rating,
		Chapters: chapters,
	}, nil
}

func (k *KeikomikScraper) ScrapeChapter(ctx context.Context, link string) (*scraper.ChapterData, error) {
	html, err := k.fetchPage(ctx, link)
	if err != nil {
		return nil, err
	}
	data := k.extractNextData(html)
	pageProps := getNestedMap(data, "props", "pageProps")
	if pageProps == nil {
		return nil, fmt.Errorf("no pageProps")
	}
	slug := getString(pageProps, "slug")
	currentChapterID := fmt.Sprintf("%v", pageProps["chapter"])
	komikIds := getStringSlice(pageProps, "komikIds")
	var images []string
	subItem := getMap(pageProps, "subItem")
	if subItem != nil {
		if imgArr, ok := subItem["img"].([]any); ok {
			for _, v := range imgArr {
				if s, ok := v.(string); ok && strings.HasPrefix(s, "http") {
					images = append(images, s)
				}
			}
		}
	}
	if len(images) == 0 {
		komikData := getNestedMap(pageProps, "data", "Komik", currentChapterID)
		if komikData != nil {
			if imgArr, ok := komikData["img"].([]any); ok {
				for _, v := range imgArr {
					if s, ok := v.(string); ok && strings.HasPrefix(s, "http") {
						images = append(images, s)
					}
				}
			}
		}
	}
	if len(images) == 0 && slug != "" {
		detailHtml, err := k.fetchPage(ctx, fmt.Sprintf("%s/komik/%s", k.baseURL(), slug))
		if err == nil {
			detailData := k.extractNextData(detailHtml)
			detailKomik := getNestedMap(detailData, "props", "pageProps", "item", "Komik", currentChapterID)
			if detailKomik != nil {
				if imgArr, ok := detailKomik["img"].([]any); ok {
					for _, v := range imgArr {
						if s, ok := v.(string); ok && strings.HasPrefix(s, "http") {
							images = append(images, s)
						}
					}
				}
			}
		}
	}
	currentIndex := -1
	for i, id := range komikIds {
		if id == currentChapterID {
			currentIndex = i
			break
		}
	}
	var prev, next string
	if currentIndex > 0 {
		prev = fmt.Sprintf("%s/chapter/%s-chapter-%s", k.baseURL(), slug, komikIds[currentIndex-1])
	}
	if currentIndex >= 0 && currentIndex < len(komikIds)-1 {
		next = fmt.Sprintf("%s/chapter/%s-chapter-%s", k.baseURL(), slug, komikIds[currentIndex+1])
	}
	return &scraper.ChapterData{Images: images, Prev: prev, Next: next}, nil
}

func (k *KeikomikScraper) ScrapeGenres(ctx context.Context) ([]scraper.GenreItem, error) {
	return []scraper.GenreItem{
		{Name: "Action", Slug: "action"},
		{Name: "Adventure", Slug: "adventure"},
		{Name: "Comedy", Slug: "comedy"},
		{Name: "Drama", Slug: "drama"},
		{Name: "Fantasy", Slug: "fantasy"},
		{Name: "Historical", Slug: "historical"},
		{Name: "Horror", Slug: "horror"},
		{Name: "Isekai", Slug: "isekai"},
		{Name: "Magic", Slug: "magic"},
		{Name: "Martial Arts", Slug: "martial-arts"},
		{Name: "Mature", Slug: "mature"},
		{Name: "Mecha", Slug: "mecha"},
		{Name: "Mystery", Slug: "mystery"},
		{Name: "Psychological", Slug: "psychological"},
		{Name: "Romance", Slug: "romance"},
		{Name: "School Life", Slug: "school-life"},
		{Name: "Sci-Fi", Slug: "sci-fi"},
		{Name: "Seinen", Slug: "seinen"},
		{Name: "Shounen", Slug: "shounen"},
		{Name: "Slice of Life", Slug: "slice-of-life"},
		{Name: "Sports", Slug: "sports"},
		{Name: "Supernatural", Slug: "supernatural"},
		{Name: "Thriller", Slug: "thriller"},
		{Name: "Tragedy", Slug: "tragedy"},
		{Name: "Wuxia", Slug: "wuxia"},
	}, nil
}

func (k *KeikomikScraper) ScrapeByGenre(ctx context.Context, genre string, page int) ([]scraper.ScrapedManga, error) {
	html, err := k.fetchPage(ctx, fmt.Sprintf("%s/sitemap.xml", k.baseURL()))
	if err != nil {
		return nil, err
	}
	re := regexp.MustCompile(`https://keikomik\.web\.id/komik/([^<\s]+)`)
	var allSlugs []string
	for _, m := range re.FindAllStringSubmatch(html, -1) {
		allSlugs = append(allSlugs, strings.TrimSpace(m[1]))
	}
	const maxScan = 60
	const itemsPerPage = 20
	const batch = 5
	var matching []scraper.ScrapedManga
	for i := 0; i < min(len(allSlugs), maxScan); i += batch {
		end := i + batch
		if end > len(allSlugs) {
			end = len(allSlugs)
		}
		batchSlugs := allSlugs[i:end]
		htmls := make([]string, len(batchSlugs))
		for j, slug := range batchSlugs {
			h, _ := k.fetchPage(ctx, fmt.Sprintf("%s/komik/%s", k.baseURL(), slug))
			htmls[j] = h
		}
		for j := 0; j < len(batchSlugs); j++ {
			h := htmls[j]
			if h == "" {
				continue
			}
			data := k.extractNextData(h)
			item := getNestedMap(data, "props", "pageProps", "item")
			if item == nil {
				continue
			}
			var genres []string
			if g, ok := item["genre"].([]any); ok {
				for _, v := range g {
					if s, ok := v.(string); ok {
						genres = append(genres, s)
					}
				}
			}
			matches := false
			for _, g := range genres {
				if strings.EqualFold(g, genre) || strings.EqualFold(strings.ReplaceAll(g, " ", "-"), genre) {
					matches = true
					break
				}
			}
			if !matches {
				continue
			}
			slug := batchSlugs[j]
			title := getString(item, "name")
			if title == "" {
				title = getString(item, "name2")
			}
			if title == "" {
				title = slug
			}
			image := getString(item, "image")
			komikObj := getMap(item, "Komik")
			var ids []int
			for key := range komikObj {
				if n, err := strconv.Atoi(key); err == nil {
					ids = append(ids, n)
				}
			}
			sort.Sort(sort.Reverse(sort.IntSlice(ids)))
			latest := ""
			if len(ids) > 0 {
				latest = fmt.Sprintf("Chapter %d", ids[0])
			}
			prev := ""
			if len(ids) > 1 {
				prev = fmt.Sprintf("Chapter %d", ids[1])
			}
			matching = append(matching, scraper.ScrapedManga{
				Title:           title,
				Image:           image,
				Source:          k.Name(),
				Chapter:         latest,
				PreviousChapter: strPtr(prev),
				Link:            fmt.Sprintf("%s/komik/%s", k.baseURL(), slug),
			})
			if len(matching) >= maxScan {
				break
			}
		}
		if len(matching) >= maxScan {
			break
		}
	}
	start := (page - 1) * itemsPerPage
	if start >= len(matching) {
		return nil, nil
	}
	end := start + itemsPerPage
	if end > len(matching) {
		end = len(matching)
	}
	return matching[start:end], nil
}

func getNestedMap(m map[string]any, keys ...string) map[string]any {
	if m == nil {
		return nil
	}
	for _, k := range keys {
		if v, ok := m[k].(map[string]any); ok {
			m = v
		} else {
			return nil
		}
	}
	return m
}

func getMap(m map[string]any, key string) map[string]any {
	if m == nil {
		return nil
	}
	if v, ok := m[key].(map[string]any); ok {
		return v
	}
	return nil
}

func getString(m map[string]any, keys ...string) string {
	if m == nil {
		return ""
	}
	for i, k := range keys {
		if i == len(keys)-1 {
			if v, ok := m[k].(string); ok {
				return v
			}
			return ""
		}
		if v, ok := m[k].(map[string]any); ok {
			m = v
		} else {
			return ""
		}
	}
	return ""
}

func getStringSlice(m map[string]any, key string) []string {
	if m == nil {
		return nil
	}
	if v, ok := m[key].([]any); ok {
		var out []string
		for _, item := range v {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
