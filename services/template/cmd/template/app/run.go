package app

import (
	"context"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/template/internal/config"
	examplerepo "github.com/dobriygolang/project-nordly/services/template/internal/example/repository"
	exampleservice "github.com/dobriygolang/project-nordly/services/template/internal/example/service"
	"github.com/dobriygolang/project-nordly/services/template/internal/tools/logger"
)

// App holds adapters and the domain service.
type App struct {
	Config   *config.Config
	Logger   logger.Logger
	Postgres *examplerepo.Pool
	Service  exampleservice.Service
}

// New wires adapters and the domain service.
func New(ctx context.Context) (*App, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	log, err := logger.New(cfg.LogLevel)
	if err != nil {
		return nil, fmt.Errorf("init logger: %w", err)
	}

	pg, err := examplerepo.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("init postgres: %w", err)
	}

	repo := examplerepo.New(pg)
	svc, err := exampleservice.New(exampleservice.Deps{Repo: repo})
	if err != nil {
		pg.Close()
		return nil, fmt.Errorf("init example service: %w", err)
	}

	return &App{
		Config:   cfg,
		Logger:   log,
		Postgres: pg,
		Service:  svc,
	}, nil
}

// Close releases adapter resources.
func (a *App) Close() {
	if a.Postgres != nil {
		a.Postgres.Close()
	}
	if a.Logger != nil {
		_ = a.Logger.Sync()
	}
}
