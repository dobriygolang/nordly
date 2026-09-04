package auth_telegram

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/metrics"
	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	usermodel "github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

const (
	createUserAttempts      = 8
	loginCodeRestoreTimeout = 2 * time.Second
)

// LoginCodeStore consumes one-time Telegram login codes and can put a code back.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=LoginCodeStore --output=./mocks --outpkg=mocks --filename=login_code_store.go
type LoginCodeStore interface {
	Consume(ctx context.Context, code string) (*authmodel.TelegramLoginCode, error)
	Save(ctx context.Context, code string, data *authmodel.TelegramLoginCode, ttlSeconds int) error
}

// UserStore loads and upserts users for Telegram login.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=UserStore --output=./mocks --outpkg=mocks --filename=user_store.go
type UserStore interface {
	GetByTelegramID(ctx context.Context, telegramID int64) (*usermodel.User, error)
	Create(ctx context.Context, user *usermodel.User) (*usermodel.User, error)
	Update(ctx context.Context, user *usermodel.User) (*usermodel.User, error)
}

// TokenIssuer mints access and refresh tokens for a user.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=TokenIssuer --output=./mocks --outpkg=mocks --filename=token_issuer.go
type TokenIssuer interface {
	Issue(ctx context.Context, user *usermodel.User) (*authmodel.AuthResult, error)
}

// UsernameAllocator picks a unique username from candidates.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=UsernameAllocator --output=./mocks --outpkg=mocks --filename=username_allocator.go
type UsernameAllocator interface {
	Allocate(ctx context.Context, candidates ...string) (string, error)
}

// Config is constructor input for Handler.
type Config struct {
	LoginCodes LoginCodeStore
	Users      UserStore
	Tokens     TokenIssuer
	Usernames  UsernameAllocator
}

// Handler executes Telegram code authentication.
type Handler struct {
	loginCodes LoginCodeStore
	users      UserStore
	tokens     TokenIssuer
	usernames  UsernameAllocator
}

// New constructs the auth-telegram handler.
func New(cfg Config) (*Handler, error) {
	if cfg.LoginCodes == nil {
		return nil, errors.New("auth_telegram: LoginCodes is required")
	}
	if cfg.Users == nil {
		return nil, errors.New("auth_telegram: Users is required")
	}
	if cfg.Tokens == nil {
		return nil, errors.New("auth_telegram: Tokens is required")
	}
	if cfg.Usernames == nil {
		return nil, errors.New("auth_telegram: Usernames is required")
	}
	return &Handler{
		loginCodes: cfg.LoginCodes,
		users:      cfg.Users,
		tokens:     cfg.Tokens,
		usernames:  cfg.Usernames,
	}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*authmodel.AuthResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	loginCode, err := h.loginCodes.Consume(ctx, cmd.Code)
	if err != nil {
		if errors.Is(err, authmodel.ErrCredentialNotFound) {
			metrics.IncAuth("telegram", "invalid_code")
			return nil, authmodel.ErrInvalidLoginCode
		}
		return nil, fmt.Errorf("consume login code: %w", err)
	}

	result, err := h.finish(ctx, loginCode)
	if err != nil {
		restoreCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), loginCodeRestoreTimeout)
		defer cancel()
		if rerr := restoreLoginCode(restoreCtx, h.loginCodes, cmd.Code, loginCode); rerr != nil {
			return nil, fmt.Errorf("%w (restore login code: %v)", err, rerr)
		}
		return nil, err
	}
	return result, nil
}

func restoreLoginCode(ctx context.Context, store LoginCodeStore, code string, loginCode *authmodel.TelegramLoginCode) error {
	remaining := time.Until(loginCode.ExpiresAt)
	if remaining <= 0 {
		return nil
	}
	ttl := int(math.Ceil(remaining.Seconds()))
	return store.Save(ctx, code, loginCode, ttl)
}

func (h *Handler) finish(ctx context.Context, loginCode *authmodel.TelegramLoginCode) (*authmodel.AuthResult, error) {
	user, err := h.users.GetByTelegramID(ctx, loginCode.TelegramID)
	if err != nil {
		if !errors.Is(err, usermodel.ErrNotFound) {
			return nil, fmt.Errorf("get user by telegram id: %w", err)
		}
		return h.createUser(ctx, loginCode)
	}

	if loginCode.AvatarURL != "" {
		user.AvatarURL = loginCode.AvatarURL
		user, err = h.users.Update(ctx, user)
		if err != nil {
			return nil, fmt.Errorf("update telegram avatar: %w", err)
		}
	}

	return h.issueOK(ctx, user)
}

func (h *Handler) createUser(ctx context.Context, loginCode *authmodel.TelegramLoginCode) (*authmodel.AuthResult, error) {
	candidates := telegramUsernameCandidates(loginCode.FirstName, loginCode.LastName, loginCode.Username)
	for range createUserAttempts {
		username, err := h.usernames.Allocate(ctx, candidates...)
		if err != nil {
			return nil, fmt.Errorf("allocate username: %w", err)
		}

		telegramID := loginCode.TelegramID
		user, err := h.users.Create(ctx, &usermodel.User{
			Username:   username,
			TelegramID: &telegramID,
			AvatarURL:  loginCode.AvatarURL,
		})
		switch {
		case err == nil:
			return h.issueOK(ctx, user)
		case errors.Is(err, usermodel.ErrUsernameAlreadyExists):
			continue
		case errors.Is(err, usermodel.ErrTelegramIDAlreadyExists):
			user, err = h.users.GetByTelegramID(ctx, telegramID)
			if err != nil {
				return nil, fmt.Errorf("load concurrent telegram user: %w", err)
			}
			return h.issueOK(ctx, user)
		default:
			return nil, fmt.Errorf("create user: %w", err)
		}
	}
	return nil, fmt.Errorf("create user after username retries: %w", usermodel.ErrUsernameAlreadyExists)
}

func (h *Handler) issueOK(ctx context.Context, user *usermodel.User) (*authmodel.AuthResult, error) {
	result, err := h.tokens.Issue(ctx, user)
	if err == nil {
		metrics.IncAuth("telegram", "ok")
	}
	if err != nil {
		return nil, fmt.Errorf("issue auth tokens: %w", err)
	}
	return result, nil
}

func telegramUsernameCandidates(firstName, lastName, username string) []string {
	if username != "" {
		return []string{username}
	}
	if firstName != "" && lastName != "" {
		return []string{firstName + lastName, firstName + "_" + lastName, firstName}
	}
	if firstName != "" {
		return []string{firstName}
	}
	return nil
}
