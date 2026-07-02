package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
)

type Config struct {
	AppEnv             string
	LogLevel           string
	HTTPPort           int
	GRPCPort           int
	GRPCHost           string
	PostgresDSN        string
	JWTPublicKeyPEM    []byte
	InternalAPIToken   string
	CORSAllowedOrigins []string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURI  string
	ZoomClientID       string
	ZoomClientSecret   string
	ZoomRedirectURI    string
	NordlyCallbackURL  string
	CallbackURL        url.URL
	TokenEncryptionKey string
}

func Load() (*Config, error) {
	httpPort, err := strconv.Atoi(getEnv("HTTP_PORT", "8089"))
	if err != nil {
		return nil, fmt.Errorf("invalid HTTP_PORT: %w", err)
	}
	grpcPort, err := strconv.Atoi(getEnv("GRPC_PORT", "9099"))
	if err != nil {
		return nil, fmt.Errorf("invalid GRPC_PORT: %w", err)
	}
	publicKey, err := loadPEM("JWT_PUBLIC_KEY", "JWT_PUBLIC_KEY_FILE")
	if err != nil {
		return nil, fmt.Errorf("jwt public key: %w", err)
	}
	internalToken := os.Getenv("INTERNAL_API_TOKEN")
	if internalToken == "" {
		return nil, fmt.Errorf("INTERNAL_API_TOKEN is required")
	}
	tokenKey := os.Getenv("TOKEN_ENCRYPTION_KEY")
	if tokenKey == "" {
		return nil, fmt.Errorf("TOKEN_ENCRYPTION_KEY is required")
	}
	callbackURL := getEnv("NORDLY_CALLBACK_URL", "nordly://settings")
	parsedCallback, err := parseCallbackURL(callbackURL)
	if err != nil {
		return nil, err
	}
	return &Config{
		AppEnv:             getEnv("APP_ENV", "development"),
		LogLevel:           getEnv("LOG_LEVEL", "info"),
		HTTPPort:           httpPort,
		GRPCPort:           grpcPort,
		GRPCHost:           grpcListenHost(),
		PostgresDSN:        getEnv("POSTGRES_DSN", "postgres://postgres:postgres@localhost:5441/nordly_tracker?sslmode=disable"),
		JWTPublicKeyPEM:    publicKey,
		InternalAPIToken:   internalToken,
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURI:  os.Getenv("GOOGLE_REDIRECT_URI"),
		ZoomClientID:       os.Getenv("ZOOM_CLIENT_ID"),
		ZoomClientSecret:   os.Getenv("ZOOM_CLIENT_SECRET"),
		ZoomRedirectURI:    os.Getenv("ZOOM_REDIRECT_URI"),
		NordlyCallbackURL:  callbackURL,
		CallbackURL:        parsedCallback,
		TokenEncryptionKey: tokenKey,
	}, nil
}

func parseCallbackURL(raw string) (url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return url.URL{}, fmt.Errorf("invalid NORDLY_CALLBACK_URL: %w", err)
	}
	if u.Scheme == "" {
		return url.URL{}, fmt.Errorf("invalid NORDLY_CALLBACK_URL: missing scheme in %q", raw)
	}
	return *u, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
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
