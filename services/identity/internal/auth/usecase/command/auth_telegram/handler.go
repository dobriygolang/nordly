package auth_telegram

import (
	"context"
	"errors"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	authrepo "github.com/dobriygolang/project-nordly/services/identity/internal/auth/repository"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/metrics"
	usermodel "github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
	userrepo "github.com/dobriygolang/project-nordly/services/identity/internal/user/repository"
)

// LoginCodeStore consumes one-time Telegram login codes.
type LoginCodeStore interface {
	Consume(ctx context.Context, code string) (*authmodel.TelegramLoginCode, error)
}

// UserStore loads and upserts users for Telegram login.
type UserStore interface {
	GetByTelegramID(ctx context.Context, telegramID int64) (*usermodel.User, error)
	Create(ctx context.Context, user *usermodel.User) (*usermodel.User, error)
	Update(ctx context.Context, user *usermodel.User) (*usermodel.User, error)
}

// TokenIssuer mints access and refresh tokens for a user.
type TokenIssuer interface {
	Issue(ctx context.Context, user *usermodel.User) (*authmodel.AuthResult, error)
}

// UsernameAllocator picks a unique username from candidates.
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
func New(cfg Config) *Handler {
	if cfg.LoginCodes == nil {
		panic("auth_telegram: LoginCodes is required")
	}
	if cfg.Users == nil {
		panic("auth_telegram: Users is required")
	}
	if cfg.Tokens == nil {
		panic("auth_telegram: Tokens is required")
	}
	if cfg.Usernames == nil {
		panic("auth_telegram: Usernames is required")
	}
	return &Handler{
		loginCodes: cfg.LoginCodes,
		users:      cfg.Users,
		tokens:     cfg.Tokens,
		usernames:  cfg.Usernames,
	}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*authmodel.AuthResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	loginCode, err := h.loginCodes.Consume(ctx, cmd.Code)
	if err != nil {
		if errors.Is(err, authrepo.ErrNotFound) {
			metrics.IncAuth("telegram", "invalid_code")
			return nil, authmodel.ErrInvalidLoginCode
		}
		return nil, err
	}

	user, err := h.users.GetByTelegramID(ctx, loginCode.TelegramID)
	if err != nil {
		if !errors.Is(err, userrepo.ErrNotFound) {
			return nil, err
		}

		username, err := h.usernames.Allocate(ctx, telegramUsernameCandidates(
			loginCode.FirstName,
			loginCode.LastName,
			loginCode.Username,
		)...)
		if err != nil {
			return nil, err
		}

		telegramID := loginCode.TelegramID
		user, err = h.users.Create(ctx, &usermodel.User{
			Username:   username,
			TelegramID: &telegramID,
			AvatarURL:  loginCode.AvatarURL,
		})
		if err != nil {
			if errors.Is(err, userrepo.ErrAlreadyExists) {
				user, err = h.users.GetByTelegramID(ctx, telegramID)
			}
			if err != nil {
				return nil, err
			}
		}
		return h.issueOK(ctx, user)
	}

	if loginCode.AvatarURL != "" {
		user.AvatarURL = pickAvatar(user.AvatarURL, loginCode.AvatarURL)
		user, err = h.users.Update(ctx, user)
		if err != nil {
			return nil, err
		}
	}

	return h.issueOK(ctx, user)
}

func (h *Handler) issueOK(ctx context.Context, user *usermodel.User) (*authmodel.AuthResult, error) {
	result, err := h.tokens.Issue(ctx, user)
	if err == nil {
		metrics.IncAuth("telegram", "ok")
	}
	return result, err
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

func pickAvatar(current, telegram string) string {
	if telegram != "" {
		return telegram
	}
	return current
}
