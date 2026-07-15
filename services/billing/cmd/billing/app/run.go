package app

import (
	"context"
	"fmt"

	identitygrpc "github.com/dobriygolang/project-nordly/services/billing/internal/adapter/identity/grpc"
	"github.com/dobriygolang/project-nordly/services/billing/internal/adapter/providers"
	"github.com/dobriygolang/project-nordly/services/billing/internal/adapter/providers/tribute"
	billingcache "github.com/dobriygolang/project-nordly/services/billing/internal/billing/cache"
	billingrepo "github.com/dobriygolang/project-nordly/services/billing/internal/billing/repository"
	billingservice "github.com/dobriygolang/project-nordly/services/billing/internal/billing/service"
	"github.com/dobriygolang/project-nordly/services/billing/internal/config"
	"github.com/dobriygolang/project-nordly/services/billing/internal/tools/logger"
	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	goredis "github.com/redis/go-redis/v9"
)

// App holds adapters and the domain service.
type App struct {
	Config       *config.Config
	Logger       logger.Logger
	Postgres     *billingrepo.Pool
	Redis        *goredis.Client
	IdentityConn *identitygrpc.Client
	JWT          *jwt.Validator
	Service      billingservice.Service
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

	pg, err := billingrepo.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("init postgres: %w", err)
	}

	identityClient, err := identitygrpc.NewClient(ctx, cfg.IdentityGRPCAddr, cfg.InternalAPIToken)
	if err != nil {
		pg.Close()
		return nil, fmt.Errorf("init identity client: %w", err)
	}

	tributeProvider := tribute.New(tribute.Config{WebhookSecret: cfg.TributeWebhookSecret})
	repo := billingrepo.New(pg)

	redisClient, err := billingcache.NewRedisClient(ctx, cfg.RedisAddr, cfg.RedisPassword)
	if err != nil {
		pg.Close()
		_ = identityClient.Close()
		return nil, fmt.Errorf("init redis: %w", err)
	}

	plansCache := billingcache.NewPlans(repo)
	if err := plansCache.Reload(ctx); err != nil {
		if redisClient != nil {
			_ = redisClient.Close()
		}
		pg.Close()
		_ = identityClient.Close()
		return nil, fmt.Errorf("warm plans cache: %w", err)
	}

	entitlementsCache := billingcache.NewEntitlementsRedis(redisClient, cfg.EntitlementsCacheTTL)
	svc := billingservice.New(billingservice.Deps{
		Repo:              repo,
		Identity:          identityClient,
		Providers:         []providers.BillingProvider{tributeProvider},
		TierToPlan:        cfg.TributeTierToPlan,
		PlansCache:        plansCache,
		EntitlementsCache: entitlementsCache,
	})

	jwtValidator, err := jwt.NewValidator(cfg.JWTPublicKeyPEM)
	if err != nil {
		if redisClient != nil {
			_ = redisClient.Close()
		}
		pg.Close()
		_ = identityClient.Close()
		return nil, fmt.Errorf("init jwt validator: %w", err)
	}

	return &App{
		Config:       cfg,
		Logger:       log,
		Postgres:     pg,
		Redis:        redisClient,
		IdentityConn: identityClient,
		JWT:          jwtValidator,
		Service:      svc,
	}, nil
}

// Close releases adapter resources.
func (a *App) Close() {
	if a.Redis != nil {
		_ = a.Redis.Close()
	}
	if a.IdentityConn != nil {
		_ = a.IdentityConn.Close()
	}
	if a.Postgres != nil {
		a.Postgres.Close()
	}
	if a.Logger != nil {
		_ = a.Logger.Sync()
	}
}
