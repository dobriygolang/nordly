package config

import (
	"os"
	"path/filepath"
	"testing"
)

func setRequiredEnv(t *testing.T) {
	t.Helper()
	keyPath := filepath.Join(t.TempDir(), "key.pem")
	if err := os.WriteFile(keyPath, []byte("test key"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("JWT_PRIVATE_KEY_FILE", keyPath)
	t.Setenv("JWT_PUBLIC_KEY_FILE", keyPath)
	t.Setenv("TELEGRAM_BOT_TOKEN", "test-token")
	t.Setenv("TELEGRAM_BOT_USERNAME", "test_bot")
}

func TestLoadKeepsConfiguredAuthRateLimitOutsideProduction(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("APP_ENV", "staging")
	t.Setenv("AUTH_RATE_LIMIT_PER_MINUTE", "17")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AuthRateLimitPerMinute != 17 {
		t.Fatalf("expected staging limit 17, got %d", cfg.AuthRateLimitPerMinute)
	}
}

func TestLoadRejectsDisabledAuthRateLimit(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("AUTH_RATE_LIMIT_PER_MINUTE", "0")

	if _, err := Load(); err == nil {
		t.Fatal("expected disabled auth rate limit to be rejected")
	}
}

func TestLoadRejectsOutOfRangeTokenTTLs(t *testing.T) {
	tests := []struct {
		name  string
		key   string
		value string
	}{
		{name: "zero access ttl", key: "JWT_ACCESS_TTL", value: "0s"},
		{name: "negative access ttl", key: "JWT_ACCESS_TTL", value: "-1s"},
		{name: "sub-second access ttl", key: "JWT_ACCESS_TTL", value: "999ms"},
		{name: "fractional-second access ttl", key: "JWT_ACCESS_TTL", value: "1500ms"},
		{name: "excessive access ttl", key: "JWT_ACCESS_TTL", value: "24h1s"},
		{name: "zero refresh ttl", key: "JWT_REFRESH_TTL", value: "0s"},
		{name: "negative refresh ttl", key: "JWT_REFRESH_TTL", value: "-1s"},
		{name: "sub-second refresh ttl", key: "JWT_REFRESH_TTL", value: "999ms"},
		{name: "fractional-second refresh ttl", key: "JWT_REFRESH_TTL", value: "1500ms"},
		{name: "excessive refresh ttl", key: "JWT_REFRESH_TTL", value: "8760h1s"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(tt.key, tt.value)
			if _, err := Load(); err == nil {
				t.Fatalf("expected %s=%s to be rejected", tt.key, tt.value)
			}
		})
	}
}

func TestLoadRejectsOutOfRangePorts(t *testing.T) {
	for _, tt := range []struct {
		key   string
		value string
	}{
		{key: "HTTP_PORT", value: "0"},
		{key: "HTTP_PORT", value: "65536"},
		{key: "GRPC_PORT", value: "-1"},
		{key: "GRPC_PORT", value: "65536"},
	} {
		t.Run(tt.key+"_"+tt.value, func(t *testing.T) {
			setRequiredEnv(t)
			t.Setenv(tt.key, tt.value)
			if _, err := Load(); err == nil {
				t.Fatalf("expected %s=%s to be rejected", tt.key, tt.value)
			}
		})
	}
}

func TestLoadRejectsWhitespaceSecrets(t *testing.T) {
	t.Run("telegram token", func(t *testing.T) {
		setRequiredEnv(t)
		t.Setenv("TELEGRAM_BOT_TOKEN", "   ")
		if _, err := Load(); err == nil {
			t.Fatal("expected whitespace Telegram token to be rejected")
		}
	})

	t.Run("production internal token", func(t *testing.T) {
		setRequiredEnv(t)
		t.Setenv("APP_ENV", "production")
		t.Setenv("INTERNAL_API_TOKEN", "   ")
		t.Setenv("REDIS_PASSWORD", "secret")
		if _, err := Load(); err == nil {
			t.Fatal("expected whitespace internal token to be rejected")
		}
	})
}
