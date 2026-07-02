package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	authrepo "github.com/dobriygolang/project-nordly/services/identity/internal/auth/repository"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/metrics"
	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
	userrepo "github.com/dobriygolang/project-nordly/services/identity/internal/user/repository"
)

// AuthResult is returned after successful authentication.
type AuthResult struct {
	AccessToken  string
	RefreshToken string
	User         *model.User
}

// Service handles identity authentication and user operations.
type Service interface {
	AuthTelegram(ctx context.Context, code string) (*AuthResult, error)
	RefreshToken(ctx context.Context, refreshToken string) (*AuthResult, error)
	GetUser(ctx context.Context, id string) (*model.User, error)
	GetUserByTelegramID(ctx context.Context, telegramID int64) (*model.User, error)
	ValidateToken(ctx context.Context, accessToken string) (string, error)
	MintScopedAccessToken(ctx context.Context, role, scope, displayName string, ttlSeconds int32) (accessToken, userID string, expiresIn int32, err error)
}

// Deps lists dependencies for the identity service.
type Deps struct {
	Users         *userrepo.Repository
	LoginCodes    *authrepo.LoginCodeRepository
	RefreshTokens *authrepo.RefreshTokenRepository
	Tokens        *TokenManager
	Log           interface {
		Info(msg string, keysAndValues ...any)
		Error(msg string, keysAndValues ...any)
	}
}

type service struct {
	users         *userrepo.Repository
	loginCodes    *authrepo.LoginCodeRepository
	refreshTokens *authrepo.RefreshTokenRepository
	tokens        *TokenManager
	log           interface {
		Info(msg string, keysAndValues ...any)
		Error(msg string, keysAndValues ...any)
	}
}

// New constructs the identity service.
func New(deps Deps) Service {
	return &service{
		users:         deps.Users,
		loginCodes:    deps.LoginCodes,
		refreshTokens: deps.RefreshTokens,
		tokens:        deps.Tokens,
		log:           deps.Log,
	}
}

func isUserNotFound(err error) bool {
	return errors.Is(err, userrepo.ErrNotFound)
}

func isAuthNotFound(err error) bool {
	return errors.Is(err, authrepo.ErrNotFound)
}

func (s *service) AuthTelegram(ctx context.Context, code string) (*AuthResult, error) {
	loginCode, err := s.loginCodes.Consume(ctx, code)
	if err != nil {
		if isAuthNotFound(err) {
			metrics.IncAuth("telegram", "invalid_code")
			return nil, ErrInvalidLoginCode
		}
		return nil, err
	}

	user, err := s.users.GetByTelegramID(ctx, loginCode.TelegramID)
	if err != nil {
		if !isUserNotFound(err) {
			return nil, err
		}

		username, err := AllocateUsername(ctx, s.users, telegramUsernameCandidates(
			loginCode.FirstName,
			loginCode.LastName,
			loginCode.Username,
		)...)
		if err != nil {
			return nil, err
		}

		telegramID := loginCode.TelegramID
		user, err = s.users.Create(ctx, &model.User{
			Username:   username,
			TelegramID: &telegramID,
			AvatarURL:  loginCode.AvatarURL,
		})
		if err != nil {
			if errors.Is(err, userrepo.ErrAlreadyExists) {
				user, err = s.users.GetByTelegramID(ctx, telegramID)
			}
			if err != nil {
				return nil, err
			}
		}
		return s.authTelegramOK(ctx, user)
	}

	if loginCode.AvatarURL != "" {
		user.AvatarURL = pickAvatar(user.AvatarURL, loginCode.AvatarURL)
		user, err = s.users.Update(ctx, user)
		if err != nil {
			return nil, err
		}
	}

	return s.authTelegramOK(ctx, user)
}

func (s *service) authTelegramOK(ctx context.Context, user *model.User) (*AuthResult, error) {
	result, err := s.issueTokens(ctx, user)
	if err == nil {
		metrics.IncAuth("telegram", "ok")
	}
	return result, err
}

func (s *service) RefreshToken(ctx context.Context, refreshToken string) (*AuthResult, error) {
	userID, err := s.refreshTokens.GetUserID(ctx, HashRefreshToken(refreshToken))
	if err != nil {
		if isAuthNotFound(err) {
			metrics.IncAuth("refresh", "invalid_token")
			return nil, ErrInvalidRefreshToken
		}
		return nil, err
	}

	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	result, err := s.issueTokens(ctx, user)
	if err != nil {
		return nil, err
	}

	if err := s.refreshTokens.Delete(ctx, HashRefreshToken(refreshToken)); err != nil {
		s.log.Error("failed to delete rotated refresh token", "err", err)
	}
	metrics.IncAuth("refresh", "ok")
	return result, nil
}

func (s *service) GetUser(ctx context.Context, id string) (*model.User, error) {
	user, err := s.users.GetByID(ctx, id)
	if err != nil {
		if isUserNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return user, nil
}

func (s *service) GetUserByTelegramID(ctx context.Context, telegramID int64) (*model.User, error) {
	if telegramID == 0 {
		return nil, ErrNotFound
	}
	user, err := s.users.GetByTelegramID(ctx, telegramID)
	if err != nil {
		if isUserNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return user, nil
}

func (s *service) ValidateToken(ctx context.Context, accessToken string) (string, error) {
	if accessToken == "" {
		return "", ErrUnauthorized
	}
	userID, err := s.tokens.ValidateAccessToken(accessToken)
	if err != nil {
		return "", ErrUnauthorized
	}
	if _, err := s.users.GetByID(ctx, userID); err != nil {
		if isUserNotFound(err) {
			return "", ErrUnauthorized
		}
		return "", err
	}
	return userID, nil
}

func (s *service) MintScopedAccessToken(
	_ context.Context,
	role, scope, displayName string,
	ttlSeconds int32,
) (string, string, int32, error) {
	if scope == "" {
		return "", "", 0, errors.New("scope is required")
	}
	if role == "" {
		role = "guest"
	}
	ttl := time.Duration(ttlSeconds) * time.Second
	if ttl <= 0 {
		ttl = s.tokens.AccessTTL()
	}
	guestID := uuid.New().String()
	token, err := s.tokens.IssueScopedAccessToken(guestID, role, scope, displayName, ttl)
	if err != nil {
		return "", "", 0, err
	}
	return token, guestID, int32(ttl.Seconds()), nil
}

func (s *service) issueTokens(ctx context.Context, user *model.User) (*AuthResult, error) {
	accessToken, err := s.tokens.IssueAccessToken(user.ID)
	if err != nil {
		return nil, err
	}

	refreshToken, refreshHash, err := s.tokens.NewRefreshToken()
	if err != nil {
		return nil, err
	}

	ttl := int(s.tokens.RefreshTTL().Seconds())
	if err := s.refreshTokens.Save(ctx, refreshHash, user.ID, ttl); err != nil {
		return nil, err
	}

	return &AuthResult{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user,
	}, nil
}
