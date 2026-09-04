package runner

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/config"
)

// NewFromConfig selects a CodeRunner implementation.
func NewFromConfig(cfg *config.Config) (CodeRunner, error) {
	if cfg == nil {
		return nil, fmt.Errorf("runner config is required")
	}
	if cfg.MaxOutputBytes <= 0 || cfg.MaxCodeBytes <= 0 {
		return nil, fmt.Errorf("runner output and code limits must be > 0")
	}
	switch cfg.RunnerMode {
	case config.RunnerModeProcess:
		return &ProcessRunner{
			MaxOutputBytes: cfg.MaxOutputBytes,
			MaxCodeBytes:   cfg.MaxCodeBytes,
		}, nil
	case config.RunnerModeDocker:
		cpuValue, err := strconv.ParseFloat(strings.TrimSpace(cfg.DefaultCPUs), 64)
		if cfg.DefaultMemoryMB <= 0 ||
			err != nil ||
			cpuValue <= 0 ||
			math.IsNaN(cpuValue) ||
			math.IsInf(cpuValue, 0) {
			return nil, fmt.Errorf("docker runner memory and CPU limits are required")
		}
		if strings.TrimSpace(cfg.DockerGoImage) == "" ||
			strings.TrimSpace(cfg.DockerPythonImage) == "" ||
			strings.TrimSpace(cfg.DockerNodeImage) == "" {
			return nil, fmt.Errorf("docker runner images are required")
		}
		if strings.TrimSpace(cfg.DockerWorkRoot) == "" || strings.TrimSpace(cfg.DockerGoCacheDir) == "" {
			return nil, fmt.Errorf("docker runner work and cache directories are required")
		}
		if !filepath.IsAbs(cfg.DockerWorkRoot) || !filepath.IsAbs(cfg.DockerGoCacheDir) {
			return nil, fmt.Errorf("docker runner work and cache directories must be absolute")
		}
		if err := os.MkdirAll(cfg.DockerWorkRoot, 0o700); err != nil {
			return nil, fmt.Errorf("create docker work root: %w", err)
		}
		if err := os.MkdirAll(cfg.DockerGoCacheDir, 0o700); err != nil {
			return nil, fmt.Errorf("create docker Go cache: %w", err)
		}
		return &DockerRunner{
			GoImage: cfg.DockerGoImage, PythonImage: cfg.DockerPythonImage,
			JavaScriptImage: cfg.DockerNodeImage, MaxOutputBytes: cfg.MaxOutputBytes,
			MaxCodeBytes: cfg.MaxCodeBytes, DefaultMemoryMB: cfg.DefaultMemoryMB,
			CPUs:     cfg.DefaultCPUs,
			WorkRoot: cfg.DockerWorkRoot, GoCacheDir: cfg.DockerGoCacheDir,
		}, nil
	case config.RunnerModeFake:
		return DefaultFakeRunner(), nil
	default:
		return nil, fmt.Errorf("unknown RUNNER_MODE: %s", cfg.RunnerMode)
	}
}
