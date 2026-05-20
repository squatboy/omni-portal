package config

import (
	"encoding/base64"
	"fmt"
	"os"
	"strings"
)

type AppConfig struct {
	Port        string
	DatabaseURL string
	SecretKey   []byte
}

func LoadConfig() (*AppConfig, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	secretKey, err := loadSecretKey(os.Getenv("OMNI_SECRET_KEY"))
	if err != nil {
		return nil, err
	}

	return &AppConfig{
		Port:        port,
		DatabaseURL: databaseURL,
		SecretKey:   secretKey,
	}, nil
}

func loadSecretKey(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, fmt.Errorf("OMNI_SECRET_KEY is required")
	}

	if decoded, err := base64.StdEncoding.DecodeString(value); err == nil && len(decoded) == 32 {
		return decoded, nil
	}
	if decoded, err := base64.RawStdEncoding.DecodeString(value); err == nil && len(decoded) == 32 {
		return decoded, nil
	}

	raw := []byte(value)
	if len(raw) != 32 {
		return nil, fmt.Errorf("OMNI_SECRET_KEY must be 32 bytes or base64-encoded 32 bytes")
	}
	return raw, nil
}
