package providers

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

var defaultHTTPClient = &http.Client{
	Timeout: 15 * time.Second,
}

func fetchWithContext(ctx context.Context, link string, headers map[string]string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	if headers != nil {
		for k, v := range headers {
			req.Header.Set(k, v)
		}
	}
	resp, err := defaultHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		resp.Body.Close()
		return nil, fmt.Errorf("upstream status %d for %s", resp.StatusCode, link)
	}
	return resp, nil
}

func defaultHeaders() map[string]string {
	return map[string]string{
		"User-Agent": userAgent,
	}
}

func keysOf(m map[string]string) []string {
	var keys []string
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func coalesceAttr(s *goquery.Selection, attrs ...string) string {
	for _, attr := range attrs {
		if v, ok := s.Attr(attr); ok && v != "" {
			return v
		}
	}
	return ""
}

func parseURL(link string) (*url.URL, error) {
	return url.Parse(link)
}

func urlEncode(s string) string {
	return url.QueryEscape(s)
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func uniqueStrings(s []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, v := range s {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		key := strings.ToLower(v)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, v)
	}
	return out
}

func resolveURL(raw, base string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if u.IsAbs() {
		return u.String()
	}
	b, err := url.Parse(base)
	if err != nil {
		return raw
	}
	return b.ResolveReference(u).String()
}

var htmlEntityReplacer = strings.NewReplacer(
	"&amp;", "&",
	"&lt;", "<",
	"&gt;", ">",
	"&quot;", `"`,
	"&#039;", "'",
	"&rsquo;", "'",
)

func decodeHtmlEntities(text string) string {
	text = htmlEntityReplacer.Replace(text)
	return regexp.MustCompile(`&#(\d+);`).ReplaceAllStringFunc(text, func(match string) string {
		numStr := match[2 : len(match)-1]
		num, err := strconv.Atoi(numStr)
		if err != nil {
			return match
		}
		return string(rune(num))
	})
}
