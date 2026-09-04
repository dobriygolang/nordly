package bot

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/identity/internal/adapter/telegram"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/logincode"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

const (
	loginCodeTTLSeconds      = int(model.LoginCodeTTL / time.Second)
	loginCodeReserveAttempts = 8
	loginCodeGeneratedLength = 8
)

// LoginCodeStore reserves one-time Telegram login codes.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=LoginCodeStore --output=./mocks --outpkg=mocks --filename=login_code_store.go
type LoginCodeStore interface {
	Save(ctx context.Context, code string, data *model.TelegramLoginCode, ttlSeconds int) error
}

// CodeGenerator creates a random login code of the requested length.
type CodeGenerator func(length int) (string, error)

// Bot handles Telegram login code delivery.
type Bot struct {
	api        *tgbotapi.BotAPI
	loginCodes LoginCodeStore
}

// New constructs a Telegram bot.
func New(token string, loginCodes LoginCodeStore) (*Bot, error) {
	if loginCodes == nil {
		return nil, errors.New("telegram bot: LoginCodeStore is required")
	}
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("init telegram bot: %w", err)
	}
	return &Bot{
		api:        api,
		loginCodes: loginCodes,
	}, nil
}

// Run starts long-polling until context is cancelled.
func (b *Bot) Run(ctx context.Context) error {
	updateCfg := tgbotapi.NewUpdate(0)
	updateCfg.Timeout = 30
	updates := b.api.GetUpdatesChan(updateCfg)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case update, ok := <-updates:
			if !ok {
				return nil
			}
			if update.Message == nil {
				continue
			}
			if err := b.handleMessage(ctx, update.Message); err != nil {
				if update.Message.Chat != nil {
					_, _ = b.api.Send(tgbotapi.NewMessage(update.Message.Chat.ID, "Не удалось выдать код. Попробуйте позже."))
				}
			}
		}
	}
}

func (b *Bot) handleMessage(ctx context.Context, message *tgbotapi.Message) error {
	if !message.IsCommand() {
		return nil
	}

	command := message.Command()
	if command != "start" {
		return nil
	}

	args := strings.TrimSpace(message.CommandArguments())
	if args != "" && args != "login" {
		return nil
	}
	if message.From == nil {
		return errors.New("telegram login message has no sender")
	}
	if message.Chat == nil {
		return errors.New("telegram login message has no chat")
	}

	expiresAt := time.Now().UTC().Add(model.LoginCodeTTL)
	payload := &model.TelegramLoginCode{
		TelegramID: message.From.ID,
		FirstName:  message.From.FirstName,
		LastName:   message.From.LastName,
		Username:   message.From.UserName,
		AvatarURL:  resolveTelegramAvatar(b.api, message.From.ID),
		ExpiresAt:  expiresAt,
	}

	code, err := ReserveLoginCode(ctx, b.loginCodes, payload, logincode.Generate)
	if err != nil {
		return err
	}

	text := fmt.Sprintf("Код для входа: %s\n\nВведите его на сайте. Код действует 5 минут.", code)
	msg := tgbotapi.NewMessage(message.Chat.ID, text)
	_, err = b.api.Send(msg)
	return err
}

// ReserveLoginCode retries random generation when an atomic reservation collides.
func ReserveLoginCode(
	ctx context.Context,
	store LoginCodeStore,
	payload *model.TelegramLoginCode,
	generate CodeGenerator,
) (string, error) {
	for range loginCodeReserveAttempts {
		code, err := generate(loginCodeGeneratedLength)
		if err != nil {
			return "", fmt.Errorf("generate login code: %w", err)
		}
		err = store.Save(ctx, code, payload, loginCodeTTLSeconds)
		if err == nil {
			return code, nil
		}
		if !errors.Is(err, model.ErrLoginCodeCollision) {
			return "", err
		}
	}
	return "", fmt.Errorf("reserve login code: %w", model.ErrLoginCodeCollision)
}

func resolveTelegramAvatar(api *tgbotapi.BotAPI, userID int64) string {
	path, err := telegram.ProfilePhotoFilePath(api, userID)
	if err != nil || path == "" {
		return ""
	}
	return telegram.StoreRef(path)
}
