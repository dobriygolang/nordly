package sandboxapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/metadata"
)

func TestGatewayForwardsAuthorizationOnce(t *testing.T) {
	t.Parallel()

	mux := runtime.NewServeMux(gatewayServeMuxOptions()...)
	req := httptest.NewRequest(http.MethodPost, "/v1/sandbox/code-runs", nil)
	req.Header.Set("Authorization", "Bearer guest-token")

	ctx, err := runtime.AnnotateIncomingContext(
		context.Background(),
		mux,
		req,
		"/sandbox.v1.SandboxService/RunCode",
	)
	require.NoError(t, err)

	md, ok := metadata.FromIncomingContext(ctx)
	require.True(t, ok)
	require.Equal(t, []string{"Bearer guest-token"}, md.Get("authorization"))
	require.Equal(t, "guest-token", bearerTokenFromMetadata(ctx))
}
