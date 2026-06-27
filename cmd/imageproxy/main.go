package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gede-cahya/komida-backend/internal/admin"
	"github.com/gede-cahya/komida-backend/internal/analytics"
	"github.com/gede-cahya/komida-backend/internal/auth"
	"github.com/gede-cahya/komida-backend/internal/comment"
	"github.com/gede-cahya/komida-backend/internal/imageproxy"
	"github.com/gede-cahya/komida-backend/internal/manga"
	"github.com/gede-cahya/komida-backend/internal/middleware"
	"github.com/gede-cahya/komida-backend/internal/payment"
	"github.com/gede-cahya/komida-backend/internal/quest"
	"github.com/gede-cahya/komida-backend/internal/shop"
	"github.com/gede-cahya/komida-backend/internal/tier"
	"github.com/gede-cahya/komida-backend/internal/upload"
	"github.com/gede-cahya/komida-backend/internal/user"
	"github.com/gede-cahya/komida-backend/internal/web3wallet"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg := imageproxy.LoadConfig()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	app := imageproxy.NewServer(cfg, logger)
	app.StartCleanup(ctx)
	mux := http.NewServeMux()
	app.Register(mux)
	manga.NewScraperHandler(logger).Register(mux)
	upload.NewHandler(logger).Register(mux)
	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		pool, err := pgxpool.New(ctx, databaseURL)
		if err != nil {
			logger.Error("database pool initialization failed", "error", err)
			os.Exit(1)
		}
		defer pool.Close()
		app.SetDB(pool)
		userRepo := user.NewRepository(pool)
		manga.NewHandler(manga.NewRepository(pool), logger).Register(mux)
		auth.NewHandler(userRepo, logger).Register(mux)
		user.NewHandler(userRepo, logger).Register(mux)
		comment.NewHandler(comment.NewRepository(pool), logger).Register(mux)
		analytics.NewHandler(analytics.NewRepository(pool), logger).Register(mux)
		admin.NewHandler(pool, logger).Register(mux)
		quest.NewHandler(quest.NewRepository(pool), logger).Register(mux)
		tier.NewHandler(pool, logger).Register(mux)
		shop.NewHandler(shop.NewRepository(pool), logger).Register(mux)
		web3wallet.NewHandler(userRepo, logger).Register(mux)
		payment.NewHandler(pool, logger).Register(mux)
		logger.Info("public manga read routes enabled")
		logger.Info("auth/user/comment/analytics/admin/quest/tier/shop/web3/payment routes enabled")
	} else {
		logger.Info("public manga read routes disabled because DATABASE_URL is empty")
		logger.Info("auth/user/comment routes disabled because DATABASE_URL is empty")
	}
	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           middleware.APIKeyGuard(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		logger.Info("komida sidecar listening", "addr", cfg.Addr, "cacheDir", cfg.CacheDir)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("sidecar failed", "error", err)
			os.Exit(1)
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("image proxy shutdown failed", "error", err)
		os.Exit(1)
	}
	logger.Info("image proxy stopped")
}
