package app

import (
	"context"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/config"
	sandboxrepo "github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/repository"
	sandboxservice "github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/service"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/tools/logger"
)

type App struct {
	Config   *config.Config
	Logger   logger.Logger
	Postgres *sandboxrepo.Pool
	JWT      *jwt.Validator
	Service  sandboxservice.Service
	Warmup   *runner.Warmup
}

func New(ctx context.Context) (*App, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	log, err := logger.New(cfg.LogLevel)
	if err != nil {
		return nil, fmt.Errorf("init logger: %w", err)
	}
	ready := false
	defer func() {
		if !ready {
			_ = log.Sync()
		}
	}()

	jwtValidator, err := jwt.NewValidator(cfg.JWTPublicKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("init jwt validator: %w", err)
	}

	pg, err := sandboxrepo.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("init postgres: %w", err)
	}

	codeRunner, err := runner.NewFromConfig(cfg)
	if err != nil {
		pg.Close()
		return nil, fmt.Errorf("init runner: %w", err)
	}
	repo, err := sandboxrepo.New(pg)
	if err != nil {
		pg.Close()
		return nil, fmt.Errorf("init sandbox repository: %w", err)
	}
	svc, err := sandboxservice.New(sandboxservice.Deps{
		Repo:                  repo,
		Runner:                codeRunner,
		TimeoutMS:             cfg.DefaultTimeoutMS,
		MemoryMB:              cfg.DefaultMemoryMB,
		MaxOutputBytes:        cfg.MaxOutputBytes,
		LeaseDuration:         cfg.QueueLease,
		MaxCodeBytes:          cfg.MaxCodeBytes,
		MaxStdinBytes:         cfg.MaxStdinBytes,
		MaxConcurrentUser:     cfg.MaxConcurrentUser,
		MaxConcurrentRoom:     cfg.MaxConcurrentRoom,
		UserRequestsPerMinute: cfg.UserRequestsPerMinute,
		RoomRequestsPerMinute: cfg.RoomRequestsPerMinute,
		AsyncRuns:             cfg.AsyncRuns,
	})
	if err != nil {
		pg.Close()
		return nil, fmt.Errorf("init sandbox service: %w", err)
	}

	var warmup *runner.Warmup
	if cfg.RunnerMode == config.RunnerModeDocker {
		dockerRunner, ok := codeRunner.(*runner.DockerRunner)
		if !ok {
			pg.Close()
			return nil, fmt.Errorf("init Docker warmup: runner mode returned %T", codeRunner)
		}
		warmup, err = runner.StartDockerWarmup(
			ctx,
			log,
			dockerRunner,
			cfg.DockerGoImage,
			cfg.DockerPythonImage,
			cfg.DockerNodeImage,
		)
		if err != nil {
			pg.Close()
			return nil, fmt.Errorf("init Docker warmup: %w", err)
		}
	}

	ready = true
	return &App{
		Config:   cfg,
		Logger:   log,
		Postgres: pg,
		JWT:      jwtValidator,
		Service:  svc,
		Warmup:   warmup,
	}, nil
}

func (a *App) Close() {
	if a.Warmup != nil {
		a.Warmup.Close()
	}
	if a.Postgres != nil {
		a.Postgres.Close()
	}
	if a.Logger != nil {
		_ = a.Logger.Sync()
	}
}
