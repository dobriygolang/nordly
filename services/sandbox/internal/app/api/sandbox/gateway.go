package sandboxapi

import (
	"context"
	"net/http"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/tools/humanerror"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// gatewayServeMuxOptions is the production grpc-gateway setup.
// Authorization is forwarded once by grpc-gateway itself (runtime/context.go).
// Copying it again with WithMetadata yields two metadata values, and
// bearerTokenFromMetadata rejects that as unauthenticated — every guest run
// then returns HTTP 401.
func gatewayServeMuxOptions() []runtime.ServeMuxOption {
	return []runtime.ServeMuxOption{
		runtime.WithErrorHandler(func(
			ctx context.Context,
			_ *runtime.ServeMux,
			_ runtime.Marshaler,
			w http.ResponseWriter,
			_ *http.Request,
			err error,
		) {
			humanerror.WriteHTTP(w, err)
		}),
	}
}

func newGatewayMux(ctx context.Context, endpoint string) (http.Handler, error) {
	mux := runtime.NewServeMux(gatewayServeMuxOptions()...)
	opts := []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}
	if err := sandboxv1.RegisterSandboxServiceHandlerFromEndpoint(ctx, mux, endpoint, opts); err != nil {
		return nil, err
	}
	return mux, nil
}

// RegisterGateway mounts grpc-gateway handlers.
func RegisterGateway(ctx context.Context, mux *http.ServeMux, endpoint string) error {
	gw, err := newGatewayMux(ctx, endpoint)
	if err != nil {
		return err
	}
	mux.Handle("/v1/", gw)
	return nil
}
