package upload

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gede-cahya/komida-backend/internal/api"
)

var uploadDir = "./public/uploads"

func EnsureDir() error {
	return os.MkdirAll(uploadDir, 0755)
}

type Handler struct {
	logger *slog.Logger
}

func NewHandler(logger *slog.Logger) *Handler {
	_ = EnsureDir()
	return &Handler{logger: logger}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/upload", h.upload)
	mux.HandleFunc("/api/uploads/", h.serveFile)
}

func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}

	// Parse multipart form with 32MB max memory
	err := r.ParseMultipartForm(32 << 20)
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to parse form"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	// Validate file extension
	ext := strings.ToLower(filepath.Ext(header.Filename))
	validExts := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".webp": true,
		".gif": true, ".svg": true, ".mp4": true, ".webm": true,
	}
	if !validExts[ext] {
		api.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid file type"})
		return
	}

	// Sanitize filename
	safeName := regexp.MustCompile(`[^a-zA-Z0-9.-]`).ReplaceAllString(header.Filename, "_")
	fileName := fmt.Sprintf("%d-%s", time.Now().UnixMilli(), safeName)
	fullPath := filepath.Join(uploadDir, fileName)

	out, err := os.Create(fullPath)
	if err != nil {
		h.logger.Error("failed to create upload file", "error", err)
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save file"})
		return
	}
	defer out.Close()

	_, err = io.Copy(out, file)
	if err != nil {
		h.logger.Error("failed to write upload file", "error", err)
		api.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save file"})
		return
	}

	api.WriteJSON(w, http.StatusOK, map[string]string{"url": "/uploads/" + fileName})
}

func (h *Handler) serveFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		api.WriteJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}

	filePath := strings.TrimPrefix(r.URL.Path, "/api/uploads/")
	if filePath == "" || strings.Contains(filePath, "..") {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "File not found"})
		return
	}

	fullPath := filepath.Join(uploadDir, filePath)
	fullPath = filepath.Clean(fullPath)
	baseDir, _ := filepath.Abs(uploadDir)
	reqDir, _ := filepath.Abs(filepath.Dir(fullPath))
	if !strings.HasPrefix(reqDir, baseDir) {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "File not found"})
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		api.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "File not found"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	contentType := "application/octet-stream"
	switch ext {
	case ".png":
		contentType = "image/png"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".webp":
		contentType = "image/webp"
	case ".svg":
		contentType = "image/svg+xml"
	case ".gif":
		contentType = "image/gif"
	case ".mp4":
		contentType = "video/mp4"
	case ".webm":
		contentType = "video/webm"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, fullPath)
}
