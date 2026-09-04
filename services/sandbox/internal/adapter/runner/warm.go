package runner

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/tools/logger"
	"github.com/google/uuid"
)

// Warmup owns cancellable background Docker preparation.
type Warmup struct {
	cancel context.CancelFunc
	done   chan struct{}
	once   sync.Once
}

// StartDockerWarmup pre-pulls runtime images and warms the Go build cache.
// Failures are logged because warmup is an optimization; actual runs still
// surface Docker failures to callers.
func StartDockerWarmup(
	ctx context.Context,
	log logger.Logger,
	r *DockerRunner,
	images ...string,
) (*Warmup, error) {
	if log == nil {
		return nil, fmt.Errorf("docker warmup logger is required")
	}
	if r == nil {
		return nil, fmt.Errorf("docker warmup runner is required")
	}
	if r.MaxOutputBytes <= 0 || r.DefaultMemoryMB <= 0 {
		return nil, fmt.Errorf("docker warmup output and memory limits must be > 0")
	}
	if strings.TrimSpace(r.WorkRoot) == "" || strings.TrimSpace(r.GoCacheDir) == "" {
		return nil, fmt.Errorf("docker warmup work and cache directories are required")
	}
	if len(images) == 0 {
		return nil, fmt.Errorf("docker warmup images are required")
	}
	for _, image := range images {
		if strings.TrimSpace(image) == "" {
			return nil, fmt.Errorf("docker warmup image is required")
		}
	}

	return startWarmup(ctx, func(warmCtx context.Context) {
		warmDockerImages(warmCtx, log, r.MaxOutputBytes, images)
		if warmCtx.Err() != nil {
			return
		}
		warmGoCompiler(warmCtx, log, r)
	}), nil
}

// Close cancels warmup and waits until all Docker commands and cleanup finish.
func (w *Warmup) Close() {
	if w == nil {
		return
	}
	w.once.Do(func() {
		w.cancel()
		<-w.done
	})
}

func startWarmup(ctx context.Context, task func(context.Context)) *Warmup {
	warmCtx, cancel := context.WithCancel(ctx)
	warmup := &Warmup{cancel: cancel, done: make(chan struct{})}
	go func() {
		defer close(warmup.done)
		task(warmCtx)
	}()
	return warmup
}

func warmDockerImages(ctx context.Context, log logger.Logger, maxOutputBytes int, images []string) {
	seen := make(map[string]struct{}, len(images))
	for _, image := range images {
		if _, ok := seen[image]; ok {
			continue
		}
		seen[image] = struct{}{}

		pullCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		output, outputErr := newCappedWriter(maxOutputBytes)
		if outputErr != nil {
			cancel()
			log.Warn("docker image pull output setup failed", "image", image, "err", outputErr)
			continue
		}
		cmd := commandContext(pullCtx, "docker", "pull", image)
		cmd.Stdout = output
		cmd.Stderr = output
		err := cmd.Run()
		cancel()
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Warn("docker image pull failed", "image", image, "err", err, "output", output.String())
			continue
		}
		log.Info("docker image ready", "image", image)
	}
}

func warmGoCompiler(ctx context.Context, log logger.Logger, r *DockerRunner) {
	if err := os.MkdirAll(r.WorkRoot, 0o700); err != nil {
		log.Warn("go warmup work root failed", "err", err)
		return
	}
	if err := os.MkdirAll(r.GoCacheDir, 0o700); err != nil {
		log.Warn("go warmup cache dir failed", "err", err)
		return
	}
	dir, err := os.MkdirTemp(r.WorkRoot, "sandbox-warm-*")
	if err != nil {
		log.Warn("go warmup temp dir failed", "err", err)
		return
	}
	defer func() { _ = os.RemoveAll(dir) }()

	if err := os.WriteFile(filepath.Join(dir, "main.go"), []byte("package main\nfunc main(){}\n"), 0o600); err != nil {
		log.Warn("go warmup write failed", "err", err)
		return
	}
	if err := prepareGoWorkspace(dir); err != nil {
		log.Warn("go warmup workspace failed", "err", err)
		return
	}

	warmCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	name := "sbx-warm-" + uuid.NewString()
	defer removeContainer(name)
	args, err := dockerRunArgs(
		name,
		r.GoImage,
		dir,
		goCacheDirForRun(r, model.LangGo),
		r.DefaultMemoryMB,
		r.CPUs,
		"go",
		"run",
		"main.go",
	)
	if err != nil {
		log.Warn("go warmup args failed", "err", err)
		return
	}
	output, err := newCappedWriter(r.MaxOutputBytes)
	if err != nil {
		log.Warn("go warmup output setup failed", "err", err)
		return
	}
	command := commandContext(warmCtx, "docker", args...)
	command.Stdout = output
	command.Stderr = output
	err = command.Run()
	if ctx.Err() != nil {
		return
	}
	if err != nil {
		if errors.Is(warmCtx.Err(), context.DeadlineExceeded) {
			log.Warn("go warmup compile timed out", "output", output.String())
			return
		}
		log.Warn("go warmup compile failed", "err", err, "output", output.String())
		return
	}
	log.Info("go compiler cache warmed")
}
