package service

import (
	"context"
	"errors"
	"testing"

	billingadapter "github.com/dobriygolang/project-nordly/services/identity/internal/adapter/billing"
	devicemodel "github.com/dobriygolang/project-nordly/services/identity/internal/device/model"
)

type fakeDeviceRepo struct {
	count     int
	err       error
	called    bool
	gotLimit  int
	gotDevice string
}

func (r *fakeDeviceRepo) RegisterDevice(_ context.Context, _, deviceID, _, _ string, limit int) (int, error) {
	r.called = true
	r.gotDevice = deviceID
	r.gotLimit = limit
	return r.count, r.err
}

type fakeBilling struct {
	enabled bool
	limit   billingadapter.GaugeLimit
	err     error
}

func (b fakeBilling) CheckFeature(context.Context, string, string) (bool, error) {
	return b.enabled, b.err
}

func (b fakeBilling) GetGaugeLimit(context.Context, string, string) (billingadapter.GaugeLimit, error) {
	return b.limit, b.err
}

func TestRegisterDeviceDelegatesLimitCheckToAtomicRepository(t *testing.T) {
	t.Parallel()
	limit := 2
	repo := &fakeDeviceRepo{count: 2}
	svc := New(Deps{
		Repo: repo,
		Billing: fakeBilling{
			enabled: true,
			limit:   billingadapter.GaugeLimit{Limit: &limit},
		},
	})

	result, err := svc.RegisterDevice(context.Background(), "user-1", "device-1", "Nordly", "1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	if !repo.called || repo.gotLimit != limit || repo.gotDevice != "device-1" {
		t.Fatalf("registration was not delegated atomically: %+v", repo)
	}
	if result.DevicesRegistered != 2 || result.DeviceLimit != limit {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestRegisterDeviceReturnsAtomicLimitFailure(t *testing.T) {
	t.Parallel()
	limit := 1
	repo := &fakeDeviceRepo{err: devicemodel.ErrDeviceLimitExceeded}
	svc := New(Deps{
		Repo: repo,
		Billing: fakeBilling{
			enabled: true,
			limit:   billingadapter.GaugeLimit{Limit: &limit},
		},
	})

	_, err := svc.RegisterDevice(context.Background(), "user-1", "device-2", "", "")
	if !errors.Is(err, devicemodel.ErrDeviceLimitExceeded) {
		t.Fatalf("expected device limit error, got %v", err)
	}
}
