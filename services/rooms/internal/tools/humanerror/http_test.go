package humanerror

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestWriteHTTPMapsFailedPreconditionToGone(t *testing.T) {
	t.Parallel()

	response := httptest.NewRecorder()
	WriteHTTP(response, status.Error(codes.FailedPrecondition, "room expired"))

	require.Equal(t, http.StatusGone, response.Code)
	require.JSONEq(t, `{"message":"room expired"}`, response.Body.String())
}
