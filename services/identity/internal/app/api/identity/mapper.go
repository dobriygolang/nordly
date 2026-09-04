package identityapi

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/dobriygolang/project-nordly/services/identity/internal/adapter/telegram"
	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	authservice "github.com/dobriygolang/project-nordly/services/identity/internal/auth/service"
	"github.com/dobriygolang/project-nordly/services/identity/internal/tools/humanerror"
	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func toProtoUser(user *model.User) (*identityv1.User, error) {
	if user == nil {
		return nil, errors.New("map user: nil user")
	}
	if err := identityjwt.ValidateSubject(user.ID); err != nil {
		return nil, fmt.Errorf("map user id: %w", err)
	}
	avatarPath, err := telegramAvatarPath(user.AvatarURL)
	if err != nil {
		return nil, err
	}
	avatarURL := ""
	if avatarPath != "" {
		avatarURL = fmt.Sprintf("/v1/users/%s/avatar", user.ID)
	}

	out := &identityv1.User{
		Id:        user.ID,
		Username:  user.Username,
		AvatarUrl: avatarURL,
		CreatedAt: timestamppb.New(user.CreatedAt),
	}
	if user.TelegramID != nil {
		out.TelegramId = *user.TelegramID
	}
	if user.Timezone != "" {
		out.Timezone = user.Timezone
	}
	return out, nil
}

func telegramAvatarPath(stored string) (string, error) {
	if stored == "" {
		return "", nil
	}
	path, ok := telegram.ParseStoreRef(stored)
	if !ok || path == "" {
		return "", errors.New("invalid stored avatar reference")
	}
	return path, nil
}

func toAuthResponse(result *authmodel.AuthResult) (*identityv1.AuthResponse, error) {
	if result == nil {
		return nil, errors.New("map auth response: nil result")
	}
	user, err := toProtoUser(result.User)
	if err != nil {
		return nil, err
	}
	return &identityv1.AuthResponse{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		User:         user,
	}, nil
}

func mapServiceError(err error) error {
	switch {
	case errors.Is(err, authservice.ErrNotFound):
		return notFound(err.Error())
	case errors.Is(err, authservice.ErrUnauthorized):
		return unauthorized()
	case errors.Is(err, authservice.ErrInvalidLoginCode),
		errors.Is(err, authservice.ErrInvalidRefreshToken),
		errors.Is(err, authservice.ErrInvalidArgument):
		return status.Error(codes.InvalidArgument, err.Error())
	default:
		return status.Error(codes.Internal, "internal error")
	}
}

func writeHTTPError(w http.ResponseWriter, err error) {
	humanerror.WriteHTTP(w, err)
}
