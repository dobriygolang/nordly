package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	"github.com/dobriygolang/project-nordly/services/identity/internal/tools/ops"
)

// Config holds application configuration loaded from environment.
type Config struct {
	AppEnv        string
	LogLevel      string
	HTTPPort      int
	GRPCPort      int
	GRPCHost      string
	PostgresDSN   string
	RedisAddr     string
	RedisPassword string

	JWTPrivateKeyPEM []byte
	JWTPublicKeyPEM  []byte
	JWTAccessTTL     time.Duration
	JWTRefreshTTL    time.Duration

	TelegramBotToken    string
	TelegramBotUsername string

	CORSAllowedOrigins     []string
	AuthRateLimitPerMinute int
	InternalAPIToken       string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	httpPort, err := parsePort("HTTP_PORT", "8080")
	if err != nil {
		return nil, err
	}

	grpcPort, err := parsePort("GRPC_PORT", "9090")
	if err != nil {
		return nil, err
	}

	accessTTL, err := time.ParseDuration(getEnv("JWT_ACCESS_TTL", "15m"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_ACCESS_TTL: %w", err)
	}
	if !authmodel.IsValidAccessTokenTTL(accessTTL) {
		return nil, fmt.Errorf(
			"JWT_ACCESS_TTL must be whole seconds within [%s, %s]",
			authmodel.MinTokenTTL,
			authmodel.MaxAccessTokenTTL,
		)
	}

	refreshTTL, err := time.ParseDuration(getEnv("JWT_REFRESH_TTL", "720h"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_REFRESH_TTL: %w", err)
	}
	if !authmodel.IsValidRefreshTokenTTL(refreshTTL) {
		return nil, fmt.Errorf(
			"JWT_REFRESH_TTL must be whole seconds within [%s, %s]",
			authmodel.MinTokenTTL,
			authmodel.MaxRefreshTokenTTL,
		)
	}

	authRateLimit, err := strconv.Atoi(getEnv("AUTH_RATE_LIMIT_PER_MINUTE", "60"))
	if err != nil {
		return nil, fmt.Errorf("invalid AUTH_RATE_LIMIT_PER_MINUTE: %w", err)
	}
	if authRateLimit <= 0 {
		return nil, errors.New("AUTH_RATE_LIMIT_PER_MINUTE must be greater than zero")
	}

	privateKey, err := loadPEM("JWT_PRIVATE_KEY", "JWT_PRIVATE_KEY_FILE")
	if err != nil {
		return nil, fmt.Errorf("jwt private key: %w", err)
	}

	publicKey, err := loadPEM("JWT_PUBLIC_KEY", "JWT_PUBLIC_KEY_FILE")
	if err != nil {
		return nil, fmt.Errorf("jwt public key: %w", err)
	}

	appEnv := getEnv("APP_ENV", "development")
	internalToken := getEnv("INTERNAL_API_TOKEN", "dev-internal-token")
	if appEnv == "production" {
		if strings.TrimSpace(internalToken) == "" || internalToken == "dev-internal-token" {
			return nil, fmt.Errorf("INTERNAL_API_TOKEN must be set in production")
		}
		if strings.TrimSpace(os.Getenv("REDIS_PASSWORD")) == "" {
			return nil, fmt.Errorf("REDIS_PASSWORD must be set in production")
		}
	}

	telegramToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if strings.TrimSpace(telegramToken) == "" {
		return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN is required")
	}
	telegramUsername := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_USERNAME"))
	if telegramUsername == "" {
		return nil, fmt.Errorf("TELEGRAM_BOT_USERNAME is required")
	}

	return &Config{
		AppEnv:                 appEnv,
		LogLevel:               getEnv("LOG_LEVEL", "info"),
		HTTPPort:               httpPort,
		GRPCPort:               grpcPort,
		GRPCHost:               grpcListenHost(),
		PostgresDSN:            getEnv("POSTGRES_DSN", "postgres://postgres:postgres@localhost:5432/nordly?sslmode=disable"),
		RedisAddr:              getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:          os.Getenv("REDIS_PASSWORD"),
		JWTPrivateKeyPEM:       privateKey,
		JWTPublicKeyPEM:        publicKey,
		JWTAccessTTL:           accessTTL,
		JWTRefreshTTL:          refreshTTL,
		TelegramBotToken:       telegramToken,
		TelegramBotUsername:    telegramUsername,
		CORSAllowedOrigins:     ops.ParseOrigins(getEnv("CORS_ALLOWED_ORIGINS", "")),
		AuthRateLimitPerMinute: authRateLimit,
		InternalAPIToken:       internalToken,
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parsePort(key, fallback string) (int, error) {
	value := getEnv(key, fallback)
	port, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %w", key, err)
	}
	if port < 1 || port > 65535 {
		return 0, fmt.Errorf("%s must be within [1, 65535]", key)
	}
	return port, nil
}

func grpcListenHost() string {
	if v := os.Getenv("GRPC_HOST"); v != "" {
		return v
	}
	if getEnv("APP_ENV", "development") == "production" {
		return "0.0.0.0"
	}
	return "127.0.0.1"
}

func loadPEM(envKey, fileKey string) ([]byte, error) {
	if path := os.Getenv(fileKey); path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", fileKey, err)
		}
		return data, nil
	}

	value := os.Getenv(envKey)
	if value == "" {
		return nil, fmt.Errorf("%s or %s is required", envKey, fileKey)
	}
	return []byte(value), nil
}
