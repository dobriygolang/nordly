package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	billingadapter "github.com/dobriygolang/project-nordly/services/identity/internal/adapter/billing"
	billingmocks "github.com/dobriygolang/project-nordly/services/identity/internal/adapter/billing/mocks"
	devicemodel "github.com/dobriygolang/project-nordly/services/identity/internal/device/model"
	devicemocks "github.com/dobriygolang/project-nordly/services/identity/internal/device/repository/mocks"
)

func TestRegisterDeviceDelegatesLimitCheckToAtomicRepository(t *testing.T) {
	t.Parallel()
	limit := 2
	repo := devicemocks.NewStore(t)
	billing := billingmocks.NewClient(t)
	billing.EXPECT().
		CheckFeature(mock.Anything, "user-1", billingadapter.EntitlementCloudSyncEnabled).
		Return(true, nil)
	billing.EXPECT().
		GetGaugeLimit(mock.Anything, "user-1", billingadapter.EntitlementCloudSyncDevices).
		Return(billingadapter.GaugeLimit{Limit: &limit}, nil)
	repo.EXPECT().
		RegisterDevice(mock.Anything, "user-1", "device-1", "Nordly", "1.0.0", limit).
		Return(2, nil)

	svc := New(Deps{Repo: repo, Billing: billing})
	result, err := svc.RegisterDevice(context.Background(), "user-1", "device-1", "Nordly", "1.0.0")
	require.NoError(t, err)
	require.Equal(t, 2, result.DevicesRegistered)
	require.Equal(t, limit, result.DeviceLimit)
}

func TestRegisterDeviceReturnsAtomicLimitFailure(t *testing.T) {
	t.Parallel()
	limit := 1
	repo := devicemocks.NewStore(t)
	billing := billingmocks.NewClient(t)
	billing.EXPECT().
		CheckFeature(mock.Anything, "user-1", billingadapter.EntitlementCloudSyncEnabled).
		Return(true, nil)
	billing.EXPECT().
		GetGaugeLimit(mock.Anything, "user-1", billingadapter.EntitlementCloudSyncDevices).
		Return(billingadapter.GaugeLimit{Limit: &limit}, nil)
	repo.EXPECT().
		RegisterDevice(mock.Anything, "user-1", "device-2", "", "", limit).
		Return(0, devicemodel.ErrDeviceLimitExceeded)

	svc := New(Deps{Repo: repo, Billing: billing})
	_, err := svc.RegisterDevice(context.Background(), "user-1", "device-2", "", "")
	require.ErrorIs(t, err, devicemodel.ErrDeviceLimitExceeded)
}
