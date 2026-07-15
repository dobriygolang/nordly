package service

import (
	"context"
	"errors"
	"strings"

	billingadapter "github.com/dobriygolang/project-nordly/services/identity/internal/adapter/billing"
	devicemodel "github.com/dobriygolang/project-nordly/services/identity/internal/device/model"
	devicerepo "github.com/dobriygolang/project-nordly/services/identity/internal/device/repository"
)

type RegisterResult struct {
	DeviceID          string
	CloudSyncEnabled  bool
	DeviceLimit       int
	DevicesRegistered int
}

type Service interface {
	RegisterDevice(ctx context.Context, userID, deviceID, name, appVersion string) (*RegisterResult, error)
}

type deviceService struct {
	repo    devicerepo.Store
	billing billingadapter.Client
}

type Deps struct {
	Repo    devicerepo.Store
	Billing billingadapter.Client
}

func New(deps Deps) Service {
	return &deviceService{repo: deps.Repo, billing: deps.Billing}
}

func (s *deviceService) RegisterDevice(
	ctx context.Context,
	userID, deviceID, name, appVersion string,
) (*RegisterResult, error) {
	userID = strings.TrimSpace(userID)
	deviceID = strings.TrimSpace(deviceID)
	if userID == "" || deviceID == "" {
		return nil, devicemodel.ErrInvalidArgument
	}

	enabled, err := s.billing.CheckFeature(ctx, userID, billingadapter.EntitlementCloudSyncEnabled)
	if err != nil {
		return nil, err
	}
	if !enabled {
		return nil, devicemodel.ErrCloudSyncDisabled
	}

	limitSpec, err := s.billing.GetGaugeLimit(ctx, userID, billingadapter.EntitlementCloudSyncDevices)
	if err != nil {
		return nil, err
	}
	deviceLimit := 0
	if limitSpec.Unlimited {
		deviceLimit = -1
	} else if limitSpec.Limit != nil {
		deviceLimit = *limitSpec.Limit
	} else {
		return nil, errors.New("billing: cloud_sync_devices limit missing")
	}
	if deviceLimit == 0 {
		return nil, devicemodel.ErrCloudSyncDisabled
	}

	count, err := s.repo.RegisterDevice(ctx, userID, deviceID, name, appVersion, deviceLimit)
	if err != nil {
		return nil, err
	}

	return &RegisterResult{
		DeviceID:          deviceID,
		CloudSyncEnabled:  true,
		DeviceLimit:       deviceLimit,
		DevicesRegistered: count,
	}, nil
}

func IsCloudSyncDisabled(err error) bool {
	return errors.Is(err, devicemodel.ErrCloudSyncDisabled)
}

func IsDeviceLimitExceeded(err error) bool {
	return errors.Is(err, devicemodel.ErrDeviceLimitExceeded)
}

func IsInvalidArgument(err error) bool {
	return errors.Is(err, devicemodel.ErrInvalidArgument)
}
