package app

import (
	"context"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"github.com/dobriygolang/project-nordly/services/notes/internal/config"
	notesrepo "github.com/dobriygolang/project-nordly/services/notes/internal/notes/repository"
	notesservice "github.com/dobriygolang/project-nordly/services/notes/internal/notes/service"
	"github.com/dobriygolang/project-nordly/services/notes/internal/tools/logger"
)

type App struct {
	Config   *config.Config
	Logger   logger.Logger
	Postgres *notesrepo.Pool
	JWT      *jwt.Validator
	Service  notesservice.Service
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
	jwtValidator, err := jwt.NewValidator(cfg.JWTPublicKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("init jwt validator: %w", err)
	}
	pg, err := notesrepo.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("init postgres: %w", err)
	}
	repo := notesrepo.New(pg)

	svc, err := notesservice.New(notesservice.Deps{
		Repo:          repo,
		PublicBaseURL: cfg.PublicBaseURL,
	})
	if err != nil {
		pg.Close()
		return nil, fmt.Errorf("init notes service: %w", err)
	}
	return &App{
		Config:   cfg,
		Logger:   log,
		Postgres: pg,
		JWT:      jwtValidator,
		Service:  svc,
	}, nil
}

func (a *App) Close() {
	if a.Postgres != nil {
		a.Postgres.Close()
	}
	if a.Logger != nil {
		_ = a.Logger.Sync()
	}
}
