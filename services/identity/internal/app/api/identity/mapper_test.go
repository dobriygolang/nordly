package identityapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/identity/internal/adapter/telegram"
	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	devicemodel "github.com/dobriygolang/project-nordly/services/identity/internal/device/model"
	usermodel "github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

func TestMappersRejectNilSuccessValues(t *testing.T) {
	t.Parallel()
	_, err := toProtoUser(nil)
	require.Error(t, err)

	_, err = toAuthResponse(nil)
	require.Error(t, err)

	_, err = toAuthResponse(&authmodel.AuthResult{})
	require.Error(t, err)

	_, err = toProtoUser(&usermodel.User{ID: "not-a-uuid"})
	require.Error(t, err)
}

func TestUserMapperRequiresStoredTelegramAvatarAndKeepsTimezone(t *testing.T) {
	t.Parallel()
	user := &usermodel.User{
		ID:        "550e8400-e29b-41d4-a716-446655440000",
		AvatarURL: telegram.StoreRef("photos/avatar.jpg"),
		Timezone:  "Europe/Moscow",
	}

	mapped, err := toProtoUser(user)
	require.NoError(t, err)
	require.Equal(t, "/v1/users/"+user.ID+"/avatar", mapped.GetAvatarUrl())
	require.Equal(t, user.Timezone, mapped.GetTimezone())

	user.AvatarURL = "https://example.com/avatar.jpg"
	_, err = toProtoUser(user)
	require.Error(t, err)
}

func TestMapDeviceErrorTreatsMissingUserAsUnauthorized(t *testing.T) {
	t.Parallel()
	recorder := httptest.NewRecorder()
	mapDeviceError(recorder, devicemodel.ErrNotFound)

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	require.Contains(t, recorder.Body.String(), `"code":"unauthorized"`)
}
