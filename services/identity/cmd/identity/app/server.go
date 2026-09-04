package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"

	identityapi "github.com/dobriygolang/project-nordly/services/identity/internal/app/api/identity"
	"github.com/dobriygolang/project-nordly/services/identity/internal/tools/ops"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

// RunAPI starts HTTP gateway, custom HTTP routes, and gRPC server.
func RunAPI(ctx context.Context, a *App) error {
	listenAddr := fmt.Sprintf("%s:%d", a.Config.GRPCHost, a.Config.GRPCPort)
	dialAddr := fmt.Sprintf("127.0.0.1:%d", a.Config.GRPCPort)
	lis, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return fmt.Errorf("listen grpc %s: %w", listenAddr, err)
	}

	impl := identityapi.NewImplementation(a.Service, a.Config.TelegramBotToken)
	grpcSrv := grpc.NewServer(grpc.ChainUnaryInterceptor(
		identityapi.InternalAuthInterceptor(a.Config.InternalAPIToken),
	))
	identityapi.Register(grpcSrv, impl)

	reflection.Register(grpcSrv)

	grpcErrCh := make(chan error, 1)
	go func() {
		a.Logger.Info("grpc server starting", "addr", listenAddr)
		grpcErrCh <- grpcSrv.Serve(lis)
	}()

	httpMux := http.NewServeMux()
	httpMux.HandleFunc("/healthz", ops.HealthzHandler())
	httpMux.HandleFunc("/readyz", ops.ReadyzHandler(
		ops.PingPostgres(a.Postgres.Pool),
		ops.PingRedis(a.Redis.Client),
	))
	httpMux.Handle("/metrics", ops.MetricsHandler())
	httpMux.HandleFunc("/v1/auth/config", identityapi.AuthConfigHTTP(a.Config.TelegramBotUsername))
	httpMux.HandleFunc("GET /v1/users/{id}/avatar", impl.UserAvatarHTTP())
	httpMux.HandleFunc("/v1/jwt/public.pem", identityapi.PublicKeyHTTP(a.PublicKeyPEM))
	httpMux.HandleFunc("/v1/devices/register", identityapi.RegisterDeviceHTTP(a.JWTValidator, a.DeviceService))

	if err := identityapi.RegisterGateway(ctx, httpMux, dialAddr); err != nil {
		grpcSrv.Stop()
		return fmt.Errorf("register gateway: %w", err)
	}

	httpAddr := fmt.Sprintf(":%d", a.Config.HTTPPort)
	handler := ops.InstrumentHTTP("identity", httpMux)
	handler = ops.CORS(a.Config.CORSAllowedOrigins, handler)
	handler = ops.AuthRateLimit(a.Config.AuthRateLimitPerMinute, handler)
	srv := &http.Server{
		Addr:              httpAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	a.Logger.Info("http server starting", "addr", httpAddr)

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		grpcStopped := make(chan struct{})
		go func() {
			grpcSrv.GracefulStop()
			close(grpcStopped)
		}()
		httpErr := srv.Shutdown(shutdownCtx)
		select {
		case <-grpcStopped:
		case <-shutdownCtx.Done():
			grpcSrv.Stop()
		}
		return httpErr
	case serveErr := <-grpcErrCh:
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		shutdownErr := srv.Shutdown(shutdownCtx)
		if serveErr == nil {
			serveErr = errors.New("grpc server stopped unexpectedly")
		}
		serveErr = fmt.Errorf("serve grpc: %w", serveErr)
		if shutdownErr != nil {
			return errors.Join(serveErr, fmt.Errorf("shutdown http after grpc failure: %w", shutdownErr))
		}
		return serveErr
	case err := <-errCh:
		grpcSrv.Stop()
		if err == http.ErrServerClosed {
			return nil
		}
		return fmt.Errorf("serve http: %w", err)
	}
}
