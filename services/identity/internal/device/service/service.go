package service

import (
	"context"
	"errors"
	"strings"

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
	repo devicerepo.Store
}

type Deps struct {
	Repo devicerepo.Store
}

func New(deps Deps) (Service, error) {
	if deps.Repo == nil {
		return nil, errors.New("device service: Repo is required")
	}
	return &deviceService{repo: deps.Repo}, nil
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

	count, err := s.repo.RegisterDevice(ctx, userID, deviceID, name, appVersion)
	if err != nil {
		return nil, err
	}

	return &RegisterResult{
		DeviceID:          deviceID,
		CloudSyncEnabled:  true,
		DeviceLimit:       -1,
		DevicesRegistered: count,
	}, nil
}

func IsInvalidArgument(err error) bool {
	return errors.Is(err, devicemodel.ErrInvalidArgument)
}

func IsNotFound(err error) bool {
	return errors.Is(err, devicemodel.ErrNotFound)
}
