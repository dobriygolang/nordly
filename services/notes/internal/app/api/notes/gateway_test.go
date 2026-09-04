package notesapi

import (
	"context"
	"net/http"
	"testing"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/metadata"
)

func TestGatewayAppendsHTTPPeerToForwardedFor(t *testing.T) {
	t.Parallel()

	request, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "http://notes.test", nil)
	require.NoError(t, err)
	request.Header.Set("X-Forwarded-For", "198.51.100.10")
	request.RemoteAddr = "203.0.113.20:4321"
	mux := runtime.NewServeMux(runtime.WithIncomingHeaderMatcher(incomingHeaderMatcher))

	annotated, err := runtime.AnnotateContext(
		context.Background(),
		mux,
		request,
		"/notes.v1.NotesService/AccessPublishedNote",
	)
	require.NoError(t, err)
	md, ok := metadata.FromOutgoingContext(annotated)
	require.True(t, ok)
	require.Equal(t, []string{"198.51.100.10, 203.0.113.20"}, md.Get("x-forwarded-for"))
}
