package service

import (
	"testing"

	"github.com/stretchr/testify/require"

	devicemocks "github.com/dobriygolang/project-nordly/services/identity/internal/device/repository/mocks"
)

func TestRegisterDeviceUpsertsWithoutQuota(t *testing.T) {
	t.Parallel()
	repo := devicemocks.NewStore(t)
	repo.EXPECT().
		RegisterDevice(t.Context(), "user-1", "device-1", "Nordly", "1.0.0").
		Return(2, nil)

	svc, err := New(Deps{Repo: repo})
	require.NoError(t, err)
	result, err := svc.RegisterDevice(t.Context(), "user-1", "device-1", "Nordly", "1.0.0")
	require.NoError(t, err)
	require.Equal(t, 2, result.DevicesRegistered)
	require.Equal(t, -1, result.DeviceLimit)
	require.True(t, result.CloudSyncEnabled)
}

func TestNewRequiresRepo(t *testing.T) {
	t.Parallel()
	_, err := New(Deps{})
	require.Error(t, err)
}
