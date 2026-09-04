package config

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/tools/ops"
)

// RunnerMode selects the execution isolation adapter.
type RunnerMode string

const (
	RunnerModeFake    RunnerMode = "fake"
	RunnerModeProcess RunnerMode = "process"
	RunnerModeDocker  RunnerMode = "docker"
)

func (m RunnerMode) String() string { return string(m) }

func (m RunnerMode) IsValid() bool {
	switch m {
	case RunnerModeFake, RunnerModeProcess, RunnerModeDocker:
		return true
	default:
		return false
	}
}

// Config holds application configuration loaded from environment.
type Config struct {
	AppEnv                string
	LogLevel              string
	HTTPPort              int
	GRPCPort              int
	GRPCHost              string
	PostgresDSN           string
	JWTPublicKeyPEM       []byte
	RunnerMode            RunnerMode
	MaxOutputBytes        int
	DefaultTimeoutMS      int
	DefaultMemoryMB       int
	DefaultCPUs           string
	MaxCodeBytes          int
	MaxStdinBytes         int
	DockerGoImage         string
	DockerPythonImage     string
	DockerNodeImage       string
	DockerWorkRoot        string
	DockerGoCacheDir      string
	CORSAllowedOrigins    []string
	AsyncRuns             bool
	WorkerInterval        time.Duration
	WorkerBatchSize       int
	QueueLease            time.Duration
	MaxConcurrentUser     int
	MaxConcurrentRoom     int
	UserRequestsPerMinute int
	RoomRequestsPerMinute int
}

// Load reads and validates configuration before any adapters are constructed.
func Load() (*Config, error) {
	httpPort, err := parsePort("HTTP_PORT", "8086")
	if err != nil {
		return nil, err
	}
	grpcPort, err := parsePort("GRPC_PORT", "9096")
	if err != nil {
		return nil, err
	}
	maxOutput, err := parsePositiveInt("SANDBOX_MAX_OUTPUT_BYTES", "65536")
	if err != nil {
		return nil, err
	}
	timeoutMS, err := parsePositiveInt("SANDBOX_DEFAULT_TIMEOUT_MS", "2000")
	if err != nil {
		return nil, err
	}
	if timeoutMS > math.MaxInt32 {
		return nil, fmt.Errorf("SANDBOX_DEFAULT_TIMEOUT_MS must be <= %d", math.MaxInt32)
	}
	memoryMB, err := parsePositiveInt("SANDBOX_DEFAULT_MEMORY_MB", "128")
	if err != nil {
		return nil, err
	}
	workerIntervalMS, err := parsePositiveInt("SANDBOX_WORKER_INTERVAL_MS", "500")
	if err != nil {
		return nil, err
	}
	if int64(workerIntervalMS) > math.MaxInt64/int64(time.Millisecond) {
		return nil, fmt.Errorf("SANDBOX_WORKER_INTERVAL_MS is too large")
	}
	workerBatch, err := parsePositiveInt("SANDBOX_WORKER_BATCH_SIZE", "10")
	if err != nil {
		return nil, err
	}
	if workerBatch > model.MaxQueueBatchSize {
		return nil, fmt.Errorf("SANDBOX_WORKER_BATCH_SIZE must be <= %d", model.MaxQueueBatchSize)
	}
	maxCodeBytes, err := parsePositiveInt("SANDBOX_MAX_CODE_BYTES", "131072")
	if err != nil {
		return nil, err
	}
	maxStdinBytes, err := parsePositiveInt("SANDBOX_MAX_STDIN_BYTES", "65536")
	if err != nil {
		return nil, err
	}
	queueLeaseMS, err := parsePositiveInt("SANDBOX_QUEUE_LEASE_MS", "30000")
	if err != nil {
		return nil, err
	}
	if queueLeaseMS <= timeoutMS {
		return nil, fmt.Errorf("SANDBOX_QUEUE_LEASE_MS must exceed SANDBOX_DEFAULT_TIMEOUT_MS")
	}
	if int64(queueLeaseMS) > math.MaxInt64/int64(time.Millisecond) {
		return nil, fmt.Errorf("SANDBOX_QUEUE_LEASE_MS is too large")
	}
	maxConcurrentUser, err := parsePositiveInt("SANDBOX_MAX_CONCURRENT_RUNS_PER_USER", "4")
	if err != nil {
		return nil, err
	}
	maxConcurrentRoom, err := parsePositiveInt("SANDBOX_MAX_CONCURRENT_RUNS_PER_ROOM", "2")
	if err != nil {
		return nil, err
	}
	userRequestsMinute, err := parsePositiveInt("SANDBOX_USER_REQUESTS_PER_MINUTE", "60")
	if err != nil {
		return nil, err
	}
	roomRequestsMinute, err := parsePositiveInt("SANDBOX_ROOM_REQUESTS_PER_MINUTE", "30")
	if err != nil {
		return nil, err
	}
	cpus := strings.TrimSpace(getEnv("SANDBOX_DEFAULT_CPUS", "1.0"))
	cpuValue, err := strconv.ParseFloat(cpus, 64)
	if err != nil || cpuValue <= 0 || math.IsNaN(cpuValue) || math.IsInf(cpuValue, 0) {
		return nil, fmt.Errorf("SANDBOX_DEFAULT_CPUS must be a positive number")
	}

	appEnv, err := parseAppEnv(getEnv("APP_ENV", "development"))
	if err != nil {
		return nil, err
	}
	runnerMode, err := parseRunnerMode(getEnv("RUNNER_MODE", RunnerModeFake.String()))
	if err != nil {
		return nil, err
	}
	// Untrusted code must never run on the host in production: only the
	// container-isolated runner is allowed there.
	if appEnv == "production" && runnerMode != RunnerModeDocker {
		return nil, fmt.Errorf("RUNNER_MODE must be 'docker' in production, got %q", runnerMode)
	}
	asyncRuns, err := parseAsyncRuns(getEnv("SANDBOX_ASYNC_RUNS", ""), runnerMode)
	if err != nil {
		return nil, err
	}

	publicKey, err := loadPEM("JWT_PUBLIC_KEY", "JWT_PUBLIC_KEY_FILE")
	if err != nil {
		return nil, fmt.Errorf("jwt public key: %w", err)
	}

	postgresDSN := strings.TrimSpace(getEnv("POSTGRES_DSN", "postgres://postgres:postgres@localhost:5439/nordly_sandbox?sslmode=disable"))
	if postgresDSN == "" {
		return nil, fmt.Errorf("POSTGRES_DSN is required")
	}
	goImage := strings.TrimSpace(getEnv("SANDBOX_DOCKER_GO_IMAGE", "golang:1.24-alpine"))
	pythonImage := strings.TrimSpace(getEnv("SANDBOX_DOCKER_PYTHON_IMAGE", "python:3.12-alpine"))
	nodeImage := strings.TrimSpace(getEnv("SANDBOX_DOCKER_NODE_IMAGE", "node:22-alpine"))
	workRoot := strings.TrimSpace(getEnv("SANDBOX_DOCKER_WORK_ROOT", ""))
	goCacheDir := dockerGoCacheDir(workRoot, strings.TrimSpace(getEnv("SANDBOX_DOCKER_GOCACHE_DIR", "")))
	if runnerMode == RunnerModeDocker {
		if goImage == "" || pythonImage == "" || nodeImage == "" {
			return nil, fmt.Errorf("all SANDBOX_DOCKER_*_IMAGE values are required in docker mode")
		}
		if workRoot == "" {
			return nil, fmt.Errorf("SANDBOX_DOCKER_WORK_ROOT is required in docker mode")
		}
		if !filepath.IsAbs(workRoot) {
			return nil, fmt.Errorf("SANDBOX_DOCKER_WORK_ROOT must be an absolute path")
		}
		if goCacheDir == "" || !filepath.IsAbs(goCacheDir) {
			return nil, fmt.Errorf("SANDBOX_DOCKER_GOCACHE_DIR must resolve to an absolute path")
		}
	}

	return &Config{
		AppEnv:                appEnv,
		LogLevel:              getEnv("LOG_LEVEL", "info"),
		HTTPPort:              httpPort,
		GRPCPort:              grpcPort,
		GRPCHost:              grpcListenHost(appEnv),
		PostgresDSN:           postgresDSN,
		JWTPublicKeyPEM:       publicKey,
		RunnerMode:            runnerMode,
		MaxOutputBytes:        maxOutput,
		DefaultTimeoutMS:      timeoutMS,
		DefaultMemoryMB:       memoryMB,
		DefaultCPUs:           cpus,
		MaxCodeBytes:          maxCodeBytes,
		MaxStdinBytes:         maxStdinBytes,
		DockerGoImage:         goImage,
		DockerPythonImage:     pythonImage,
		DockerNodeImage:       nodeImage,
		DockerWorkRoot:        workRoot,
		DockerGoCacheDir:      goCacheDir,
		CORSAllowedOrigins:    ops.ParseOrigins(getEnv("CORS_ALLOWED_ORIGINS", "")),
		AsyncRuns:             asyncRuns,
		WorkerInterval:        time.Duration(workerIntervalMS) * time.Millisecond,
		WorkerBatchSize:       workerBatch,
		QueueLease:            time.Duration(queueLeaseMS) * time.Millisecond,
		MaxConcurrentUser:     maxConcurrentUser,
		MaxConcurrentRoom:     maxConcurrentRoom,
		UserRequestsPerMinute: userRequestsMinute,
		RoomRequestsPerMinute: roomRequestsMinute,
	}, nil
}

func parseRunnerMode(raw string) (RunnerMode, error) {
	mode := RunnerMode(strings.ToLower(strings.TrimSpace(raw)))
	if !mode.IsValid() {
		return "", fmt.Errorf("invalid RUNNER_MODE: %q", raw)
	}
	return mode, nil
}

func parseAppEnv(raw string) (string, error) {
	env := strings.ToLower(strings.TrimSpace(raw))
	switch env {
	case "development", "test", "production":
		return env, nil
	default:
		return "", fmt.Errorf("invalid APP_ENV: %q", raw)
	}
}

func parseAsyncRuns(raw string, runnerMode RunnerMode) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "auto":
		return runnerMode == RunnerModeDocker || runnerMode == RunnerModeProcess, nil
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off":
		return false, nil
	default:
		return false, fmt.Errorf("invalid SANDBOX_ASYNC_RUNS: %q", raw)
	}
}

func parsePort(key, fallback string) (int, error) {
	port, err := parsePositiveInt(key, fallback)
	if err != nil {
		return 0, err
	}
	if port > 65535 {
		return 0, fmt.Errorf("%s must be <= 65535", key)
	}
	return port, nil
}

func parsePositiveInt(key, fallback string) (int, error) {
	value, err := strconv.Atoi(getEnv(key, fallback))
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %w", key, err)
	}
	if value <= 0 {
		return 0, fmt.Errorf("%s must be greater than zero", key)
	}
	return value, nil
}

func dockerGoCacheDir(workRoot, explicit string) string {
	if explicit != "" {
		return explicit
	}
	if workRoot != "" {
		return workRoot + "/gocache"
	}
	return ""
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func grpcListenHost(appEnv string) string {
	if v := strings.TrimSpace(os.Getenv("GRPC_HOST")); v != "" {
		return v
	}
	if appEnv == "production" {
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
