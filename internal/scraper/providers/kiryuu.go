package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/gede-cahya/komida-backend/internal/scraper"
)

const kiryuuName = "Kiryuu"

var chapterIDRegex = regexp.MustCompile(`\.(\d+)/?$`)

type Kiryuu struct {
	baseURL       string
	client        *http.Client
	genreMapCache map[string]int
}

func NewKiryuu() *Kiryuu {
	return &Kiryuu{
		baseURL:       "https://v3.kiryuu.to/",
		client:        defaultHTTPClient,
		genreMapCache: make(map[string]int),
	}
}

func (k *Kiryuu) Name() string { return kiryuuName }

func (k *Kiryuu) reroute(link string) string {
	parsed, err := url.Parse(link)
	if err != nil {
		return link
	}
	base, _ := url.Parse(k.baseURL)
	parsed.Scheme = base.Scheme
	parsed.Host = base.Host
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

func (k *Kiryuu) fetchJSON(ctx context.Context, link string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Referer", k.baseURL)
	resp, err := k.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream status %d for %s", resp.StatusCode, link)
	}
	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}

func (k *Kiryuu) fetchJSONArray(ctx context.Context, link string) ([]map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Referer", k.baseURL)
	resp, err := k.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream status %d for %s", resp.StatusCode, link)
	}
	var data []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}

func (k *Kiryuu) ScrapePopular(ctx context.Context) ([]scraper.ScrapedManga, error) {
	doc, err := k.fetch(ctx, k.baseURL)
	if err != nil {
		return nil, err
	}
	var results []scraper.ScrapedManga
	doc.Find("div#latest-list.grid > div").Each(func(_ int, s *goquery.Selection) {
		title := strings.TrimSpace(s.Find("h1").Text())
		link, _ := s.Find("a").First().Attr("href")
		img := s.Find("img.wp-post-image")
		image, _ := img.Attr("data-src")
		if image == "" {
			image, _ = img.Attr("data-lazy-src")
		}
		if image == "" {
			image, _ = img.Attr("src")
		}
		if strings.HasPrefix(image, "data:image") {
			srcset, _ := img.Attr("srcset")
			image = strings.Split(srcset, " ")[0]
		}
		chapters := s.Find("a.link-self")
		chapter := strings.TrimSpace(chapters.First().Find("p").Text())
		if chapter == "" {
			chapter = strings.TrimSpace(chapters.First().Text())
		}
		prevChapter := strings.TrimSpace(chapters.Eq(1).Find("p").Text())
		if prevChapter == "" {
			prevChapter = strings.TrimSpace(chapters.Eq(1).Text())
		}
		if title != "" && link != "" {
			results = append(results, scraper.ScrapedManga{
				Title:           title,
				Image:           image,
				Source:          kiryuuName,
				Chapter:         chapter,
				PreviousChapter: strPtr(prevChapter),
				Link:            link,
			})
		}
	})
	return results, nil
}

func (k *Kiryuu) Search(ctx context.Context, query string) ([]scraper.ScrapedManga, error) {
	apiURL := fmt.Sprintf("%swp-json/wp/v2/manga?search=%s&_embed", k.baseURL, url.QueryEscape(query))
	data, err := k.fetchJSONArray(ctx, apiURL)
	if err != nil {
		return nil, err
	}
	results := make([]scraper.ScrapedManga, 0, len(data))
	for _, item := range data {
		titleRaw, _ := item["title"].(map[string]any)
		title := "Unknown Title"
		if titleRaw != nil {
			rendered, _ := titleRaw["rendered"].(string)
			title = decodeHtmlEntities(rendered)
		}
		link, _ := item["link"].(string)
		image := ""
		embedded, ok := item["_embedded"].(map[string]any)
		if ok {
			media, ok := embedded["wp:featuredmedia"].([]any)
			if ok && len(media) > 0 {
				mediaMap, ok := media[0].(map[string]any)
				if ok {
					image, _ = mediaMap["source_url"].(string)
				}
			}
		}
		results = append(results, scraper.ScrapedManga{
			Title:   title,
			Image:   image,
			Source:  kiryuuName,
			Chapter: "Read Now",
			Link:    link,
			Rating:  0,
		})
	}
	return results, nil
}

func (k *Kiryuu) ScrapeDetail(ctx context.Context, link string) (*scraper.MangaDetail, error) {
	link = k.reroute(link)
	doc, err := k.fetch(ctx, link)
	if err != nil {
		return nil, err
	}

	title := strings.TrimSpace(doc.Find(`h1[itemprop="name"]`).First().Text())
	if title == "" {
		title = strings.TrimSpace(doc.Find("h1").First().Text())
	}

	imgEl := doc.Find("img.wp-post-image").First()
	if imgEl.Length() == 0 {
		imgEl = doc.Find(`img[itemprop="image"]`).First()
	}
	if imgEl.Length() == 0 {
		imgEl = doc.Find(".thumb img").First()
	}
	image, _ := imgEl.Attr("data-src")
	if image == "" {
		image, _ = imgEl.Attr("data-lazy-src")
	}
	if image == "" {
		image, _ = imgEl.Attr("src")
	}
	if strings.HasPrefix(image, "data:image") {
		srcset, _ := imgEl.Attr("srcset")
		image = strings.Split(srcset, " ")[0]
	}

	synopsis := strings.TrimSpace(doc.Find(`div[itemprop="description"]`).First().Text())
	if synopsis == "" {
		synopsis = strings.TrimSpace(doc.Find(".entry-content").First().Text())
	}
	if synopsis == "" {
		synopsis = strings.TrimSpace(doc.Find(".seriestucon").First().Text())
	}

	genres := doc.Find(`a[itemprop="genre"]`).Map(func(_ int, s *goquery.Selection) string {
		return strings.TrimSpace(s.Text())
	})
	if len(genres) == 0 {
		genres = doc.Find(".gnr a, .mgen a, .seriestugenre a, a[href*=\"/genre/\"]").Map(func(_ int, s *goquery.Selection) string {
			return strings.TrimSpace(s.Text())
		})
	}
	genres = uniqueStrings(genres)

	status := "Ongoing"
	doc.Find(".tsinfo .imptdt").Each(func(_ int, s *goquery.Selection) {
		label := strings.ToLower(s.Text())
		if strings.Contains(label, "status") {
			status = strings.TrimSpace(s.Find("i").Text())
		}
	})

	author := "Unknown"
	doc.Find(".tsinfo .imptdt").Each(func(_ int, s *goquery.Selection) {
		label := strings.ToLower(s.Text())
		if strings.Contains(label, "author") {
			author = strings.TrimSpace(s.Find("i").Text())
		}
	})

	ratingText := strings.TrimSpace(doc.Find(`[itemprop="ratingValue"]`).Text())
	if ratingText == "" {
		ratingText = strings.TrimSpace(doc.Find(".num").Text())
	}
	rating, _ := strconv.ParseFloat(ratingText, 64)

	chapters := k.scrapeChapters(ctx, doc)

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

func (k *Kiryuu) scrapeChapters(ctx context.Context, doc *goquery.Document) []scraper.MangaChapter {
	var chapters []scraper.MangaChapter

	ajaxContainer := doc.Find(`div[hx-trigger="getChapterList"]`)
	if ajaxContainer.Length() > 0 {
		ajaxURL, exists := ajaxContainer.Attr("hx-get")
		if exists && ajaxURL != "" {
			ajaxURL = strings.ReplaceAll(ajaxURL, "&#038;", "&")
			if u, err := url.Parse(ajaxURL); err == nil && !u.IsAbs() {
				ajaxURL = k.baseURL + strings.TrimPrefix(ajaxURL, "/")
			}
			if ajaxDoc, err := k.fetch(ctx, ajaxURL); err == nil {
				ajaxDoc.Find("div[data-chapter-number]").Each(func(_ int, s *goquery.Selection) {
					linkEl := s.Find("a").First()
					title := strings.TrimSpace(linkEl.Find(".flex.flex-row.gap-1 span").Text())
					if title == "" {
						title = strings.TrimSpace(linkEl.Text())
					}
					chapLink, _ := linkEl.Attr("href")
					released := linkEl.Find("time").AttrOr("datetime", linkEl.Find("time").Text())
					if chapLink != "" {
						chapters = append(chapters, scraper.MangaChapter{
							Title:    title,
							Link:     resolveURL(chapLink, k.baseURL),
							Released: released,
						})
					}
				})
			}
		}
	}

	if len(chapters) == 0 {
		doc.Find("#chapterlist ul li, .eplister li, .rclist > li, #cl ul li").Each(func(_ int, s *goquery.Selection) {
			linkEl := s.Find("a")
			title := strings.TrimSpace(linkEl.Find(".chapternum").Text())
			if title == "" {
				title = strings.TrimSpace(linkEl.Text())
			}
			chapLink, _ := linkEl.Attr("href")
			released := strings.TrimSpace(s.Find(".chapterdate").Text())
			if title != "" && chapLink != "" {
				chapters = append(chapters, scraper.MangaChapter{
					Title:    title,
					Link:     chapLink,
					Released: released,
				})
			}
		})
	}

	if len(chapters) == 0 {
		doc.Find("a").Each(func(_ int, s *goquery.Selection) {
			chapLink, exists := s.Attr("href")
			if !exists || chapLink == "" || chapLink == "#" {
				return
			}
			if !strings.Contains(chapLink, "chapter") || !strings.HasPrefix(chapLink, k.baseURL) {
				return
			}
			title := strings.TrimSpace(s.Find(".chapternum").Text())
			if title == "" || len(title) > 50 {
				title = strings.TrimSpace(s.Text())
			}
			if title == "" || len(title) > 50 {
				match := regexp.MustCompile(`chapter-([0-9.]+)`).FindStringSubmatch(chapLink)
				if len(match) > 1 {
					title = "Chapter " + match[1]
				} else {
					title = "Chapter"
				}
			}
			found := false
			for _, c := range chapters {
				if c.Link == chapLink {
					found = true
					break
				}
			}
			if !found {
				chapters = append(chapters, scraper.MangaChapter{
					Title: title,
					Link:  chapLink,
				})
			}
		})
	}

	return chapters
}

func (k *Kiryuu) ScrapeChapter(ctx context.Context, link string) (*scraper.ChapterData, error) {
	link = k.reroute(link)
	images := []string{}
	var next, prev string

	if match := chapterIDRegex.FindStringSubmatch(link); len(match) > 1 {
		chapterID := match[1]
		apiURL := fmt.Sprintf("%swp-json/wp/v2/chapter/%s", k.baseURL, chapterID)
		if data, err := k.fetchJSON(ctx, apiURL); err == nil {
			content, ok := data["content"].(map[string]any)
			if ok {
				rendered, ok := content["rendered"].(string)
				if ok && rendered != "" {
					doc, err := goquery.NewDocumentFromReader(strings.NewReader(rendered))
					if err == nil {
						doc.Find("img").Each(func(_ int, s *goquery.Selection) {
							src, _ := s.Attr("src")
							if src != "" && !strings.HasPrefix(src, "data:image") {
								images = append(images, strings.TrimSpace(src))
							}
						})
					}
				}
			}
		}
	}

	if len(images) == 0 {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		resp, err := k.client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("upstream status %d for %s", resp.StatusCode, link)
		}
		body, _ := io.ReadAll(resp.Body)
		doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
		if err != nil {
			return nil, err
		}

		doc.Find("#readerarea img").Each(func(_ int, s *goquery.Selection) {
			src, _ := s.Attr("data-src")
			if src == "" {
				src, _ = s.Attr("src")
			}
			if src != "" && !strings.HasPrefix(src, "data:image") {
				images = append(images, strings.TrimSpace(src))
			}
		})

		if len(images) == 0 {
			doc.Find(`section[data-image-data] img`).Each(func(_ int, s *goquery.Selection) {
				src, _ := s.Attr("src")
				if src == "" {
					src, _ = s.Attr("data-src")
				}
				if src != "" && !strings.HasPrefix(src, "data:image") {
					images = append(images, strings.TrimSpace(src))
				}
			})
		}

		if len(images) == 0 {
			doc.Find("script").Each(func(_ int, s *goquery.Selection) {
				text := s.Text()
				if !strings.Contains(text, "ts_reader") {
					return
				}
				match := regexp.MustCompile(`ts_reader\.run\((.*?)\);`).FindStringSubmatch(text)
				if len(match) < 2 {
					return
				}
				var data struct {
					Sources []struct {
						Images []string `json:"images"`
					} `json:"sources"`
				}
				if err := json.Unmarshal([]byte(match[1]), &data); err == nil {
					for _, src := range data.Sources {
						for _, img := range src.Images {
							if img != "" && !strings.HasPrefix(img, "data:image") {
								images = append(images, strings.TrimSpace(img))
							}
						}
					}
				}
			})
		}

		next = doc.Find(`a[aria-label="Next"]`).AttrOr("href", "")
		if next == "" {
			next = doc.Find(".nextprev a.next_ch").AttrOr("href", "")
		}
		if next == "" {
			next = doc.Find(`a[rel="next"]`).AttrOr("href", "")
		}
		if next == "#" || next == "" || next == "javascript:void(0)" {
			next = ""
		}

		prev = doc.Find(`a[aria-label="Prev"]`).AttrOr("href", "")
		if prev == "" {
			prev = doc.Find(".nextprev a.prev_ch").AttrOr("href", "")
		}
		if prev == "" {
			prev = doc.Find(`a[rel="prev"]`).AttrOr("href", "")
		}
		if prev == "#" || prev == "" || prev == "javascript:void(0)" {
			prev = ""
		}
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
	genreID, err := k.getGenreID(ctx, genre)
	if err != nil {
		return nil, err
	}
	if genreID == 0 {
		return []scraper.ScrapedManga{}, nil
	}
	apiURL := fmt.Sprintf("%swp-json/wp/v2/manga?genre=%d&page=%d&_embed", k.baseURL, genreID, page)
	data, err := k.fetchJSONArray(ctx, apiURL)
	if err != nil {
		return nil, err
	}
	results := make([]scraper.ScrapedManga, 0, len(data))
	for _, item := range data {
		titleRaw, _ := item["title"].(map[string]any)
		title := "Unknown Title"
		if titleRaw != nil {
			rendered, _ := titleRaw["rendered"].(string)
			title = decodeHtmlEntities(rendered)
		}
		link, _ := item["link"].(string)
		image := ""
		embedded, ok := item["_embedded"].(map[string]any)
		if ok {
			media, ok := embedded["wp:featuredmedia"].([]any)
			if ok && len(media) > 0 {
				mediaMap, ok := media[0].(map[string]any)
				if ok {
					image, _ = mediaMap["source_url"].(string)
				}
			}
		}
		results = append(results, scraper.ScrapedManga{
			Title:   title,
			Image:   image,
			Source:  kiryuuName,
			Chapter: "Read Now",
			Link:    link,
			Rating:  0,
		})
	}
	return results, nil
}

func (k *Kiryuu) getGenreID(ctx context.Context, slug string) (int, error) {
	if id, ok := k.genreMapCache[slug]; ok {
		return id, nil
	}
	apiURL := fmt.Sprintf("%swp-json/wp/v2/genre?slug=%s", k.baseURL, url.QueryEscape(slug))
	data, err := k.fetchJSONArray(ctx, apiURL)
	if err != nil {
		return 0, err
	}
	if len(data) == 0 {
		return 0, nil
	}
	idFloat, ok := data[0]["id"].(float64)
	if !ok {
		return 0, nil
	}
	id := int(idFloat)
	k.genreMapCache[slug] = id
	return id, nil
}
