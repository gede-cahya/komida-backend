package imageproxy

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func TestProxyCachesSuccessfulImage(t *testing.T) {
	var upstreamHits int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits++
		if got := r.Header.Get("User-Agent"); got == "" {
			t.Fatal("expected user agent header")
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(fallbackImage)
	}))
	defer upstream.Close()

	server := newTestServer(t, true)
	handler := server.Routes()

	first := httptest.NewRecorder()
	handler.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/image/proxy?url="+upstream.URL+"/cover.png", nil))
	if first.Code != http.StatusOK {
		t.Fatalf("expected first status 200, got %d", first.Code)
	}
	if got := first.Header().Get("X-Cache"); got != "MISS" {
		t.Fatalf("expected first X-Cache MISS, got %q", got)
	}

	second := httptest.NewRecorder()
	handler.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/api/image/proxy?url="+upstream.URL+"/cover.png", nil))
	if second.Code != http.StatusOK {
		t.Fatalf("expected second status 200, got %d", second.Code)
	}
	if got := second.Header().Get("X-Cache"); got != "HIT" {
		t.Fatalf("expected second X-Cache HIT, got %q", got)
	}
	if upstreamHits != 1 {
		t.Fatalf("expected one upstream hit, got %d", upstreamHits)
	}
}

func TestProxyBlocksPrivateTargetsByDefault(t *testing.T) {
	server := newTestServer(t, false)
	recorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/image/proxy?url=http://127.0.0.1/image.png", nil))
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", recorder.Code)
	}
}

func TestProxyFallsBackForNonImageResponse(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("not image"))
	}))
	defer upstream.Close()

	server := newTestServer(t, true)
	recorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/image/proxy?url="+upstream.URL+"/bad", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("expected fallback content type image/png, got %q", got)
	}
	body, err := io.ReadAll(recorder.Body)
	if err != nil {
		t.Fatal(err)
	}
	if len(body) != len(fallbackImage) {
		t.Fatalf("expected fallback image body")
	}
}

func newTestServer(t *testing.T, allowPrivateIPs bool) *Server {
	t.Helper()
	cfg := Config{
		Addr:            ":0",
		CacheDir:        t.TempDir(),
		CacheTTL:        time.Hour,
		CacheMaxBytes:   1024 * 1024,
		FetchTimeout:    time.Second,
		MaxConcurrency:  3,
		MaxImageBytes:   1024 * 1024,
		AllowPrivateIPs: allowPrivateIPs,
		CleanupInterval: time.Hour,
	}
	return NewServer(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}
