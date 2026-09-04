package sandboxapi

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func mapServiceError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, model.ErrInvalidInput):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, model.ErrForbidden):
		return status.Error(codes.PermissionDenied, err.Error())
	case errors.Is(err, model.ErrNotFound):
		return status.Error(codes.NotFound, err.Error())
	case errors.Is(err, model.ErrConcurrencyExceeded), errors.Is(err, model.ErrRateExceeded):
		return status.Error(codes.ResourceExhausted, err.Error())
	case errors.Is(err, model.ErrClaimLost):
		return status.Error(codes.Aborted, err.Error())
	case errors.Is(err, context.Canceled):
		return status.Error(codes.Canceled, context.Canceled.Error())
	case errors.Is(err, context.DeadlineExceeded):
		return status.Error(codes.DeadlineExceeded, context.DeadlineExceeded.Error())
	default:
		return status.Error(codes.Internal, err.Error())
	}
}

func unauthorized() error {
	return status.Error(codes.Unauthenticated, "unauthorized")
}

func permissionDenied(message string) error {
	return status.Error(codes.PermissionDenied, message)
}

func invalidArgument(message string) error {
	return status.Error(codes.InvalidArgument, message)
}
