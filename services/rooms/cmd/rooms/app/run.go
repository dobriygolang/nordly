package app

import (
	"context"
	"fmt"

	identitygrpc "github.com/dobriygolang/project-nordly/services/rooms/internal/adapter/identity/grpc"
	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/config"
	roomrepo "github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository"
	roomservice "github.com/dobriygolang/project-nordly/services/rooms/internal/room/service"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/ws"
)

type App struct {
	Config       *config.Config
	Logger       logger.Logger
	Postgres     *roomrepo.Pool
	JWT          *jwt.Validator
	Hub          *ws.Hub
	Service      roomservice.Service
	identityConn *identitygrpc.Client
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

	pg, err := roomrepo.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("init postgres: %w", err)
	}

	identityConn, err := identitygrpc.NewClient(ctx, cfg.IdentityGRPCAddr, cfg.InternalAPIToken)
	if err != nil {
		pg.Close()
		return nil, fmt.Errorf("init identity client: %w", err)
	}

	repo := roomrepo.New(pg)
	hub := ws.NewHub(log)
	svc := roomservice.New(roomservice.Deps{
		Repo:          repo,
		Identity:      identityConn,
		PublicBaseURL: cfg.PublicBaseURL,
		RoomTTL:       cfg.RoomTTL,
		GuestRoomTTL:  cfg.GuestRoomTTL,
	})

	return &App{
		Config:       cfg,
		Logger:       log,
		Postgres:     pg,
		JWT:          jwtValidator,
		Hub:          hub,
		Service:      svc,
		identityConn: identityConn,
	}, nil
}

func (a *App) Close() {
	if a.Hub != nil {
		a.Hub.CloseAll()
	}
	if a.identityConn != nil {
		_ = a.identityConn.Close()
	}
	if a.Postgres != nil {
		a.Postgres.Close()
	}
	if a.Logger != nil {
		_ = a.Logger.Sync()
	}
}
