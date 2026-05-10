package imageproxy

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Addr            string
	CacheDir        string
	CacheTTL        time.Duration
	CacheMaxBytes   int64
	FetchTimeout    time.Duration
	MaxConcurrency  int
	MaxImageBytes   int64
	AllowPrivateIPs bool
	CleanupInterval time.Duration
}

func LoadConfig() Config {
	return Config{
		Addr:            envString("IMAGE_PROXY_ADDR", ":3482"),
		CacheDir:        envString("IMAGE_PROXY_CACHE_DIR", "./cache/images-go"),
		CacheTTL:        envDuration("IMAGE_PROXY_CACHE_TTL", 7*24*time.Hour),
		CacheMaxBytes:   envBytes("IMAGE_PROXY_CACHE_MAX_BYTES", 3*1024*1024*1024),
		FetchTimeout:    envDuration("IMAGE_PROXY_FETCH_TIMEOUT", 3*time.Second),
		MaxConcurrency:  envInt("IMAGE_PROXY_MAX_CONCURRENCY", 30),
		MaxImageBytes:   envBytes("IMAGE_PROXY_MAX_IMAGE_BYTES", 25*1024*1024),
		AllowPrivateIPs: envBool("IMAGE_PROXY_ALLOW_PRIVATE_IPS", false),
		CleanupInterval: envDuration("IMAGE_PROXY_CLEANUP_INTERVAL", 6*time.Hour),
	}
}

func envString(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func envBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err == nil && parsed > 0 {
		return parsed
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}

func envBytes(key string, fallback int64) int64 {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}
