package main

import (
	"context"
	"log"
	"net/http"
	"omni-backend/internal/api"
	"omni-backend/internal/collector"
	"omni-backend/internal/config"
	ipamservice "omni-backend/internal/ipam"
	"omni-backend/internal/store"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load() // Ignore error if .env doesn't exist

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	st, err := store.Open(ctx, cfg.DatabaseURL, cfg.SecretKey)
	if err != nil {
		log.Fatalf("Failed to connect database: %v", err)
	}
	defer st.Close()

	if err := st.Migrate(ctx); err != nil {
		log.Fatalf("Failed to apply migrations: %v", err)
	}

	cache := collector.NewCache()
	runner := collector.NewRunner(cache, st)
	ipamScanner := ipamservice.NewScanner(st, nil)
	ipamScheduler := ipamservice.NewScheduler(st, ipamScanner, 0)

	log.Println("Starting collector runner...")
	runner.Start(ctx)

	log.Println("Starting IPAM scheduler...")
	ipamScheduler.Start(ctx)

	router := api.SetupRouter(cache, runner, st, cfg, ipamScanner)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Server listening on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Listen error: %s\n", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	cancel() // Stop the background collector

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exiting")
}
