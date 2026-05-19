package config

import (
	"encoding/json"
	"os"

	"omni-backend/internal/models"
)

type AppConfig struct {
	Port              string
	InventoryFilePath string
	Inventory         models.CollectInventoryConfig
}

func LoadConfig() (*AppConfig, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	inventoryPath := os.Getenv("INVENTORY_PATH")
	if inventoryPath == "" {
		inventoryPath = "../config/inventory.example.json"
	}

	cfg := &AppConfig{
		Port:              port,
		InventoryFilePath: inventoryPath,
	}

	file, err := os.Open(inventoryPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&cfg.Inventory); err != nil {
		return nil, err
	}

	return cfg, nil
}
