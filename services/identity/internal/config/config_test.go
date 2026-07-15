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
