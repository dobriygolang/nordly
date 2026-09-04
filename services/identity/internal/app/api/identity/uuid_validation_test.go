package identityapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestGetUserRejectsMalformedUUIDBeforeRepositoryLookup(t *testing.T) {
	t.Parallel()
	_, err := (&Implementation{}).GetUser(
		t.Context(),
		&identityv1.GetUserRequest{Id: "not-a-uuid"},
	)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}

func TestAvatarRejectsMalformedUUIDBeforeRepositoryLookup(t *testing.T) {
	t.Parallel()
	request := httptest.NewRequest(http.MethodGet, "/v1/users/not-a-uuid/avatar", nil)
	request.SetPathValue("id", "not-a-uuid")
	recorder := httptest.NewRecorder()

	(&Implementation{}).UserAvatarHTTP().ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}
