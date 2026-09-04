package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"

	sandboxapi "github.com/dobriygolang/project-nordly/services/sandbox/internal/app/api/sandbox"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/tools/ops"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

// RunAPI starts HTTP and gRPC servers.
func RunAPI(ctx context.Context, a *App) error {
	authInterceptor, err := sandboxapi.NewAuthInterceptor(a.JWT)
	if err != nil {
		return err
	}
	listenAddr := fmt.Sprintf("%s:%d", a.Config.GRPCHost, a.Config.GRPCPort)
	dialAddr := fmt.Sprintf("127.0.0.1:%d", a.Config.GRPCPort)
	lis, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return fmt.Errorf("listen grpc %s: %w", listenAddr, err)
	}

	grpcSrv := grpc.NewServer(grpc.ChainUnaryInterceptor(
		authInterceptor,
	))
	sandboxapi.NewRegisteredImplementation(grpcSrv, a.Service)
	reflection.Register(grpcSrv)

	grpcErrCh := make(chan error, 1)
	go func() {
		a.Logger.Info("grpc server starting", "addr", listenAddr)
		grpcErrCh <- grpcSrv.Serve(lis)
	}()

	httpMux := http.NewServeMux()
	httpMux.HandleFunc("/healthz", ops.HealthzHandler())
	httpMux.HandleFunc("/readyz", ops.ReadyzHandler(ops.PingPostgres(a.Postgres.Pool)))
	httpMux.Handle("/metrics", ops.MetricsHandler())

	if err := sandboxapi.RegisterGateway(ctx, httpMux, dialAddr); err != nil {
		grpcSrv.Stop()
		<-grpcErrCh
		return fmt.Errorf("register gateway: %w", err)
	}

	httpAddr := fmt.Sprintf(":%d", a.Config.HTTPPort)
	handler := ops.InstrumentHTTP("sandbox", httpMux)
	handler = ops.CORS(a.Config.CORSAllowedOrigins, handler)
	srv := &http.Server{
		Addr:              httpAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	a.Logger.Info("http server starting", "addr", httpAddr)

	httpErrCh := make(chan error, 1)
	go func() {
		httpErrCh <- srv.ListenAndServe()
	}()

	var serveErr error
	grpcExited := false
	httpExited := false
	select {
	case <-ctx.Done():
	case err := <-grpcErrCh:
		grpcExited = true
		if err == nil {
			serveErr = errors.New("grpc server stopped unexpectedly")
		} else if !errors.Is(err, grpc.ErrServerStopped) {
			serveErr = fmt.Errorf("serve grpc: %w", err)
		}
	case err := <-httpErrCh:
		httpExited = true
		if err == nil {
			serveErr = errors.New("http server stopped unexpectedly")
		} else if !errors.Is(err, http.ErrServerClosed) {
			serveErr = fmt.Errorf("serve http: %w", err)
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	grpcDone := make(chan struct{})
	go func() {
		gracefulStopGRPC(grpcSrv, 10*time.Second)
		close(grpcDone)
	}()
	shutdownErr := srv.Shutdown(shutdownCtx)
	<-grpcDone
	if !grpcExited {
		if err := <-grpcErrCh; err != nil && !errors.Is(err, grpc.ErrServerStopped) && serveErr == nil {
			serveErr = fmt.Errorf("serve grpc: %w", err)
		}
	}
	if !httpExited {
		if err := <-httpErrCh; err != nil && !errors.Is(err, http.ErrServerClosed) && serveErr == nil {
			serveErr = fmt.Errorf("serve http: %w", err)
		}
	}

	if serveErr != nil {
		return serveErr
	}
	if shutdownErr != nil {
		return fmt.Errorf("shutdown http: %w", shutdownErr)
	}
	return nil
}

func gracefulStopGRPC(server *grpc.Server, timeout time.Duration) {
	done := make(chan struct{})
	go func() {
		server.GracefulStop()
		close(done)
	}()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-done:
	case <-timer.C:
		server.Stop()
		<-done
	}
}
