package app

import (
	"context"
	"fmt"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/config"
	focusrepo "github.com/dobriygolang/project-nordly/services/focus/internal/focus/repository"
	focusservice "github.com/dobriygolang/project-nordly/services/focus/internal/focus/service"
	"github.com/dobriygolang/project-nordly/services/focus/internal/tools/logger"
	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

// App holds adapters and the domain service.
type App struct {
	Config   *config.Config
	Logger   logger.Logger
	Postgres *focusrepo.Pool
	JWT      *jwt.Validator
	Service  focusservice.Service
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

	jwtValidator, err := jwt.NewValidator(cfg.JWTPublicKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("init jwt validator: %w", err)
	}

	pg, err := focusrepo.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("init postgres: %w", err)
	}

	repo := focusrepo.New(pg)
	svc, err := focusservice.New(focusservice.Deps{
		Repo: repo,
		Now:  time.Now,
	})
	if err != nil {
		pg.Close()
		return nil, fmt.Errorf("init focus service: %w", err)
	}

	return &App{
		Config:   cfg,
		Logger:   log,
		Postgres: pg,
		JWT:      jwtValidator,
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
