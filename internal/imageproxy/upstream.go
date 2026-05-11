package imageproxy

import (
	"net/url"
	"strings"
)

const browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

func refererFor(rawURL string, source string) string {
	parsed, err := url.Parse(rawURL)
	referer := "https://kiryuu.id/"
	if err == nil && parsed.Scheme != "" && parsed.Host != "" {
		referer = parsed.Scheme + "://" + parsed.Host + "/"
	}
	lowerURL := strings.ToLower(rawURL)
	lowerSource := strings.ToLower(source)
	switch {
	case strings.Contains(lowerURL, "kiryuu.to"):
		return referer
	case strings.Contains(lowerURL, "softkomik") || strings.Contains(lowerURL, "softdevices") || lowerSource == "softkomik":
		return "https://softkomik.com/"
	case strings.Contains(lowerURL, "yuucdn") || lowerSource == "kiryuu":
		return "https://kiryuu03.com/"
	case strings.Contains(lowerURL, "manhwaindo") || lowerSource == "manhwaindo":
		return "https://www.manhwaindo.my/"
	default:
		return referer
	}
}

func isImageContentType(contentType string) bool {
	lower := strings.ToLower(contentType)
	return strings.HasPrefix(lower, "image/")
}
