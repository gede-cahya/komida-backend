package imageproxy

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Cache struct {
	dir      string
	ttl      time.Duration
	maxBytes int64
}

type cacheMeta struct {
	URL         string    `json:"url"`
	ContentType string    `json:"contentType"`
	CachedAt    time.Time `json:"cachedAt"`
	Size        int64     `json:"size"`
}

type CachedImage struct {
	Data        []byte
	ContentType string
	Stale       bool
}

func NewCache(dir string, ttl time.Duration, maxBytes int64) *Cache {
	return &Cache{dir: dir, ttl: ttl, maxBytes: maxBytes}
}

func (c *Cache) Get(rawURL string, allowStale bool) (*CachedImage, error) {
	dataPath, metaPath := c.paths(rawURL)
	metaBytes, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, err
	}
	var meta cacheMeta
	if err := json.Unmarshal(metaBytes, &meta); err != nil {
		return nil, err
	}
	stale := time.Since(meta.CachedAt) > c.ttl
	if stale && !allowStale {
		return nil, os.ErrNotExist
	}
	data, err := os.ReadFile(dataPath)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, errors.New("empty cached image")
	}
	contentType := meta.ContentType
	if contentType == "" {
		contentType = "image/jpeg"
	}
	return &CachedImage{Data: data, ContentType: contentType, Stale: stale}, nil
}

func (c *Cache) Set(rawURL string, data []byte, contentType string) error {
	dataPath, metaPath := c.paths(rawURL)
	if err := os.MkdirAll(filepath.Dir(dataPath), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(dataPath, data, 0o644); err != nil {
		return err
	}
	meta := cacheMeta{URL: rawURL, ContentType: contentType, CachedAt: time.Now().UTC(), Size: int64(len(data))}
	metaBytes, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	return os.WriteFile(metaPath, metaBytes, 0o644)
}

func (c *Cache) Cleanup() error {
	var files []cacheFile
	var total int64
	if err := filepath.WalkDir(c.dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(entry.Name(), ".bin") {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		total += info.Size()
		files = append(files, cacheFile{path: path, size: info.Size(), modTime: info.ModTime()})
		return nil
	}); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if total <= c.maxBytes {
		return nil
	}
	sort.Slice(files, func(i, j int) bool { return files[i].modTime.Before(files[j].modTime) })
	toFree := total - c.maxBytes
	for _, file := range files {
		if toFree <= 0 {
			break
		}
		if err := os.Remove(file.path); err == nil {
			_ = os.Remove(strings.TrimSuffix(file.path, ".bin") + ".json")
			toFree -= file.size
		}
	}
	return nil
}

func (c *Cache) paths(rawURL string) (string, string) {
	hashBytes := sha256.Sum256([]byte(rawURL))
	hash := hex.EncodeToString(hashBytes[:])
	dir := filepath.Join(c.dir, hash[:2], hash[2:4])
	base := filepath.Join(dir, hash)
	return base + ".bin", base + ".json"
}

type cacheFile struct {
	path    string
	size    int64
	modTime time.Time
}
