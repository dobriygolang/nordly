package app

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	zoomadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/zoom"
	trackerapi "github.com/dobriygolang/project-nordly/services/tracker/internal/app/api/tracker"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/config"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tools/logger"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tools/secretbox"
	trackerrepo "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
	trackerservice "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/service"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type App struct {
	Config   *config.Config
	Logger   logger.Logger
	Postgres *trackerrepo.Pool
	JWT      *jwt.Validator
	Service  trackerservice.Service
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
	pg, err := trackerrepo.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("init postgres: %w", err)
	}
	repo := trackerrepo.New(pg)
	googleClient := googleadapter.NewClient(cfg.GoogleClientID, cfg.GoogleClientSecret, cfg.GoogleRedirectURI)
	zoomClient := zoomadapter.NewClient(cfg.ZoomClientID, cfg.ZoomClientSecret, cfg.ZoomRedirectURI)
	cipher, err := secretbox.New(cfg.TokenEncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("init token cipher: %w", err)
	}
	svc := trackerservice.New(trackerservice.Deps{
		Repo:         repo,
		Google:       googleClient,
		Zoom:         zoomClient,
		Cipher:       cipher,
		CallbackBase: cfg.CallbackURL,
	})
	return &App{Config: cfg, Logger: log, Postgres: pg, JWT: jwtValidator, Service: svc}, nil
}

func (a *App) Close() {
	if a.Postgres != nil {
		a.Postgres.Close()
	}
	if a.Logger != nil {
		_ = a.Logger.Sync()
	}
}

func RunAPI(ctx context.Context, a *App) error {
	listenAddr := fmt.Sprintf("%s:%d", a.Config.GRPCHost, a.Config.GRPCPort)
	dialAddr := fmt.Sprintf("127.0.0.1:%d", a.Config.GRPCPort)
	lis, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return fmt.Errorf("listen grpc %s: %w", listenAddr, err)
	}
	grpcSrv := grpc.NewServer(grpc.ChainUnaryInterceptor(
		trackerapi.AuthInterceptor(a.JWT),
		trackerapi.InternalAuthInterceptor(a.Config.InternalAPIToken),
	))
	trackerapi.NewRegisteredImplementation(grpcSrv, a.Service)
	reflection.Register(grpcSrv)
	go func() {
		a.Logger.Info("grpc server starting", "addr", listenAddr)
		if serveErr := grpcSrv.Serve(lis); serveErr != nil {
			a.Logger.Error("grpc server stopped", "err", serveErr)
		}
	}()
	impl := trackerapi.NewImplementation(a.Service)
	httpMux := http.NewServeMux()
	httpMux.HandleFunc("/healthz", trackerapi.HealthzHTTP())
	httpMux.HandleFunc("/v1/tracker/integrations/google/callback", impl.GoogleCallbackHTTP())
	httpMux.HandleFunc("/v1/tracker/integrations/zoom/callback", impl.ZoomCallbackHTTP())
	if err := trackerapi.RegisterGateway(ctx, httpMux, dialAddr); err != nil {
		grpcSrv.Stop()
		return fmt.Errorf("register gateway: %w", err)
	}
	httpAddr := fmt.Sprintf(":%d", a.Config.HTTPPort)
	srv := &http.Server{Addr: httpAddr, Handler: httpMux, ReadHeaderTimeout: 5 * time.Second}
	a.Logger.Info("http server starting", "addr", httpAddr)
	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		grpcSrv.GracefulStop()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		grpcSrv.Stop()
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	}
}
