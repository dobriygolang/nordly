package config

import (
	"fmt"
	"os"
	"strings"
)

// BotConfig holds Telegram bot configuration.
type BotConfig struct {
	RedisAddr        string
	RedisPassword    string
	TelegramBotToken string
}

// LoadBot reads bot configuration from environment variables.
func LoadBot() (*BotConfig, error) {
	token := getEnv("TELEGRAM_BOT_TOKEN", "")
	if token == "" {
		return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN is required")
	}
	if getEnv("APP_ENV", "development") == "production" && strings.TrimSpace(os.Getenv("REDIS_PASSWORD")) == "" {
		return nil, fmt.Errorf("REDIS_PASSWORD must be set in production")
	}

	return &BotConfig{
		RedisAddr:        getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:    os.Getenv("REDIS_PASSWORD"),
		TelegramBotToken: token,
	}, nil
}
