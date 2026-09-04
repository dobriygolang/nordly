package app

import (
	"context"
	"fmt"

	authrepo "github.com/dobriygolang/project-nordly/services/identity/internal/auth/repository"
	authservice "github.com/dobriygolang/project-nordly/services/identity/internal/auth/service"
	"github.com/dobriygolang/project-nordly/services/identity/internal/config"
	devicerepo "github.com/dobriygolang/project-nordly/services/identity/internal/device/repository"
	deviceservice "github.com/dobriygolang/project-nordly/services/identity/internal/device/service"
	"github.com/dobriygolang/project-nordly/services/identity/internal/tools/logger"
	userrepo "github.com/dobriygolang/project-nordly/services/identity/internal/user/repository"
	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

// App holds adapters and the domain service for identity.
type App struct {
	Config        *config.Config
	Logger        logger.Logger
	Postgres      *userrepo.Pool
	Redis         *authrepo.Client
	Service       authservice.Service
	DeviceService deviceservice.Service
	TokenManager  *authservice.TokenManager
	JWTValidator  *jwt.Validator
	PublicKeyPEM  []byte
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
	a := &App{Config: cfg, Logger: log}
	initialized := false
	defer func() {
		if !initialized {
			a.Close()
		}
	}()

	pg, err := userrepo.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("init postgres: %w", err)
	}
	a.Postgres = pg

	redisClient, err := authrepo.New(ctx, cfg.RedisAddr, cfg.RedisPassword)
	if err != nil {
		return nil, fmt.Errorf("init redis: %w", err)
	}
	a.Redis = redisClient

	tokenManager, err := authservice.NewTokenManager(
		cfg.JWTPrivateKeyPEM,
		cfg.JWTPublicKeyPEM,
		cfg.JWTAccessTTL,
		cfg.JWTRefreshTTL,
	)
	if err != nil {
		return nil, fmt.Errorf("init token manager: %w", err)
	}
	a.TokenManager = tokenManager

	publicKeyPEM, err := tokenManager.PublicKeyPEM()
	if err != nil {
		return nil, fmt.Errorf("encode public key: %w", err)
	}
	a.PublicKeyPEM = publicKeyPEM

	jwtValidator, err := jwt.NewValidator(cfg.JWTPublicKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("init jwt validator: %w", err)
	}
	a.JWTValidator = jwtValidator

	authSvc, err := authservice.New(authservice.Deps{
		Users:         userrepo.New(pg),
		LoginCodes:    authrepo.NewLoginCodeRepository(redisClient),
		RefreshTokens: authrepo.NewRefreshTokenRepository(redisClient),
		Tokens:        tokenManager,
	})
	if err != nil {
		return nil, fmt.Errorf("init auth service: %w", err)
	}
	a.Service = authSvc

	deviceSvc, err := deviceservice.New(deviceservice.Deps{
		Repo: devicerepo.New(pg),
	})
	if err != nil {
		return nil, fmt.Errorf("init device service: %w", err)
	}
	a.DeviceService = deviceSvc

	initialized = true
	return a, nil
}

// Close releases adapter resources.
func (a *App) Close() {
	if a.Redis != nil {
		_ = a.Redis.Close()
	}
	if a.Postgres != nil {
		a.Postgres.Close()
	}
	if a.Logger != nil {
		_ = a.Logger.Sync()
	}
}
