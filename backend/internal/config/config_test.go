package config

import "testing"

func TestLoadConfigUsesCoreRuntimeEnv(t *testing.T) {
	t.Setenv("PORT", "9000")
	t.Setenv("DATABASE_URL", "postgres://omni:secret@localhost:5432/omni?sslmode=disable")
	t.Setenv("OMNI_SECRET_KEY", "0123456789abcdef0123456789abcdef")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected config to load: %v", err)
	}
	if cfg.Port != "9000" {
		t.Fatalf("expected port 9000, got %q", cfg.Port)
	}
}
