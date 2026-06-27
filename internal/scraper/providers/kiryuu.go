package providers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/gede-cahya/komida-backend/internal/scraper"
)

const kiryuuName = "Kiryuu"

type Kiryuu struct {
	baseURL string
	client  *http.Client
}

func NewKiryuu() *Kiryuu {
	return &Kiryuu{
		baseURL: "https://kiryuuid.net/",
		client:  defaultHTTPClient,
	}
}

func (k *Kiryuu) Name() string { return kiryuuName }

func (k *Kiryuu) reroute(link string) string {
	parsed, err := url.Parse(link)
	if err != nil {
		return link
	}
	parsed.Scheme = "https"
	parsed.Host = "kiryuuid.net"
	path := parsed.Path
	if strings.HasPrefix(path, "/manga/") {
		path = strings.TrimSuffix(path, "/")
	}
	parsed.Path = path
	return parsed.String()
}

func (k *Kiryuu) fetch(ctx context.Context, link string) (*goquery.Document, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	resp, err := k.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream status %d for %s", resp.StatusCode, link)
	}
	return goquery.NewDocumentFromReader(resp.Body)
}

func (k *Kiryuu) getInertiaProps(ctx context.Context, link string) (map[string]any, error) {
	doc, err := k.fetch(ctx, link)
	if err != nil {
		return nil, err
	}
	appDiv := doc.Find("#app")
	if appDiv.Length() == 0 {
		return nil, fmt.Errorf("#app element not found for %s", link)
	}
	dataPage, exists := appDiv.Attr("data-page")
	if !exists {
		return nil, fmt.Errorf("data-page attribute not found for %s", link)
	}
	dataPage = html.UnescapeString(dataPage)
	var parsed map[string]any
	if err := json.Unmarshal([]byte(dataPage), &parsed); err != nil {
		return nil, err
	}
	props, ok := parsed["props"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("props not found in Inertia data for %s", link)
	}
	return props, nil
}

func (k *Kiryuu) ScrapePopular(ctx context.Context) ([]scraper.ScrapedManga, error) {
	props, err := k.getInertiaProps(ctx, k.baseURL)
	if err != nil {
		return nil, err
	}

	popularManga, ok := props["popularManga"].([]any)
	if !ok {
		return []scraper.ScrapedManga{}, nil
	}

	results := make([]scraper.ScrapedManga, 0, len(popularManga))
	for _, itemVal := range popularManga {
		item, ok := itemVal.(map[string]any)
		if !ok {
			continue
		}
		title, _ := item["title"].(string)
		slug, _ := item["slug"].(string)
		image, _ := item["poster"].(string)
		link := fmt.Sprintf("%smanga/%s", k.baseURL, slug)

		chapter := "Read Now"
		if lastChapter, ok := item["last_chapter"].(map[string]any); ok {
			if chapTitle, ok := lastChapter["title"].(string); ok && chapTitle != "" {
				chapter = chapTitle
			}
		}

		var rating float64
		if ratingVal, ok := item["rating"]; ok && ratingVal != nil {
			if rFloat, ok := ratingVal.(float64); ok {
				rating = rFloat
			}
		}

		if title != "" && slug != "" {
			results = append(results, scraper.ScrapedManga{
				Title:   title,
				Image:   image,
				Source:  kiryuuName,
				Chapter: chapter,
				Link:    link,
				Rating:  rating,
			})
		}
	}
	return results, nil
}

func (k *Kiryuu) Search(ctx context.Context, query string) ([]scraper.ScrapedManga, error) {
	searchURL := fmt.Sprintf("%smanga?search=%s", k.baseURL, url.QueryEscape(query))
	props, err := k.getInertiaProps(ctx, searchURL)
	if err != nil {
		return nil, err
	}

	mangasMap, ok := props["mangas"].(map[string]any)
	if !ok {
		return []scraper.ScrapedManga{}, nil
	}

	mangaData, ok := mangasMap["data"].([]any)
	if !ok {
		return []scraper.ScrapedManga{}, nil
	}

	results := make([]scraper.ScrapedManga, 0, len(mangaData))
	for _, itemVal := range mangaData {
		item, ok := itemVal.(map[string]any)
		if !ok {
			continue
		}
		title, _ := item["title"].(string)
		slug, _ := item["slug"].(string)
		image, _ := item["poster"].(string)
		link := fmt.Sprintf("%smanga/%s", k.baseURL, slug)

		chapter := "Read Now"
		if lastChapter, ok := item["last_chapter"].(map[string]any); ok {
			if chapTitle, ok := lastChapter["title"].(string); ok && chapTitle != "" {
				chapter = chapTitle
			}
		}

		var rating float64
		if ratingVal, ok := item["rating"]; ok && ratingVal != nil {
			if rFloat, ok := ratingVal.(float64); ok {
				rating = rFloat
			}
		}

		if title != "" && slug != "" {
			results = append(results, scraper.ScrapedManga{
				Title:   title,
				Image:   image,
				Source:  kiryuuName,
				Chapter: chapter,
				Link:    link,
				Rating:  rating,
			})
		}
	}
	return results, nil
}

func (k *Kiryuu) ScrapeDetail(ctx context.Context, link string) (*scraper.MangaDetail, error) {
	link = k.reroute(link)
	props, err := k.getInertiaProps(ctx, link)
	if err != nil {
		return nil, err
	}

	manga, ok := props["manga"].(map[string]any)
	if !ok {
		return nil, errors.New("manga details not found in props")
	}

	title, _ := manga["title"].(string)
	image, _ := manga["poster"].(string)
	synopsis, _ := manga["synopsis"].(string)
	author, _ := manga["author"].(string)
	status, _ := manga["status"].(string)
	mangaSlug, _ := manga["slug"].(string)

	var rating float64
	if ratingVal, ok := manga["rating"]; ok && ratingVal != nil {
		if rFloat, ok := ratingVal.(float64); ok {
			rating = rFloat
		}
	}

	genresList, _ := manga["genres"].([]any)
	genres := make([]string, 0, len(genresList))
	for _, gVal := range genresList {
		if gMap, ok := gVal.(map[string]any); ok {
			if gName, ok := gMap["name"].(string); ok && gName != "" {
				genres = append(genres, gName)
			}
		}
	}

	chaptersList, _ := manga["chapters"].([]any)
	chapters := make([]scraper.MangaChapter, 0, len(chaptersList))
	for _, cVal := range chaptersList {
		cMap, ok := cVal.(map[string]any)
		if !ok {
			continue
		}
		cTitle, _ := cMap["title"].(string)
		cNumber := cMap["chapter_number"]
		released, _ := cMap["created_at"].(string)

		cLink := fmt.Sprintf("%smanga/%s/chapter/%v", k.baseURL, mangaSlug, cNumber)

		if cTitle != "" {
			chapters = append(chapters, scraper.MangaChapter{
				Title:    cTitle,
				Link:     cLink,
				Released: released,
			})
		}
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

func (k *Kiryuu) ScrapeChapter(ctx context.Context, link string) (*scraper.ChapterData, error) {
	link = k.reroute(link)
	if strings.Contains(link, "-chapter-") || strings.Contains(link, "/chapter-") {
		mangaSlug, chapNum := parseMangaAndChapterFromWordPressLink(link)
		if mangaSlug != "" && chapNum != "" {
			link = fmt.Sprintf("%smanga/%s/chapter/%s", k.baseURL, mangaSlug, chapNum)
		}
	}
	props, err := k.getInertiaProps(ctx, link)
	if err != nil && strings.Contains(err.Error(), "status 404") {
		oldSlug, chapNum := parseSlugAndChapterFromInertiaLink(link)
		if oldSlug != "" && chapNum != "" {
			query := strings.ReplaceAll(oldSlug, "-", " ")
			results, searchErr := k.Search(ctx, query)
			if (searchErr != nil || len(results) == 0) && strings.Contains(oldSlug, "-") {
				words := strings.Split(oldSlug, "-")
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
					results, searchErr = k.Search(ctx, q)
					if searchErr == nil && len(results) > 0 {
						break
					}
				}
			}
			if searchErr == nil && len(results) > 0 {
				var bestMatchSlug string
				for _, r := range results {
					rSlug := cleanSlug(r.Title)
					parts := strings.Split(strings.Trim(r.Link, "/"), "/")
					resSlug := parts[len(parts)-1]
					if rSlug == oldSlug || strings.Contains(resSlug, oldSlug) || strings.Contains(oldSlug, resSlug) {
						bestMatchSlug = resSlug
						break
					}
				}
				if bestMatchSlug != "" {
					newLink := fmt.Sprintf("%smanga/%s/chapter/%s", k.baseURL, bestMatchSlug, chapNum)
					props, err = k.getInertiaProps(ctx, newLink)
				}
			}
		}
	}
	if err != nil {
		return nil, err
	}

	chapter, ok := props["chapter"].(map[string]any)
	if !ok {
		return nil, errors.New("chapter details not found in props")
	}

	manga, ok := props["manga"].(map[string]any)
	if !ok {
		return nil, errors.New("manga details not found in chapter props")
	}
	mangaSlug, _ := manga["slug"].(string)

	imagesList, _ := chapter["images"].([]any)
	images := make([]string, 0, len(imagesList))
	for _, imgVal := range imagesList {
		if imgMap, ok := imgVal.(map[string]any); ok {
			if path, ok := imgMap["image_path"].(string); ok && path != "" {
				images = append(images, strings.TrimSpace(path))
			}
		}
	}

	var next, prev string
	if nextChapter, ok := props["next"].(map[string]any); ok && nextChapter != nil {
		nextNum := nextChapter["chapter_number"]
		next = fmt.Sprintf("%smanga/%s/chapter/%v", k.baseURL, mangaSlug, nextNum)
	}
	if prevChapter, ok := props["prev"].(map[string]any); ok && prevChapter != nil {
		prevNum := prevChapter["chapter_number"]
		prev = fmt.Sprintf("%smanga/%s/chapter/%v", k.baseURL, mangaSlug, prevNum)
	}

	return &scraper.ChapterData{
		Images: images,
		Next:   next,
		Prev:   prev,
	}, nil
}

func (k *Kiryuu) ScrapeGenres(ctx context.Context) ([]scraper.GenreItem, error) {
	return []scraper.GenreItem{
		{Name: "Action", Slug: "action"},
		{Name: "Adventure", Slug: "adventure"},
		{Name: "Comedy", Slug: "comedy"},
		{Name: "Crime", Slug: "crime"},
		{Name: "Drama", Slug: "drama"},
		{Name: "Fantasy", Slug: "fantasy"},
		{Name: "Harem", Slug: "harem"},
		{Name: "Historical", Slug: "historical"},
		{Name: "Horror", Slug: "horror"},
		{Name: "Isekai", Slug: "isekai"},
		{Name: "Josei", Slug: "josei"},
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
		{Name: "Shoujo", Slug: "shoujo"},
		{Name: "Shoujo Ai", Slug: "shoujo-ai"},
		{Name: "Shounen", Slug: "shounen"},
		{Name: "Shounen Ai", Slug: "shounen-ai"},
		{Name: "Slice of Life", Slug: "slice-of-life"},
		{Name: "Sports", Slug: "sports"},
		{Name: "Supernatural", Slug: "supernatural"},
		{Name: "Thriller", Slug: "thriller"},
		{Name: "Tragedy", Slug: "tragedy"},
		{Name: "Yaoi", Slug: "yaoi"},
		{Name: "Yuri", Slug: "yuri"},
	}, nil
}

func (k *Kiryuu) ScrapeByGenre(ctx context.Context, genre string, page int) ([]scraper.ScrapedManga, error) {
	genreURL := fmt.Sprintf("%smanga?genre=%s&page=%d", k.baseURL, url.QueryEscape(genre), page)
	props, err := k.getInertiaProps(ctx, genreURL)
	if err != nil {
		return nil, err
	}

	mangasMap, ok := props["mangas"].(map[string]any)
	if !ok {
		return []scraper.ScrapedManga{}, nil
	}

	mangaData, ok := mangasMap["data"].([]any)
	if !ok {
		return []scraper.ScrapedManga{}, nil
	}

	results := make([]scraper.ScrapedManga, 0, len(mangaData))
	for _, itemVal := range mangaData {
		item, ok := itemVal.(map[string]any)
		if !ok {
			continue
		}
		title, _ := item["title"].(string)
		slug, _ := item["slug"].(string)
		image, _ := item["poster"].(string)
		link := fmt.Sprintf("%smanga/%s", k.baseURL, slug)

		chapter := "Read Now"
		if lastChapter, ok := item["last_chapter"].(map[string]any); ok {
			if chapTitle, ok := lastChapter["title"].(string); ok && chapTitle != "" {
				chapter = chapTitle
			}
		}

		var rating float64
		if ratingVal, ok := item["rating"]; ok && ratingVal != nil {
			if rFloat, ok := ratingVal.(float64); ok {
				rating = rFloat
			}
		}

		if title != "" && slug != "" {
			results = append(results, scraper.ScrapedManga{
				Title:   title,
				Image:   image,
				Source:  kiryuuName,
				Chapter: chapter,
				Link:    link,
				Rating:  rating,
			})
		}
	}
	return results, nil
}

func parseMangaAndChapterFromWordPressLink(link string) (string, string) {
	parsed, err := url.Parse(link)
	if err != nil {
		return "", ""
	}
	path := strings.Trim(parsed.Path, "/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 {
		return "", ""
	}
	lastPart := parts[len(parts)-1]

	if len(parts) >= 2 && strings.HasPrefix(lastPart, "chapter-") {
		mangaSlug := parts[len(parts)-2]
		chapNumber := parseChapterNumberFromSlug(lastPart)
		return mangaSlug, chapNumber
	}

	re := regexp.MustCompile(`^(.*?)-chapter-([0-9.-]+)$`)
	match := re.FindStringSubmatch(lastPart)
	if len(match) > 2 {
		mangaSlug := match[1]
		numStr := match[2]
		if strings.Contains(numStr, ".") {
			subParts := strings.Split(numStr, ".")
			if len(subParts[1]) >= 5 {
				numStr = subParts[0]
			}
		}
		numStr = strings.ReplaceAll(numStr, "-", ".")
		return mangaSlug, numStr
	}

	return "", ""
}

func parseChapterNumberFromSlug(chapSlug string) string {
	re := regexp.MustCompile(`chapter-([0-9.-]+)`)
	match := re.FindStringSubmatch(chapSlug)
	if len(match) > 1 {
		numStr := match[1]
		if strings.Contains(numStr, ".") {
			subParts := strings.Split(numStr, ".")
			if len(subParts[1]) >= 5 {
				return subParts[0]
			}
		}
		return strings.ReplaceAll(numStr, "-", ".")
	}
	return ""
}

func parseSlugAndChapterFromInertiaLink(link string) (string, string) {
	u, err := url.Parse(link)
	if err != nil {
		return "", ""
	}
	path := strings.Trim(u.Path, "/")
	parts := strings.Split(path, "/")
	if len(parts) >= 4 && parts[0] == "manga" && parts[2] == "chapter" {
		return parts[1], parts[3]
	}
	return "", ""
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
