package providers

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/gede-cahya/komida-backend/internal/scraper"
)

type ManhwaIndoScraper struct{}

func (s *ManhwaIndoScraper) Name() string { return "ManhwaIndo" }

func (s *ManhwaIndoScraper) reroute(link string) string {
	u, err := parseURL(link)
	if err != nil {
		return link
	}
	u.Scheme = "https"
	u.Host = "www.manhwaindo.my"
	return u.String()
}

func (s *ManhwaIndoScraper) formatDate(dateStr string) string {
	months := map[string]string{
		"Januari": "January", "Februari": "February", "Maret": "March",
		"April": "April", "Mei": "May", "Juni": "June",
		"Juli": "July", "Agustus": "August", "September": "September",
		"Oktober": "October", "November": "November", "Desember": "December",
		"Agust": "August", "Okt": "October", "Nov": "November", "Des": "December",
	}
	re := regexp.MustCompile(`\b(` + strings.Join(keysOf(months), "|") + `)\b`)
	return re.ReplaceAllStringFunc(dateStr, func(m string) string {
		if v, ok := months[m]; ok {
			return v
		}
		return m
	})
}

func (s *ManhwaIndoScraper) ScrapePopular(ctx context.Context) ([]scraper.ScrapedManga, error) {
	resp, err := fetchWithContext(ctx, "https://www.manhwaindo.my/", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}
	var list []scraper.ScrapedManga
	doc.Find(".utao .uta").Each(func(_ int, el *goquery.Selection) {
		title := strings.TrimSpace(el.Find(".luf h4").Text())
		link, _ := el.Find(".luf a.series").Attr("href")
		imgEl := el.Find(".imgu img")
		image := coalesceAttr(imgEl, "data-src", "data-original", "src")
		chapter := strings.TrimSpace(el.Find(".luf ul li:nth-child(1) a").Text())
		prevChapter := strings.TrimSpace(el.Find(".luf ul li:nth-child(2) a").Text())
		if title != "" && link != "" {
			list = append(list, scraper.ScrapedManga{
				Title:           title,
				Image:           image,
				Source:          s.Name(),
				Chapter:         chapter,
				PreviousChapter: strPtr(prevChapter),
				Link:            link,
			})
		}
	})
	return list, nil
}

func (s *ManhwaIndoScraper) Search(ctx context.Context, query string) ([]scraper.ScrapedManga, error) {
	url := fmt.Sprintf("https://www.manhwaindo.my/?s=%s", urlEncode(query))
	headers := map[string]string{
		"User-Agent":      userAgent,
		"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.5",
		"Referer":         "https://www.manhwaindo.my/",
	}
	resp, err := fetchWithContext(ctx, url, headers)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}
	var list []scraper.ScrapedManga
	doc.Find(".listupd .bs").Each(func(_ int, el *goquery.Selection) {
		title := strings.TrimSpace(el.Find(".tt a").Text())
		if title == "" {
			title = strings.TrimSpace(el.Find(".tt").Text())
		}
		link, _ := el.Find("a").Attr("href")
		imgEl := el.Find("img")
		image := coalesceAttr(imgEl, "data-src", "data-original", "src")
		chapter := strings.TrimSpace(el.Find(".epxs").Text())
		if title != "" && link != "" {
			list = append(list, scraper.ScrapedManga{
				Title:   title,
				Image:   image,
				Source:  s.Name(),
				Chapter: chapter,
				Link:    link,
			})
		}
	})
	return list, nil
}

func (s *ManhwaIndoScraper) ScrapeDetail(ctx context.Context, link string) (*scraper.MangaDetail, error) {
	link = s.reroute(link)
	resp, err := fetchWithContext(ctx, link, defaultHeaders())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}
	title := strings.TrimSpace(doc.Find("h1").First().Text())
	imgEl := doc.Find(".series-thumb img")
	if imgEl.Length() == 0 {
		imgEl = doc.Find(".thumb img")
	}
	image := coalesceAttr(imgEl, "data-src", "data-original", "src")
	synopsis := strings.TrimSpace(doc.Find(".series-synopsys").Text())
	if synopsis == "" {
		synopsis = strings.TrimSpace(doc.Find(".entry-content").Text())
	}
	var genres []string
	doc.Find(".series-genres a, .genre-info a").Each(func(_ int, el *goquery.Selection) {
		genres = append(genres, strings.TrimSpace(el.Text()))
	})
	author := strings.TrimSpace(doc.Find(".series-infolist li:contains('Author') span").Text())
	if author == "" {
		author = "Unknown"
	}
	var chapters []scraper.MangaChapter
	doc.Find(".series-chapterlist li, #chapterlist li").Each(func(_ int, el *goquery.Selection) {
		linkEl := el.Find("a")
		chapTitle := strings.TrimSpace(linkEl.Find(".chapternum").Text())
		if chapTitle == "" {
			chapTitle = strings.TrimSpace(linkEl.Find(".chapter-name").Text())
		}
		if chapTitle == "" {
			clone := linkEl.Clone()
			clone.Find(".chapterdate, .chapter-date").Remove()
			chapTitle = strings.TrimSpace(clone.Text())
		}
		chapLink, _ := linkEl.Attr("href")
		rawDate := strings.TrimSpace(linkEl.Find(".chapterdate").Text())
		if rawDate == "" {
			rawDate = strings.TrimSpace(linkEl.Find(".chapter-date").Text())
		}
		if rawDate == "" {
			rawDate = strings.TrimSpace(el.Find(".chapter-date").Text())
		}
		if chapTitle != "" && chapLink != "" {
			chapters = append(chapters, scraper.MangaChapter{
				Title:    chapTitle,
				Link:     chapLink,
				Released: s.formatDate(rawDate),
			})
		}
	})
	return &scraper.MangaDetail{
		Title:    title,
		Image:    image,
		Synopsis: synopsis,
		Genres:   genres,
		Author:   author,
		Status:   "Ongoing",
		Chapters: chapters,
	}, nil
}

func (s *ManhwaIndoScraper) ScrapeChapter(ctx context.Context, link string) (*scraper.ChapterData, error) {
	link = s.reroute(link)
	resp, err := fetchWithContext(ctx, link, defaultHeaders())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}
	var images []string
	doc.Find("#readerarea img, .reading-content img").Each(func(_ int, el *goquery.Selection) {
		dataSrc, _ := el.Attr("data-src")
		src, _ := el.Attr("src")
		valid := dataSrc
		if valid == "" {
			valid = src
		}
		if valid != "" && !strings.HasPrefix(valid, "data:image") {
			images = append(images, strings.TrimSpace(valid))
		} else if valid != "" && len(valid) > 1000 {
			images = append(images, strings.TrimSpace(valid))
		}
	})
	var next, prev string
	scriptContent := ""
	doc.Find("script").Each(func(_ int, el *goquery.Selection) {
		scriptContent += " " + el.Text()
	})
	if m := regexp.MustCompile(`"nextUrl"\s*:\s*"([^"]*)"`).FindStringSubmatch(scriptContent); m != nil {
		url := strings.ReplaceAll(m[1], `\\`, "")
		if strings.HasPrefix(url, "http") {
			next = url
		}
	}
	if m := regexp.MustCompile(`"prevUrl"\s*:\s*"([^"]*)"`).FindStringSubmatch(scriptContent); m != nil {
		url := strings.ReplaceAll(m[1], `\\`, "")
		if strings.HasPrefix(url, "http") {
			prev = url
		}
	}
	return &scraper.ChapterData{Images: images, Next: next, Prev: prev}, nil
}

func (s *ManhwaIndoScraper) ScrapeGenres(ctx context.Context) ([]scraper.GenreItem, error) {
	return nil, nil // Not implemented in TypeScript version
}

func (s *ManhwaIndoScraper) ScrapeByGenre(ctx context.Context, genre string, page int) ([]scraper.ScrapedManga, error) {
	return nil, nil // Not implemented in TypeScript version
}
