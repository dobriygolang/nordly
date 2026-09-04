package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoadReturnsTypedValidatedDefaults(t *testing.T) {
	resetConfigEnv(t)

	cfg, err := Load()
	require.NoError(t, err)
	require.Equal(t, RunnerModeFake, cfg.RunnerMode)
	require.Positive(t, cfg.MaxOutputBytes)
	require.Positive(t, cfg.QueueLease)
	require.Greater(t, cfg.QueueLease.Milliseconds(), int64(cfg.DefaultTimeoutMS))
}

func TestLoadRejectsInvalidRunnerMode(t *testing.T) {
	resetConfigEnv(t)
	t.Setenv("RUNNER_MODE", "unknown")

	_, err := Load()
	require.ErrorContains(t, err, "invalid RUNNER_MODE")
}

func TestLoadRejectsUnsafeProductionRunner(t *testing.T) {
	resetConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("RUNNER_MODE", "process")

	_, err := Load()
	require.ErrorContains(t, err, "must be 'docker' in production")
}

func TestLoadRejectsLeaseNotLongerThanRunTimeout(t *testing.T) {
	resetConfigEnv(t)
	t.Setenv("SANDBOX_DEFAULT_TIMEOUT_MS", "2000")
	t.Setenv("SANDBOX_QUEUE_LEASE_MS", "2000")

	_, err := Load()
	require.ErrorContains(t, err, "must exceed")
}

func TestLoadRejectsInvalidResourceLimits(t *testing.T) {
	tests := map[string]string{
		"SANDBOX_DEFAULT_CPUS":                 "NaN",
		"SANDBOX_MAX_CONCURRENT_RUNS_PER_USER": "0",
		"SANDBOX_MAX_CONCURRENT_RUNS_PER_ROOM": "0",
		"SANDBOX_USER_REQUESTS_PER_MINUTE":     "0",
		"SANDBOX_ROOM_REQUESTS_PER_MINUTE":     "0",
		"SANDBOX_WORKER_BATCH_SIZE":            "51",
		"SANDBOX_DEFAULT_TIMEOUT_MS":           "2147483648",
	}
	for key, value := range tests {
		t.Run(key, func(t *testing.T) {
			resetConfigEnv(t)
			t.Setenv(key, value)

			_, err := Load()
			require.Error(t, err)
		})
	}
}

func TestLoadRequiresAbsoluteDockerWorkRoot(t *testing.T) {
	resetConfigEnv(t)
	t.Setenv("RUNNER_MODE", "docker")
	t.Setenv("SANDBOX_DOCKER_WORK_ROOT", "relative")

	_, err := Load()
	require.ErrorContains(t, err, "must be an absolute path")
}

func resetConfigEnv(t *testing.T) {
	t.Helper()
	keys := []string{
		"APP_ENV",
		"LOG_LEVEL",
		"HTTP_PORT",
		"GRPC_PORT",
		"GRPC_HOST",
		"POSTGRES_DSN",
		"JWT_PUBLIC_KEY_FILE",
		"RUNNER_MODE",
		"SANDBOX_MAX_OUTPUT_BYTES",
		"SANDBOX_DEFAULT_TIMEOUT_MS",
		"SANDBOX_DEFAULT_MEMORY_MB",
		"SANDBOX_DEFAULT_CPUS",
		"SANDBOX_MAX_CODE_BYTES",
		"SANDBOX_MAX_STDIN_BYTES",
		"SANDBOX_DOCKER_GO_IMAGE",
		"SANDBOX_DOCKER_PYTHON_IMAGE",
		"SANDBOX_DOCKER_NODE_IMAGE",
		"SANDBOX_DOCKER_WORK_ROOT",
		"SANDBOX_DOCKER_GOCACHE_DIR",
		"SANDBOX_ASYNC_RUNS",
		"SANDBOX_WORKER_INTERVAL_MS",
		"SANDBOX_WORKER_BATCH_SIZE",
		"SANDBOX_QUEUE_LEASE_MS",
		"SANDBOX_MAX_CONCURRENT_RUNS_PER_USER",
		"SANDBOX_MAX_CONCURRENT_RUNS_PER_ROOM",
		"SANDBOX_USER_REQUESTS_PER_MINUTE",
		"SANDBOX_ROOM_REQUESTS_PER_MINUTE",
		"CORS_ALLOWED_ORIGINS",
	}
	for _, key := range keys {
		t.Setenv(key, "")
	}
	t.Setenv("JWT_PUBLIC_KEY", "test-key")
	t.Setenv("SANDBOX_WORKER_BATCH_SIZE", "10")
}
