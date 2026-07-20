package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds application configuration loaded from environment.
type Config struct {
	AppEnv              string
	LogLevel            string
	HTTPPort            int
	GRPCPort            int
	PostgresDSN         string
	JWTPublicKeyPEM     []byte
	PublicBaseURL       string
	RoomTTL             time.Duration
	GuestRoomTTL        time.Duration
	RoomArchiveInterval time.Duration
	IdentityGRPCAddr    string
	InternalAPIToken    string
	WebAllowedOrigins   []string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	httpPort, err := strconv.Atoi(getEnv("HTTP_PORT", "8087"))
	if err != nil {
		return nil, fmt.Errorf("invalid HTTP_PORT: %w", err)
	}

	grpcPort, err := strconv.Atoi(getEnv("GRPC_PORT", "9097"))
	if err != nil {
		return nil, fmt.Errorf("invalid GRPC_PORT: %w", err)
	}

	roomTTL, err := time.ParseDuration(getEnv("ROOM_TTL", "6h"))
	if err != nil {
		return nil, fmt.Errorf("invalid ROOM_TTL: %w", err)
	}

	guestRoomTTL, err := time.ParseDuration(getEnv("GUEST_ROOM_TTL", "3h"))
	if err != nil {
		return nil, fmt.Errorf("invalid GUEST_ROOM_TTL: %w", err)
	}
	if guestRoomTTL <= 0 {
		return nil, fmt.Errorf("GUEST_ROOM_TTL must be > 0")
	}

	archiveInterval, err := time.ParseDuration(getEnv("ROOM_ARCHIVE_INTERVAL", "1m"))
	if err != nil {
		return nil, fmt.Errorf("invalid ROOM_ARCHIVE_INTERVAL: %w", err)
	}
	if roomTTL <= 0 {
		return nil, fmt.Errorf("ROOM_TTL must be > 0")
	}

	publicKey, err := loadPEM("JWT_PUBLIC_KEY", "JWT_PUBLIC_KEY_FILE")
	if err != nil {
		return nil, fmt.Errorf("jwt public key: %w", err)
	}

	internalToken := os.Getenv("INTERNAL_API_TOKEN")
	if internalToken == "" {
		return nil, fmt.Errorf("INTERNAL_API_TOKEN is required")
	}
	publicBaseURL := os.Getenv("PUBLIC_BASE_URL")
	if publicBaseURL == "" {
		return nil, fmt.Errorf("PUBLIC_BASE_URL is required")
	}
	webAllowedOrigins, err := parseOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if err != nil {
		return nil, err
	}
	if getEnv("APP_ENV", "development") == "production" && len(webAllowedOrigins) == 0 {
		return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS is required in production for WebSocket origin checks")
	}

	return &Config{
		AppEnv:              getEnv("APP_ENV", "development"),
		LogLevel:            getEnv("LOG_LEVEL", "info"),
		HTTPPort:            httpPort,
		GRPCPort:            grpcPort,
		PostgresDSN:         getEnv("POSTGRES_DSN", "postgres://postgres:postgres@localhost:5440/nordly_rooms?sslmode=disable"),
		JWTPublicKeyPEM:     publicKey,
		PublicBaseURL:       strings.TrimRight(publicBaseURL, "/"),
		RoomTTL:             roomTTL,
		GuestRoomTTL:        guestRoomTTL,
		RoomArchiveInterval: archiveInterval,
		IdentityGRPCAddr:    getEnv("IDENTITY_GRPC_ADDR", "127.0.0.1:9090"),
		InternalAPIToken:    internalToken,
		WebAllowedOrigins:   webAllowedOrigins,
	}, nil
}

func parseOrigins(raw string) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	origins := strings.Split(raw, ",")
	out := make([]string, 0, len(origins))
	for _, origin := range origins {
		origin = strings.TrimSpace(origin)
		if origin == "" {
			return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS contains an empty origin")
		}
		if !strings.HasPrefix(origin, "http://") && !strings.HasPrefix(origin, "https://") {
			return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS origin must include http(s) scheme: %q", origin)
		}
		out = append(out, strings.TrimRight(origin, "/"))
	}
	return out, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadPEM(envKey, fileKey string) ([]byte, error) {
	if path := os.Getenv(fileKey); path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", fileKey, err)
		}
		return data, nil
	}
	if v := os.Getenv(envKey); v != "" {
		return []byte(v), nil
	}
	return nil, fmt.Errorf("%s or %s is required", envKey, fileKey)
}
