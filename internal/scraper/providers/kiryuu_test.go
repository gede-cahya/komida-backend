package providers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestKiryuuScrapeDetail(t *testing.T) {
	html := `<html><body>
<h1 itemprop="name">Test Manga</h1>
<img class="wp-post-image" data-src="https://example.com/cover.jpg" />
<div itemprop="description">Great synopsis</div>
<a itemprop="genre">Action</a>
<a itemprop="genre">Adventure</a>
<div class="tsinfo"><div class="imptdt">Status<i>Ongoing</i></div></div>
<div class="tsinfo"><div class="imptdt">Author<i>Test Author</i></div></div>
<span itemprop="ratingValue">4.5</span>
<div id="chapterlist"><ul><li><a href="https://v3.kiryuu.to/chapter/1/"><span class="chapternum">Chapter 1</span></a></li></ul></div>
</body></html>`

	k := NewKiryuu()
	k.baseURL = "https://v3.kiryuu.to/"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(html))
	}))
	defer server.Close()

	// override base URL for test via private field access is not possible; instead test via fetch mock
	// We'll test using a public approach by modifying baseURL and resolving links
	// Actually we can test the parser directly by passing a goquery.Document
	// But since fetch is private, let's test via server URL
	// We need to make baseURL configurable for test
	k.baseURL = server.URL + "/"
	detail, err := k.ScrapeDetail(context.Background(), server.URL+"/manga/test/")
	if err != nil {
		t.Fatalf("scrapeDetail error: %v", err)
	}
	if detail.Title != "Test Manga" {
		t.Fatalf("expected title 'Test Manga', got %q", detail.Title)
	}
	if detail.Image != "https://example.com/cover.jpg" {
		t.Fatalf("expected image cover.jpg, got %q", detail.Image)
	}
	if detail.Synopsis != "Great synopsis" {
		t.Fatalf("expected synopsis 'Great synopsis', got %q", detail.Synopsis)
	}
	if len(detail.Genres) != 2 || detail.Genres[0] != "Action" {
		t.Fatalf("expected genres [Action Adventure], got %v", detail.Genres)
	}
	if detail.Status != "Ongoing" {
		t.Fatalf("expected status Ongoing, got %q", detail.Status)
	}
	if detail.Author != "Test Author" {
		t.Fatalf("expected author 'Test Author', got %q", detail.Author)
	}
	if detail.Rating != 4.5 {
		t.Fatalf("expected rating 4.5, got %f", detail.Rating)
	}
	if len(detail.Chapters) != 1 {
		t.Fatalf("expected 1 chapter, got %d", len(detail.Chapters))
	}
	if detail.Chapters[0].Title != "Chapter 1" {
		t.Fatalf("expected chapter title 'Chapter 1', got %q", detail.Chapters[0].Title)
	}
}

func TestKiryuuScrapeChapterFromHTML(t *testing.T) {
	html := `<html><body>
<div id="readerarea">
<img data-src="https://cdn.example.com/1.jpg" />
<img data-src="https://cdn.example.com/2.jpg" />
</div>
<a aria-label="Next" href="https://v3.kiryuu.to/chapter/2/"></a>
<a aria-label="Prev" href="https://v3.kiryuu.to/chapter/0/"></a>
</body></html>`

	k := NewKiryuu()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(html))
	}))
	defer server.Close()

	k.baseURL = server.URL + "/"
	data, err := k.ScrapeChapter(context.Background(), server.URL+"/chapter/1/")
	if err != nil {
		t.Fatalf("scrapeChapter error: %v", err)
	}
	if len(data.Images) != 2 {
		t.Fatalf("expected 2 images, got %d", len(data.Images))
	}
	if data.Images[0] != "https://cdn.example.com/1.jpg" {
		t.Fatalf("expected image 1.jpg, got %q", data.Images[0])
	}
	if !strings.Contains(data.Next, "chapter/2") {
		t.Fatalf("expected next chapter/2, got %q", data.Next)
	}
	if !strings.Contains(data.Prev, "chapter/0") {
		t.Fatalf("expected prev chapter/0, got %q", data.Prev)
	}
}

func TestKiryuuScrapeChapterFromTsReader(t *testing.T) {
	html := `<html><body>
<script>var x = 1; ts_reader.run({"sources":[{"images":["https://cdn.example.com/a.jpg","https://cdn.example.com/b.jpg"]}]});</script>
</body></html>`

	k := NewKiryuu()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(html))
	}))
	defer server.Close()

	k.baseURL = server.URL + "/"
	data, err := k.ScrapeChapter(context.Background(), server.URL+"/chapter/1/")
	if err != nil {
		t.Fatalf("scrapeChapter error: %v", err)
	}
	if len(data.Images) != 2 {
		t.Fatalf("expected 2 images from ts_reader, got %d", len(data.Images))
	}
	if data.Images[0] != "https://cdn.example.com/a.jpg" {
		t.Fatalf("expected image a.jpg, got %q", data.Images[0])
	}
}
